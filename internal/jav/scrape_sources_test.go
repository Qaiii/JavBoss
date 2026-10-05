package jav

import (
	"testing"
	"time"

	"javboss/internal/jav/avmoo"
	"javboss/internal/jav/avsox"
	"javboss/internal/jav/javbus"
	"javboss/internal/jav/javdatabase"
	"javboss/internal/jav/javdb"
	"javboss/internal/jav/javmenu"
	"javboss/internal/jav/javmodel"
	"javboss/internal/jav/minnanoav"
	"javboss/internal/jav/theporndb"
)

func TestScrapeSourcesUseLiveRequestIntervals(t *testing.T) {
	want := map[string]time.Duration{
		"javbus":      javbus.RequestInterval(),
		"javdatabase": javdatabase.RequestInterval(),
		"javdb":       javdb.RequestInterval(),
		"avmoo":       avmoo.RequestInterval(),
		"avsox":       avsox.RequestInterval(),
		"javmenu":     javmenu.RequestInterval(),
		"missav":      missAVRequestInterval,
		"minnanoav":   minnanoav.RequestInterval(),
		"javmodel":    javmodel.RequestInterval(),
		"avdanyuwiki": avdanyuWikiRequestInterval,
		"theporndb":   theporndb.RequestInterval(),
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
