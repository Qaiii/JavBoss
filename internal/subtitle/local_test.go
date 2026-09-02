package subtitle

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListLocalSubtitlesOrdering(t *testing.T) {
	dir := t.TempDir()
	files := []string{
		"SSIS-480.mp4",
		"SSIS-480.srt",      // exact match
		"SSIS-480.cht.srt",  // prefix match
		"SSIS-480-1.srt",    // prefix match (version)
		"another-movie.srt", // unrelated
		"SSIS-480.ass",      // excluded (no browser support)
		"SSIS-480.vtt",      // prefix match, vtt
		"random.txt",        // ignored
	}
	for _, name := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	subs, err := ListLocalSubtitles(filepath.Join(dir, "SSIS-480.mp4"), "")
	if err != nil {
		t.Fatalf("ListLocalSubtitles: %v", err)
	}

	got := make([]string, 0, len(subs))
	for _, sub := range subs {
		got = append(got, sub.Name)
	}
	want := []string{"SSIS-480.srt", "SSIS-480.vtt", "SSIS-480-1.srt", "SSIS-480.cht.srt", "another-movie.srt"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order mismatch at %d: got %v, want %v", i, got, want)
		}
	}
	if subs[0].IsVTT {
		t.Fatalf("SSIS-480.srt reported as vtt")
	}
	if subs[0].Path == "" || subs[0].Name != "SSIS-480.srt" {
		t.Fatalf("bad path/name: %+v", subs[0])
	}
}

func TestListLocalSubtitlesFiltersByCode(t *testing.T) {
	dir := t.TempDir()
	files := []string{
		"SSIS-480.mp4",
		"SSIS-480.srt",     // contains the code
		"SSIS-480-2.srt",   // contains the code
		"SSIS-480.cht.srt", // contains the code
		"other-movie.srt",  // unrelated: hidden
		"ABP-123.srt",      // another JAV in the same folder: hidden
	}
	for _, name := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	subs, err := ListLocalSubtitles(filepath.Join(dir, "SSIS-480.mp4"), "SSIS-480")
	if err != nil {
		t.Fatalf("ListLocalSubtitles: %v", err)
	}
	got := make([]string, 0, len(subs))
	for _, sub := range subs {
		got = append(got, sub.Name)
	}
	want := []string{"SSIS-480.srt", "SSIS-480-2.srt", "SSIS-480.cht.srt"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("filter mismatch at %d: got %v, want %v", i, got, want)
		}
	}
}

func TestListLocalSubtitlesCaseInsensitiveCode(t *testing.T) {
	dir := t.TempDir()
	files := []string{
		"SSIS-480.mp4",
		"ssis-480.srt", // lower-case code in file name
		"random.srt",
	}
	for _, name := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	subs, err := ListLocalSubtitles(filepath.Join(dir, "SSIS-480.mp4"), "SSIS-480")
	if err != nil {
		t.Fatalf("ListLocalSubtitles: %v", err)
	}
	if len(subs) != 1 || subs[0].Name != "ssis-480.srt" {
		t.Fatalf("expected only ssis-480.srt, got %+v", subs)
	}
}

func TestNormalizeName(t *testing.T) {
	cases := map[string]string{
		"SSIS-480.mp4":       "ssis 480",
		"ssis_480.cht.srt":   "ssis 480 cht",
		"ABC.123 (720p).vtt": "abc 123 720p",
	}
	for input, want := range cases {
		if got := normalizeName(input); got != want {
			t.Fatalf("normalizeName(%q) = %q, want %q", input, got, want)
		}
	}
}
