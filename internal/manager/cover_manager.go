package manager

import (
	"context"
	"errors"
	"fmt"
	"image"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
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
const minValidPosterSizeBytes int64 = 1024

const posterFileSuffix = "-poster"

var errInvalidCover = errors.New("invalid cover")
var errNotLandscapeCover = errors.New("cover is not landscape")

// CoverKind identifies which orientation of a JAV cover to store or serve.
type CoverKind string

const (
	CoverKindLandscape CoverKind = "landscape"
	CoverKindPortrait  CoverKind = "portrait"
)

// ParseCoverKind normalizes a query/config value to a known cover orientation.
func ParseCoverKind(value string) CoverKind {
	if strings.EqualFold(strings.TrimSpace(value), string(CoverKindPortrait)) {
		return CoverKindPortrait
	}
	return CoverKindLandscape
}

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
	return m.ExistsKind(code, CoverKindLandscape)
}

// ExistsKind reports whether a cover file exists for the requested orientation.
func (m *CoverManager) ExistsKind(code string, kind CoverKind) bool {
	if m == nil {
		return false
	}
	_, ok := FindCoverPathKind(m.coverDir, code, kind)
	return ok
}

// EnsurePoster generates a portrait cover from the landscape file when possible.
func (m *CoverManager) EnsurePoster(code string) bool {
	if m == nil {
		return false
	}
	_, ok := EnsurePosterCover(m.coverDir, code)
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
		_, _ = EnsurePosterCover(m.coverDir, code)
		return nil
	}

	ctx, cancel := context.WithTimeout(parent, 45*time.Second)
	defer cancel()

	if err := m.downloadCoverFromProviders(ctx, code); err != nil {
		if errors.Is(err, util.ErrCachedNotFound) {
			return nil
		}
		return err
	}
	_, _ = EnsurePosterCover(m.coverDir, code)
	return nil
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
		posterURL := ""
		if info != nil {
			coverURL = strings.TrimSpace(info.CoverURL)
			posterURL = strings.TrimSpace(info.PosterURL)
			if posterURL == "" {
				posterURL = jav.DerivePosterURL(coverURL)
			}
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
		if posterURL != "" && !strings.EqualFold(posterURL, coverURL) {
			if err := m.downloadCoverKind(ctx, code, posterURL, CoverKindPortrait); err != nil {
				if !errors.Is(err, util.ErrCachedNotFound) && !errors.Is(err, errInvalidCover) {
					logging.Error("download poster failed: provider=%s code=%s err=%v", provider.String(), code, err)
				}
			}
		}
		_, _ = EnsurePosterCover(m.coverDir, code)
		return nil
	}
	if lastErr != nil {
		return fmt.Errorf("download cover from providers: %w", lastErr)
	}
	return util.ErrCachedNotFound
}

func (m *CoverManager) downloadCover(ctx context.Context, code, coverURL string) error {
	return m.downloadCoverKind(ctx, code, coverURL, "")
}

func (m *CoverManager) downloadCoverKind(ctx context.Context, code, coverURL string, kind CoverKind) error {
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
	if kind == "" {
		if written < minValidCoverSizeBytes {
			_ = os.Remove(tmp)
			return fmt.Errorf("%w: size %d below minimum %d", errInvalidCover, written, minValidCoverSizeBytes)
		}
		kind = classifyCoverFile(tmp)
	} else if written < minValidCoverBytes(kind) {
		_ = os.Remove(tmp)
		return fmt.Errorf("%w: size %d below minimum %d", errInvalidCover, written, minValidCoverBytes(kind))
	}
	target := filepath.Join(m.coverDir, coverFileBase(code, kind)+ext)
	removeCoverFilesKind(m.coverDir, code, kind)
	if err := os.Rename(tmp, target); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("finalize cover: %w", err)
	}
	if kind == CoverKindLandscape {
		removeCoverFilesKind(m.coverDir, code, CoverKindPortrait)
	}
	return nil
}

