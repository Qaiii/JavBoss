package service

import (
	"javboss/internal/jav"
	"javboss/internal/jav/scrape/cover"
	"javboss/internal/subtitle"
)

const (
	JavScrapeQueueCovers           = "covers"
	JavScrapeQueueMetadataRepair   = "metadata_repair"
	JavScrapeQueueIdolWorks        = "idol_works"
	JavScrapeQueueIdolWorkMetadata = "idol_work_metadata"
)

// JavScrapeQueue is one in-memory scrape job queue and its live depth.
type JavScrapeQueue struct {
	ID      string `json:"id"`
	Pending int    `json:"pending"`
}

// JavScrapeStatusReport lists scrape methods and live queue depths.
type JavScrapeStatusReport struct {
	Sources []jav.ScrapeSource `json:"sources"`
	Queues  []JavScrapeQueue   `json:"queues"`
}

// JavScrapeStatus returns the current scrape catalog and pending queue counts.
func JavScrapeStatus() JavScrapeStatusReport {
	sources := append([]jav.ScrapeSource(nil), jav.ScrapeSources()...)
	sources = append(sources, jav.ScrapeSource{
		ID: "javsubtitle",
		URLs: []string{
			"https://javsubtitle.com/api/movies?q={query}",
			"https://javsubtitle.com/api/movie/{code}",
		},
		Data:       []string{"subtitles"},
		IntervalMS: subtitle.RequestInterval().Milliseconds(),
	})

	coverPending := cover.PendingCount()

	return JavScrapeStatusReport{
		Sources: sources,
		Queues: []JavScrapeQueue{
			{ID: JavScrapeQueueCovers, Pending: coverPending},
			{ID: JavScrapeQueueMetadataRepair, Pending: JavScrapeRepairPendingCount()},
			{ID: JavScrapeQueueIdolWorks, Pending: IdolWorksPendingCount()},
			{ID: JavScrapeQueueIdolWorkMetadata, Pending: IdolWorkMetadataPendingCount()},
		},
	}
}
