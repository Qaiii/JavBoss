package manager

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"javboss/internal/common/logging"
	"javboss/internal/jav"
	"javboss/internal/util"
)

// CoverManager coordinates background cover downloads.
type CoverManager struct {
	tasks     chan string
	coverDir  string
	workers   int
	providers []jav.Provider
	mu        sync.Mutex
	scheduled map[string]struct{}
}

const minValidCoverSizeBytes int64 = 30 * 1024
const posterFileSuffix = "-poster"

var errInvalidCover = errors.New("invalid cover")

var lookupJavByCode = jav.LookupJavByCode

// NewCoverManager creates a manager when coverDir and providers are provided.
func NewCoverManager(coverDir string, providers []jav.Provider) *CoverManager {
	coverDir = strings.TrimSpace(coverDir)
	providers = compactCoverProviders(providers)
	if coverDir == "" || len(providers) == 0 {
		return nil
	}
	return &CoverManager{
		tasks:     make(chan string, 5000), // larger buffer to reduce producer blocking
		coverDir:  coverDir,
		workers:   8,
		providers: providers,
		scheduled: make(map[string]struct{}),
	}
}

// Start launches the worker; safe to call with nil manager.
func (m *CoverManager) Start(ctx context.Context) {
	if m == nil {
		return
	}
	if m.workers <= 0 {
		m.workers = 1
	}
	for i := 0; i < m.workers; i++ {
		go m.worker(ctx)
	}
}

// Enqueue schedules a cover download; blocks when queue is full.
func (m *CoverManager) Enqueue(code string) {
	if m == nil {
		return
	}
	code = normalizeCode(code)
	if code == "" {
		return
	}
	if m.tasks == nil {
		return
	}

	m.mu.Lock()
	if m.scheduled == nil {
		m.scheduled = make(map[string]struct{})
	}
	if _, ok := m.scheduled[code]; ok {
		m.mu.Unlock()
		return
	}
	m.scheduled[code] = struct{}{}
	m.mu.Unlock()

	m.tasks <- code
}

// TryEnqueue schedules a cover download without blocking when the queue is full.
// It returns true when the code is already scheduled or was accepted.
func (m *CoverManager) TryEnqueue(code string) bool {
	if m == nil {
		return false
	}
	code = normalizeCode(code)
	if code == "" || m.tasks == nil {
		return false
	}

	m.mu.Lock()
	if m.scheduled == nil {
		m.scheduled = make(map[string]struct{})
	}
	if _, ok := m.scheduled[code]; ok {
		m.mu.Unlock()
		return true
	}
	m.scheduled[code] = struct{}{}
	m.mu.Unlock()

	select {
	case m.tasks <- code:
		return true
	default:
		m.clearScheduled(code)
		return false
	}
}

// PendingCount returns how many cover downloads are queued or in flight.
func (m *CoverManager) PendingCount() int {
	if m == nil {
		return 0
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.scheduled)
}

// Exists reports whether a cover file already exists for the code (any known extension).
func (m *CoverManager) Exists(code string) bool {
	if m == nil {
		return false
	}
	_, ok := FindCoverPath(m.coverDir, code)
	return ok
}

func (m *CoverManager) worker(ctx context.Context) {
	if m == nil {
		return
	}
	_ = os.MkdirAll(m.coverDir, 0o755)
	for {
		select {
		case <-ctx.Done():
			return
		case code := <-m.tasks:
			func() {
				defer m.clearScheduled(code)
				if err := m.handleTask(ctx, code); err != nil {
					logging.Error("jav cover: code=%s err=%v", code, err)
				}
			}()
		}
	}
}

func (m *CoverManager) clearScheduled(code string) {
	if m == nil {
		return
	}
	code = normalizeCode(code)
	if code == "" {
		return
	}
	m.mu.Lock()
	delete(m.scheduled, code)
	m.mu.Unlock()
}

func (m *CoverManager) handleTask(parent context.Context, code string) error {
	code = normalizeCode(code)
	if code == "" {
		return errors.New("empty code")
	}
	if m.Exists(code) {
		return nil
	}

	ctx, cancel := context.WithTimeout(parent, 45*time.Second)
	defer cancel()
	return m.downloadCoverFromProviders(ctx, code)
}

