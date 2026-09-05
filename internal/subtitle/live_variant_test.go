//go:build live

package subtitle

import (
	"context"
	"testing"
)

// TestLiveVariantCodeDetailFallback verifies that requesting detail for a
// variant code (which carries no subtitles itself) falls back to the base code.
func TestLiveVariantCodeDetailFallback(t *testing.T) {
	cases := []string{
		"waaa-366-chinese-subtitle",
		"ssis-480-uncensored-leak",
	}
	for _, code := range cases {
		t.Run(code, func(t *testing.T) {
			title, subs, err := GetJavSubMovieDetail(context.Background(), code)
			if err != nil {
				t.Fatalf("detail: %v", err)
			}
			if len(subs) == 0 {
				t.Fatalf("variant fallback returned no subtitles (title=%q)", title)
			}
			t.Logf("variant detail OK: %q with %d subtitles", title, len(subs))
			data, err := DownloadJavSubVTT(context.Background(), code, subs[0].ID)
			if err != nil {
				t.Fatalf("download: %v", err)
			}
			if len(data) == 0 {
				t.Fatalf("empty subtitle")
			}
			t.Logf("downloaded %d bytes: %.60s", len(data), string(data))
		})
	}
}
