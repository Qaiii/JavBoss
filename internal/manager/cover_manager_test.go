package manager

import (
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"javboss/internal/jav"
)

func TestCompactCoverProvidersExcludesNonLookupProviders(t *testing.T) {
	got := compactCoverProviders([]jav.Provider{
		jav.ProviderUnknown,
		jav.ProviderUser,
		jav.ProviderManualScrape,
		jav.ProviderJavBus,
	})
	if len(got) != 1 || got[0] != jav.ProviderJavBus {
		t.Fatalf("compact cover providers = %#v, want only JavBus", got)
	}
}

func TestSetCoverDownloadHeadersForJavBus(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "https://www.javbus.com/pics/cover/c85j_b.jpg", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}

	setCoverDownloadHeaders(req)

	if got := req.Header.Get("Referer"); got != "https://www.javbus.com/" {
		t.Fatalf("Referer = %q, want javbus referer", got)
	}
	if got := req.Header.Get("Cookie"); !strings.Contains(got, "age=verified") {
		t.Fatalf("Cookie = %q, want age verified cookie", got)
	}
	if got := req.Header.Get("User-Agent"); !strings.Contains(got, "Chrome/") {
		t.Fatalf("User-Agent = %q, want browser user agent", got)
	}
}

func TestEnqueueDeduplicatesScheduledCodes(t *testing.T) {
	manager := &CoverManager{
		tasks:     make(chan string, 2),
		scheduled: make(map[string]struct{}),
	}

	manager.Enqueue("ABC-001")
	manager.Enqueue("abc-001")
	manager.Enqueue(" ABC-001 ")
	manager.Enqueue("ABC-002")

	if got := len(manager.tasks); got != 2 {
		t.Fatalf("queued tasks = %d, want 2", got)
	}
	if got := <-manager.tasks; got != "abc-001" {
		t.Fatalf("first task = %q, want normalized abc-001", got)
	}
	if got := <-manager.tasks; got != "abc-002" {
		t.Fatalf("second task = %q, want normalized abc-002", got)
	}

	manager.clearScheduled("ABC-001")
	manager.Enqueue("ABC-001")
	if got := len(manager.tasks); got != 1 {
		t.Fatalf("queued tasks after clear = %d, want 1", got)
	}
}

func TestDownloadCoverRejectsSmallFile(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write([]byte(strings.Repeat("x", int(minValidCoverSizeBytes)-1)))
	}))
	defer server.Close()

	manager := &CoverManager{coverDir: t.TempDir()}
	err := manager.downloadCover(context.Background(), "ABC-001", server.URL+"/small.jpg")
	if !errors.Is(err, errInvalidCover) {
		t.Fatalf("downloadCover error = %v, want errInvalidCover", err)
	}
	if _, err := os.Stat(filepath.Join(manager.coverDir, "abc-001.jpg")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("small cover should not be finalized, stat err=%v", err)
	}
}

func TestDownloadCoverFromURLReplacesExistingCover(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte(strings.Repeat("p", int(minValidCoverSizeBytes))))
	}))
	defer server.Close()

	coverDir := t.TempDir()
	oldPath := filepath.Join(coverDir, "abc-001.jpg")
	if err := os.WriteFile(oldPath, []byte(strings.Repeat("j", int(minValidCoverSizeBytes))), 0o644); err != nil {
		t.Fatalf("write old cover: %v", err)
	}

	if err := DownloadCoverFromURL(context.Background(), coverDir, "ABC-001", server.URL+"/cover"); err != nil {
		t.Fatalf("DownloadCoverFromURL: %v", err)
	}

	if _, err := os.Stat(oldPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("old cover should be removed, stat err=%v", err)
	}
	path, ok := FindCoverPath(coverDir, "ABC-001")
	if !ok {
		t.Fatal("new cover was not found")
	}
	if filepath.Base(path) != "abc-001.png" {
		t.Fatalf("new cover path = %q, want abc-001.png", path)
	}
}

