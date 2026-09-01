//go:build live

package subtitle

import (
	"context"
	"testing"
)

// TestLiveJavSubSearch exercises the real javsubtitle.com endpoints. It is
// excluded from normal runs with the "live" build tag.
func TestLiveJavSubSearch(t *testing.T) {
	movies, err := SearchJavSubMovies(context.Background(), "SSIS-480")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(movies) == 0 {
		t.Fatalf("search returned no movies")
	}
	t.Logf("search found %d movies", len(movies))
	found := false
	for _, m := range movies {
		t.Logf("- %s | %s | subs=%v | versions=%v", m.Code, m.Title, m.HasSubtitles, m.AvailableVersions)
		if m.Code == "ssis-480" {
			found = true
			title, subs, err := GetJavSubMovieDetail(context.Background(), m.Code)
			if err != nil {
				t.Fatalf("detail: %v", err)
			}
			t.Logf("detail %q: %d subtitles", title, len(subs))
			if len(subs) == 0 {
				t.Fatalf("no subtitles for ssis-480")
			}
			for _, s := range subs {
				t.Logf("  - %s | %s | %s", s.ID, s.Lang, s.Label)
			}
			data, err := DownloadJavSubVTT(context.Background(), m.Code, subs[0].ID)
			if err != nil {
				t.Fatalf("download: %v", err)
			}
			if len(data) == 0 {
				t.Fatalf("empty subtitle")
			}
			t.Logf("downloaded %d bytes: %.60s", len(data), string(data))
		}
	}
	if !found {
		t.Fatalf("ssis-480 not among results")
	}
}