func (m *CoverManager) downloadCoverFromProviders(ctx context.Context, code string) error {
	if m == nil {
		return errors.New("cover manager not configured")
	}
	var lastErr error
	for _, provider := range m.providers {
		info, err := lookupJavByCode(code, provider)
		if err != nil {
			if errors.Is(err, jav.ResourceNotFonud) {
				continue
			}
			lastErr = err
			logging.Error("fetch cover metadata failed: provider=%s code=%s err=%v", provider.String(), code, err)
			continue
		}

		coverURL := ""
		if info != nil {
			coverURL = strings.TrimSpace(info.CoverURL)
		}
		if coverURL == "" {
			continue
		}
		if err := m.downloadCover(ctx, code, coverURL); err != nil {
			if errors.Is(err, util.ErrCachedNotFound) || errors.Is(err, errInvalidCover) {
				lastErr = err
				continue
			}
			lastErr = err
			logging.Error("download cover failed: provider=%s code=%s err=%v", provider.String(), code, err)
			continue
		}
		return nil
	}
	if lastErr != nil {
		return fmt.Errorf("download cover from providers: %w", lastErr)
	}
	return util.ErrCachedNotFound
}

func (m *CoverManager) downloadCover(ctx context.Context, code, coverURL string) error {
	code = normalizeCode(code)
	if code == "" {
		return errors.New("empty code")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, coverURL, nil)
	if err != nil {
		return fmt.Errorf("build cover request: %w", err)
	}
	setCoverDownloadHeaders(req)
	resp, err := util.DoRequest(req)
	if err != nil {
		if errors.Is(err, util.ErrCachedNotFound) {
			return err
		}
		return fmt.Errorf("download cover: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusNotFound {
			return util.ErrCachedNotFound
		}
		return fmt.Errorf("download cover: status %s", resp.Status)
	}

	ext := strings.ToLower(path.Ext(resp.Request.URL.Path))
	if ext == "" || len(ext) > 5 {
		ext = guessExt(resp.Header.Get("Content-Type"))
	}
	if ext == "" {
		ext = ".jpg"
	}

	if err := os.MkdirAll(m.coverDir, 0o755); err != nil {
		return fmt.Errorf("ensure cover dir: %w", err)
	}
	tmp := filepath.Join(m.coverDir, code+".download.tmp")
	out, err := os.Create(tmp)
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	written, err := io.Copy(out, resp.Body)
	if err != nil {
		out.Close()
		_ = os.Remove(tmp)
		return fmt.Errorf("write cover: %w", err)
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("close cover: %w", err)
	}
	if written < minValidCoverSizeBytes {
		_ = os.Remove(tmp)
		return fmt.Errorf("%w: size %d below minimum %d", errInvalidCover, written, minValidCoverSizeBytes)
	}
	target := filepath.Join(m.coverDir, code+ext)
	removeCoverFiles(m.coverDir, code)
	if err := os.Rename(tmp, target); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("finalize cover: %w", err)
	}
	return nil
}

func removeCoverFiles(coverDir, code string) {
	code = normalizeCode(code)
	if coverDir == "" || code == "" {
		return
	}
	for _, ext := range knownExts {
		_ = os.Remove(filepath.Join(coverDir, code+ext))
		_ = os.Remove(filepath.Join(coverDir, code+posterFileSuffix+ext))
	}
}

func setCoverDownloadHeaders(req *http.Request) {
	if req == nil || req.URL == nil {
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; JavCoverBot/1.0)")
	host := strings.ToLower(req.URL.Hostname())
	if host == "javbus.com" || strings.HasSuffix(host, ".javbus.com") {
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
		req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
		req.Header.Set("Referer", "https://www.javbus.com/")
		req.Header.Set("Cookie", "age=verified; existmag=mag")
	}
}

var knownExts = []string{".jpg", ".jpeg", ".png", ".webp"}