func TestHandleTaskRetriesAfterSmallCover(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		switch r.URL.Path {
		case "/small.jpg":
			_, _ = w.Write([]byte(strings.Repeat("x", int(minValidCoverSizeBytes)-1)))
		case "/valid.jpg":
			_, _ = w.Write([]byte(strings.Repeat("y", int(minValidCoverSizeBytes))))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	originalLookup := lookupJavByCode
	calls := map[jav.Provider]int{}
	lookupJavByCode = func(code string, provider jav.Provider) (*jav.JavInfo, error) {
		calls[provider]++
		switch provider {
		case jav.ProviderJavDatabase:
			return &jav.JavInfo{CoverURL: server.URL + "/small.jpg"}, nil
		case jav.ProviderJavBus:
			return &jav.JavInfo{CoverURL: server.URL + "/valid.jpg"}, nil
		default:
			return nil, jav.ResourceNotFonud
		}
	}
	t.Cleanup(func() { lookupJavByCode = originalLookup })

	manager := &CoverManager{
		coverDir:  t.TempDir(),
		providers: []jav.Provider{jav.ProviderJavDatabase, jav.ProviderJavBus},
	}
	if err := manager.handleTask(context.Background(), "ABC-001"); err != nil {
		t.Fatalf("handleTask: %v", err)
	}

	if calls[jav.ProviderJavDatabase] != 1 || calls[jav.ProviderJavBus] != 1 {
		t.Fatalf("unexpected provider calls: %#v", calls)
	}
	info, err := os.Stat(filepath.Join(manager.coverDir, "abc-001.jpg"))
	if err != nil {
		t.Fatalf("stat final cover: %v", err)
	}
	if info.Size() != minValidCoverSizeBytes {
		t.Fatalf("final cover size = %d, want %d", info.Size(), minValidCoverSizeBytes)
	}
}

func TestParseCoverKind(t *testing.T) {
	if got := ParseCoverKind("portrait"); got != CoverKindPortrait {
		t.Fatalf("ParseCoverKind(portrait) = %q", got)
	}
	if got := ParseCoverKind("LANDSCAPE"); got != CoverKindLandscape {
		t.Fatalf("ParseCoverKind(LANDSCAPE) = %q", got)
	}
	if got := ParseCoverKind(""); got != CoverKindLandscape {
		t.Fatalf("ParseCoverKind() = %q", got)
	}
}

func TestEnsurePosterCoverCropsLandscape(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "abc-001.jpg")
	writeTestJPEG(t, src, 800, 538)
	path, ok := EnsurePosterCover(dir, "ABC-001")
	if !ok {
		t.Fatal("expected poster cover to be generated")
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open poster: %v", err)
	}
	defer file.Close()
	img, _, err := image.Decode(file)
	if err != nil {
		t.Fatalf("decode poster: %v", err)
	}
	wantWidth := 538 * 2 / 3
	if img.Bounds().Dx() != wantWidth || img.Bounds().Dy() != 538 {
		t.Fatalf("poster size = %dx%d, want %dx538", img.Bounds().Dx(), img.Bounds().Dy(), wantWidth)
	}
	if _, ok := FindCoverPathKind(dir, "ABC-001", CoverKindPortrait); !ok {
		t.Fatal("generated poster should be findable")
	}
}

func TestEnsurePosterCoverSkipsPortraitSource(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "abc-001.jpg")
	writeTestJPEG(t, src, 400, 600)
	if _, ok := EnsurePosterCover(dir, "ABC-001"); ok {
		t.Fatal("portrait source should not produce a cropped poster")
	}
}

func writeTestJPEG(t *testing.T, path string, width, height int) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: uint8(x + y), A: 255})
		}
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create jpeg: %v", err)
	}
	defer file.Close()
	if err := jpeg.Encode(file, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
}