func minValidCoverBytes(kind CoverKind) int64 {
	if kind == CoverKindPortrait {
		return minValidPosterSizeBytes
	}
	return minValidCoverSizeBytes
}

func removeCoverFiles(coverDir, code string) {
	removeCoverFilesKind(coverDir, code, CoverKindLandscape)
}

func removeCoverFilesKind(coverDir, code string, kind CoverKind) {
	code = normalizeCode(code)
	if coverDir == "" || code == "" {
		return
	}
	base := coverFileBase(code, kind)
	for _, ext := range knownExts {
		_ = os.Remove(filepath.Join(coverDir, base+ext))
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

func coverFileBase(code string, kind CoverKind) string {
	code = normalizeCode(code)
	if kind == CoverKindPortrait {
		return code + posterFileSuffix
	}
	return code
}

func classifyCoverFile(path string) CoverKind {
	file, err := os.Open(path)
	if err != nil {
		return CoverKindLandscape
	}
	defer file.Close()
	img, _, err := image.Decode(file)
	if err != nil {
		return CoverKindLandscape
	}
	bounds := img.Bounds()
	if bounds.Dy() > bounds.Dx() {
		return CoverKindPortrait
	}
	return CoverKindLandscape
}

// FindCoverPathKind returns the existing cover file for the requested orientation.
func FindCoverPathKind(dir, code string, kind CoverKind) (string, bool) {
	code = normalizeCode(code)
	if code == "" {
		return "", false
	}
	minSize := minValidCoverBytes(kind)
	base := coverFileBase(code, kind)
	for _, ext := range knownExts {
		p := filepath.Join(dir, base+ext)
		info, err := os.Stat(p)
		if err == nil && info.Size() >= minSize {
			return p, true
		}
	}
	return "", false
}

// EnsurePosterCover returns an existing portrait cover, or crops one from the
// landscape cover when the landscape image is wider than it is tall.
func EnsurePosterCover(dir, code string) (string, bool) {
	if path, ok := FindCoverPathKind(dir, code, CoverKindPortrait); ok {
		return path, true
	}
	landscape, ok := FindCoverPath(dir, code)
	if !ok {
		return "", false
	}
	dest := filepath.Join(dir, coverFileBase(code, CoverKindPortrait)+".jpg")
	tmp := dest + ".tmp"
	if err := generatePosterFromLandscape(landscape, tmp); err != nil {
		_ = os.Remove(tmp)
		return "", false
	}
	info, err := os.Stat(tmp)
	if err != nil || info.Size() < minValidPosterSizeBytes {
		_ = os.Remove(tmp)
		return "", false
	}
	removeCoverFilesKind(dir, code, CoverKindPortrait)
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(tmp)
		return "", false
	}
	return dest, true
}

func generatePosterFromLandscape(srcPath, destPath string) error {
	file, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("open landscape cover: %w", err)
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		return fmt.Errorf("decode landscape cover: %w", err)
	}
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if height <= 0 || width <= height {
		return errNotLandscapeCover
	}
	posterWidth := height * 2 / 3
	if posterWidth < 1 {
		posterWidth = 1
	}
	if posterWidth > width {
		posterWidth = width
	}
	cropped := image.NewRGBA(image.Rect(0, 0, posterWidth, height))
	draw.Draw(cropped, cropped.Bounds(), img, image.Pt(bounds.Min.X, bounds.Min.Y), draw.Src)

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return fmt.Errorf("ensure poster dir: %w", err)
	}
	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create poster: %w", err)
	}
	if err := jpeg.Encode(out, cropped, &jpeg.Options{Quality: 90}); err != nil {
		out.Close()
		return fmt.Errorf("encode poster: %w", err)
	}
	if err := out.Close(); err != nil {
		return fmt.Errorf("close poster: %w", err)
	}
	return nil
}

func normalizeCode(code string) string {
	return strings.ToLower(strings.TrimSpace(code))
}

// FindCoverPath returns the existing landscape cover file path for the given code within dir.
func FindCoverPath(dir, code string) (string, bool) {
	return FindCoverPathKind(dir, code, CoverKindLandscape)
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
