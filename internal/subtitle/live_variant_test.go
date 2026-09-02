//go:build live

package subtitle

import (
	"context"
	"testing"
)

// TestLiveVariantCodeDetailFallback verifies that requesting detail for a
// variant code (which carries no subtitles itself) falls back to the base code.
func TestLiveVariantCodeDetailFallback(t *testing.T) {
	title, subs, err := GetJavSubMovieDetail(context.Background(), "waaa-366-chinese-subtitle")
	if err != nil {
		t.Fatalf("detail: %v", err)
	}
	if len(subs) == 0 {
		t.Fatalf("variant fallback returned no subtitles (title=%q)", title)
	}
	t.Logf("variant detail OK: %q with %d subtitles", title, len(subs))
	var chinese *JavSubSubtitle
	for i := range subs {
		if subs[i].Lang == "Chinese Simplified" {
			chinese = &subs[i]
			break
		}
	}
	if chinese == nil {
		t.Fatalf("no Chinese Simplified track found")
	}
	data, err := DownloadJavSubVTT(context.Background(), "waaa-366-chinese-subtitle", chinese.ID)
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	if len(data) == 0 {
		t.Fatalf("empty subtitle")
	}
	t.Logf("downloaded %d bytes: %.60s", len(data), string(data))
}