// DownloadCoverFromURL downloads a user-provided cover URL and replaces any existing cover for code.
func DownloadCoverFromURL(ctx context.Context, coverDir, code, coverURL string) error {
	coverDir = strings.TrimSpace(coverDir)
	code = normalizeCode(code)
	coverURL = strings.TrimSpace(coverURL)
	if coverDir == "" {
		return errors.New("cover dir is not configured")
	}
	if code == "" {
		return errors.New("empty code")
	}
	if coverURL == "" {
		return errors.New("cover url is required")
	}
	u, err := url.Parse(coverURL)
	if err != nil || u == nil || u.Hostname() == "" {
		return errors.New("invalid cover url")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("cover url must be http or https")
	}

	manager := &CoverManager{coverDir: coverDir}
	return manager.downloadCover(ctx, code, coverURL)
}

func normalizeCode(code string) string {
	return strings.ToLower(strings.TrimSpace(code))
}

// FindCoverPath returns the existing cover file path for the given code within dir.
func FindCoverPath(dir, code string) (string, bool) {
	code = normalizeCode(code)
	if code == "" {
		return "", false
	}
	for _, ext := range knownExts {
		p := filepath.Join(dir, code+ext)
		info, err := os.Stat(p)
		if err == nil && info.Size() >= minValidCoverSizeBytes {
			return p, true
		}
	}
	return "", false
}

func isKnownCoverExt(ext string) bool {
	ext = strings.ToLower(ext)
	for _, known := range knownExts {
		if ext == known {
			return true
		}
	}
	return false
}

func coverCodeFromFileName(name string) (string, bool) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" || strings.Contains(name, string(filepath.Separator)) {
		return "", false
	}
	if strings.HasSuffix(name, ".download.tmp") {
		code := strings.TrimSuffix(name, ".download.tmp")
		return code, code != ""
	}
	ext := filepath.Ext(name)
	if !isKnownCoverExt(ext) {
		return "", false
	}
	base := strings.TrimSuffix(name, ext)
	base = strings.TrimSuffix(base, posterFileSuffix)
	return base, base != ""
}

func fileIsInsideDir(filePath, dir string) bool {
	absFile, err := filepath.Abs(filePath)
	if err != nil {
		return false
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(absDir, absFile)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// CountUnusedCoverFiles counts cover images in coverDir whose codes are not in keepCodes.
// It never looks outside coverDir and ignores unrecognized files.
func CountUnusedCoverFiles(coverDir string, keepCodes map[string]struct{}) (int, error) {
	paths, err := listUnusedCoverFiles(coverDir, keepCodes)
	if err != nil {
		return 0, err
	}
	return len(paths), nil
}

// RemoveUnusedCoverFiles deletes unused cover images from coverDir only.
func RemoveUnusedCoverFiles(coverDir string, keepCodes map[string]struct{}) (int, error) {
	paths, err := listUnusedCoverFiles(coverDir, keepCodes)
	if err != nil {
		return 0, err
	}
	removed := 0
	for _, path := range paths {
		if err := os.Remove(path); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return removed, fmt.Errorf("remove unused cover: %w", err)
		}
		removed++
	}
	return removed, nil
}

func listUnusedCoverFiles(coverDir string, keepCodes map[string]struct{}) ([]string, error) {
	coverDir = strings.TrimSpace(coverDir)
	if coverDir == "" {
		return nil, nil
	}
	entries, err := os.ReadDir(coverDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read cover dir: %w", err)
	}
	var unused []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		code, ok := coverCodeFromFileName(entry.Name())
		if !ok {
			continue
		}
		if _, keep := keepCodes[code]; keep {
			continue
		}
		path := filepath.Join(coverDir, entry.Name())
		if !fileIsInsideDir(path, coverDir) {
			continue
		}
		unused = append(unused, path)
	}
	return unused, nil
}

func guessExt(ct string) string {
	ct = strings.ToLower(strings.TrimSpace(ct))
	switch {
	case strings.Contains(ct, "webp"):
		return ".webp"
	case strings.Contains(ct, "png"):
		return ".png"
	case strings.Contains(ct, "jpeg"), strings.Contains(ct, "jpg"):
		return ".jpg"
	default:
		return ""
	}
}

func compactCoverProviders(providers []jav.Provider) []jav.Provider {
	if len(providers) == 0 {
		return nil
	}
	compact := make([]jav.Provider, 0, len(providers))
	for _, provider := range providers {
		provider = jav.ParseProvider(int(provider))
		if provider != jav.ProviderUnknown && provider != jav.ProviderUser && provider != jav.ProviderManualScrape {
			compact = append(compact, provider)
		}
	}
	return compact
}
