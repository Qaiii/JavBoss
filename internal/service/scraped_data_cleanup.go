package service

import (
	"context"
	"errors"
	"sync"
	"time"

	"javboss/internal/common"
	"javboss/internal/common/logging"
	"javboss/internal/db"
	"javboss/internal/jav"
	"javboss/internal/manager"
)

// ErrScrapedDataCleanupBusy is returned when a cleanup is already running.
var ErrScrapedDataCleanupBusy = errors.New("scraped data cleanup is already running")

// ScrapedDataCleanupReport summarizes unused scraped metadata that can be
// removed without touching video files.
type ScrapedDataCleanupReport struct {
	Javs         int        `json:"javs"`
	ScrapedTags  int        `json:"scraped_tags"`
	Idols        int        `json:"idols"`
	Studios      int        `json:"studios"`
	Series       int        `json:"series"`
	Covers       int        `json:"covers"`
	ExpiredCache int        `json:"expired_cache"`
	Total        int        `json:"total"`
	CleanedAt    *time.Time `json:"cleaned_at,omitempty"`
}

func (report ScrapedDataCleanupReport) withTotal() ScrapedDataCleanupReport {
	report.Total = report.Javs + report.ScrapedTags + report.Idols + report.Studios + report.Series + report.Covers + report.ExpiredCache
	return report
}

type scrapedDataCleanupManager struct {
	mu      sync.Mutex
	running bool
}

var (
	scrapedDataCleanupOnce sync.Once
	scrapedDataCleanupMgr  *scrapedDataCleanupManager
)

func initScrapedDataCleanupManager() *scrapedDataCleanupManager {
	scrapedDataCleanupOnce.Do(func() {
		scrapedDataCleanupMgr = &scrapedDataCleanupManager{}
	})
	return scrapedDataCleanupMgr
}

func scrapedDataCleanupCoverDir() string {
	if common.AppConfig == nil {
		return ""
	}
	return common.AppConfig.JavCoverDir
}

func previewScrapedDataCleanup(ctx context.Context) (ScrapedDataCleanupReport, error) {
	if common.DB == nil {
		return ScrapedDataCleanupReport{}, errors.New("nil db")
	}
	counts, err := db.CountUnusedScrapedData(ctx)
	if err != nil {
		return ScrapedDataCleanupReport{}, err
	}
	keep, err := db.ListKeptCoverCodes(ctx)
	if err != nil {
		return ScrapedDataCleanupReport{}, err
	}
	covers, err := manager.CountUnusedCoverFiles(scrapedDataCleanupCoverDir(), keep)
	if err != nil {
		return ScrapedDataCleanupReport{}, err
	}
	expired, err := jav.CountExpiredLookupCache(time.Now())
	if err != nil {
		return ScrapedDataCleanupReport{}, err
	}
	return ScrapedDataCleanupReport{
		Javs:         counts.Javs,
		ScrapedTags:  counts.ScrapedTags,
		Idols:        counts.Idols,
		Studios:      counts.Studios,
		Series:       counts.Series,
		Covers:       covers,
		ExpiredCache: expired,
	}.withTotal(), nil
}

func runScrapedDataCleanup(ctx context.Context) (ScrapedDataCleanupReport, error) {
	if common.DB == nil {
		return ScrapedDataCleanupReport{}, errors.New("nil db")
	}
	counts, err := db.DeleteUnusedScrapedData(ctx)
	if err != nil {
		return ScrapedDataCleanupReport{}, err
	}
	keep, err := db.ListKeptCoverCodes(ctx)
	if err != nil {
		return ScrapedDataCleanupReport{}, err
	}
	covers, err := manager.RemoveUnusedCoverFiles(scrapedDataCleanupCoverDir(), keep)
	if err != nil {
		return ScrapedDataCleanupReport{}, err
	}
	expired, err := jav.DeleteExpiredLookupCache(time.Now())
	if err != nil {
		return ScrapedDataCleanupReport{}, err
	}
	cleanedAt := time.Now().UTC()
	return ScrapedDataCleanupReport{
		Javs:         counts.Javs,
		ScrapedTags:  counts.ScrapedTags,
		Idols:        counts.Idols,
		Studios:      counts.Studios,
		Series:       counts.Series,
		Covers:       covers,
		ExpiredCache: expired,
		CleanedAt:    &cleanedAt,
	}.withTotal(), nil
}

// PreviewScrapedDataCleanup reports unused scraped data without deleting it.
func PreviewScrapedDataCleanup(ctx context.Context) (ScrapedDataCleanupReport, error) {
	return previewScrapedDataCleanup(ctx)
}

// CleanScrapedData removes unused scraped metadata, unused cover files, and
// expired lookup cache entries. Video files are never deleted.
func CleanScrapedData(ctx context.Context) (ScrapedDataCleanupReport, error) {
	mgr := initScrapedDataCleanupManager()
	if mgr == nil {
		return ScrapedDataCleanupReport{}, errors.New("scraped data cleanup is unavailable")
	}
	mgr.mu.Lock()
	if mgr.running {
		mgr.mu.Unlock()
		return ScrapedDataCleanupReport{}, ErrScrapedDataCleanupBusy
	}
	mgr.running = true
	mgr.mu.Unlock()

	defer func() {
		mgr.mu.Lock()
		mgr.running = false
		mgr.mu.Unlock()
	}()

	report, err := runScrapedDataCleanup(ctx)
	if err != nil {
		return ScrapedDataCleanupReport{}, err
	}
	logging.Info(
		"scraped data cleanup javs=%d tags=%d idols=%d studios=%d series=%d covers=%d cache=%d",
		report.Javs,
		report.ScrapedTags,
		report.Idols,
		report.Studios,
		report.Series,
		report.Covers,
		report.ExpiredCache,
	)
	return report, nil
}

func scrapedDataCleanupResetForTest() {
	scrapedDataCleanupOnce = sync.Once{}
	scrapedDataCleanupMgr = nil
}
