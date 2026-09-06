package jav

import (
	"testing"
	"time"
)

func TestScrapeSourcesUseLiveRequestIntervals(t *testing.T) {
	want := map[string]time.Duration{
		"javbus":      javBusRequestInterval,
		"javdatabase": javDatabaseRequestInterval,
		"javdb":       javDBRequestInterval,
		"avmoo":       avmooRequestInterval,
		"avsox":       avsoxRequestInterval,
		"javmenu":     javMenuRequestInterval,
		"missav":      missAVRequestInterval,
		"minnanoav":   minnanoAVRequestInterval,
		"javmodel":    javModelRequestInterval,
		"avdanyuwiki": avdanyuWikiRequestInterval,
		"theporndb":   thePornDBRequestInterval,
	}

	got := map[string]ScrapeSource{}
	for _, source := range ScrapeSources() {
		if source.ID == "" {
			t.Fatal("scrape source missing id")
		}
		if len(source.URLs) == 0 {
			t.Fatalf("source %s missing urls", source.ID)
		}
		if len(source.Data) == 0 {
			t.Fatalf("source %s missing data fields", source.ID)
		}
		if source.IntervalMS < (3 * time.Second).Milliseconds() {
			t.Fatalf("source %s interval = %dms, want at least 3s", source.ID, source.IntervalMS)
		}
		got[source.ID] = source
	}

	for id, interval := range want {
		source, ok := got[id]
		if !ok {
			t.Fatalf("missing scrape source %s", id)
		}
		if source.IntervalMS != interval.Milliseconds() {
			t.Fatalf("source %s interval = %d, want %d", id, source.IntervalMS, interval.Milliseconds())
		}
	}
}
