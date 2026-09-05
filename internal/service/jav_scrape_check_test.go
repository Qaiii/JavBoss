package service

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"javboss/internal/common"
	"javboss/internal/db"
	"javboss/internal/jav"
	"javboss/internal/manager"
	"javboss/internal/models"
)

func TestCheckAndRepairJavScrapeQueuesIncompleteRows(t *testing.T) {
	gdb, err := db.Open(filepath.Join(t.TempDir(), "scrape-check.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	previousDB := common.DB
	common.DB = gdb
	t.Cleanup(func() {
		common.DB = previousDB
		if sqlDB, dbErr := gdb.DB(); dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	coverDir := t.TempDir()
	coverMgr := manager.NewCoverManager(coverDir, []jav.Provider{jav.ProviderJavBus})
	previousCover := common.CoverManager
	common.CoverManager = coverMgr
	t.Cleanup(func() { common.CoverManager = previousCover })

	previousRepair := javScrapeRepairMgr
	repairMgr := newJavScrapeRepairManager()
	javScrapeRepairResetForTest(repairMgr)
	t.Cleanup(func() { javScrapeRepairResetForTest(previousRepair) })

	now := time.Unix(1710000000, 0).UTC()
	studio := models.JavStudio{Name: "Complete Studio"}
	if err := gdb.Create(&studio).Error; err != nil {
		t.Fatalf("create studio: %v", err)
	}
	series := models.JavSeries{Name: "Complete Series"}
	if err := gdb.Create(&series).Error; err != nil {
		t.Fatalf("create series: %v", err)
	}
	idol := models.JavIdol{Name: "Complete Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	tag := models.JavTag{Name: "Complete Tag"}
	if err := gdb.Create(&tag).Error; err != nil {
		t.Fatalf("create tag: %v", err)
	}
	censored := false
	complete := models.Jav{
		Code:         "HAVE-001",
		Title:        "完整作品",
		StudioID:     &studio.ID,
		SeriesID:     &series.ID,
		IsUncensored: &censored,
		ReleaseUnix:  now.Unix(),
		DurationMin:  90,
		FetchedAt:    now,
		CreatedAt:    now,
	}
	incomplete := models.Jav{Code: "MISS-001", FetchedAt: now, CreatedAt: now}
	javs := []models.Jav{complete, incomplete}
	if err := gdb.Create(&javs).Error; err != nil {
		t.Fatalf("create jav rows: %v", err)
	}
	complete = javs[0]
	incomplete = javs[1]
	if err := gdb.Create(&models.JavTagMap{
		JavID:    complete.ID,
		JavTagID: tag.ID,
		Provider: int(jav.ProviderJavBus),
	}).Error; err != nil {
		t.Fatalf("create tag map: %v", err)
	}
	if err := gdb.Create(&models.JavIdolMap{JavID: complete.ID, JavIdolID: idol.ID}).Error; err != nil {
		t.Fatalf("create idol map: %v", err)
	}

	writeCoverFile(t, coverDir, "have-001.jpg", 40*1024)
	writeCoverFile(t, coverDir, "have-001-poster.jpg", 4*1024)

	report, err := CheckAndRepairJavScrape(context.Background())
	if err != nil {
		t.Fatalf("CheckAndRepairJavScrape: %v", err)
	}
	if report.Total != 2 {
		t.Fatalf("total = %d, want 2", report.Total)
	}
	if report.Incomplete != 1 {
		t.Fatalf("incomplete = %d, want 1", report.Incomplete)
	}
	if report.Queued != 1 || report.QueuedCovers != 1 || report.QueuedMetadata != 1 {
		t.Fatalf("queued report = %#v", report)
	}
	if report.Fields[JavScrapeFieldTitle] != 1 ||
		report.Fields[JavScrapeFieldTags] != 1 ||
		report.Fields[JavScrapeFieldSeries] != 1 ||
		report.Fields[JavScrapeFieldStudio] != 1 ||
		report.Fields[JavScrapeFieldSource] != 1 ||
		report.Fields[JavScrapeFieldCoverLandscape] != 1 ||
		report.Fields[JavScrapeFieldCoverPortrait] != 1 {
		t.Fatalf("fields = %#v", report.Fields)
	}

	select {
	case code := <-repairMgr.tasks:
		if code != "MISS-001" {
			t.Fatalf("metadata queue code = %q, want MISS-001", code)
		}
	default:
		t.Fatal("expected metadata repair to be queued")
	}
	if coverMgr.PendingCount() != 1 {
		t.Fatalf("cover pending = %d, want 1", coverMgr.PendingCount())
	}
}

func TestCheckAndRepairJavScrapeQueuesUnimportedWorks(t *testing.T) {
	gdb, err := db.Open(filepath.Join(t.TempDir(), "scrape-check-unimported.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	previousDB := common.DB
	common.DB = gdb
	t.Cleanup(func() {
		common.DB = previousDB
		if sqlDB, dbErr := gdb.DB(); dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	previousRepair := javScrapeRepairMgr
	javScrapeRepairResetForTest(newJavScrapeRepairManager())
	t.Cleanup(func() { javScrapeRepairResetForTest(previousRepair) })

	previousMeta := idolWorkMetadataMgr
	metaMgr := &idolWorkMetadataManager{
		tasks:     make(chan string, 8),
		scheduled: make(map[string]struct{}),
	}
	idolWorkMetadataResetForTest(metaMgr)
	t.Cleanup(func() { idolWorkMetadataResetForTest(previousMeta) })

	now := time.Unix(1710000000, 0).UTC()
	censored := false
	studio := models.JavStudio{Name: "Complete Studio"}
	if err := gdb.Create(&studio).Error; err != nil {
		t.Fatalf("create studio: %v", err)
	}
	series := models.JavSeries{Name: "Complete Series"}
	if err := gdb.Create(&series).Error; err != nil {
		t.Fatalf("create series: %v", err)
	}
	idol := models.JavIdol{Name: "Complete Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	tag := models.JavTag{Name: "Complete Tag"}
	if err := gdb.Create(&tag).Error; err != nil {
		t.Fatalf("create tag: %v", err)
	}
	library := models.Jav{
		Code:         "HAVE-001",
		Title:        "完整作品",
		StudioID:     &studio.ID,
		SeriesID:     &series.ID,
		IsUncensored: &censored,
		ReleaseUnix:  now.Unix(),
		DurationMin:  90,
		FetchedAt:    now,
		CreatedAt:    now,
	}
	if err := gdb.Create(&library).Error; err != nil {
		t.Fatalf("create library jav: %v", err)
	}
	if err := gdb.Create(&models.JavTagMap{
		JavID:    library.ID,
		JavTagID: tag.ID,
		Provider: int(jav.ProviderJavBus),
	}).Error; err != nil {
		t.Fatalf("create tag map: %v", err)
	}
	if err := gdb.Create(&models.JavIdolMap{JavID: library.ID, JavIdolID: idol.ID}).Error; err != nil {
		t.Fatalf("create idol map: %v", err)
	}
	if err := gdb.Create(&models.JavIdolWork{JavIdolID: idol.ID, Code: "EXT-MISS"}).Error; err != nil {
		t.Fatalf("create unimported work: %v", err)
	}

	coverDir := t.TempDir()
	coverMgr := manager.NewCoverManager(coverDir, []jav.Provider{jav.ProviderJavBus})
	previousCover := common.CoverManager
	common.CoverManager = coverMgr
	t.Cleanup(func() { common.CoverManager = previousCover })
	writeCoverFile(t, coverDir, "have-001.jpg", 40*1024)
	writeCoverFile(t, coverDir, "have-001-poster.jpg", 4*1024)

	report, err := CheckAndRepairJavScrape(context.Background())
	if err != nil {
		t.Fatalf("CheckAndRepairJavScrape: %v", err)
	}
	if report.LibraryTotal != 1 || report.UnimportedTotal != 1 || report.Total != 2 {
		t.Fatalf("totals = %#v", report)
	}
	if report.Incomplete != 1 {
		t.Fatalf("incomplete = %d, want 1", report.Incomplete)
	}
	if report.Fields[JavScrapeFieldTitle] != 1 ||
		report.Fields[JavScrapeFieldCoverLandscape] != 1 ||
		report.Fields[JavScrapeFieldStudio] != 1 ||
		report.Fields[JavScrapeFieldSource] != 1 {
		t.Fatalf("fields = %#v", report.Fields)
	}
	select {
	case code := <-metaMgr.tasks:
		if code != "EXT-MISS" {
			t.Fatalf("unimported queue code = %q, want EXT-MISS", code)
		}
	default:
		t.Fatal("expected unimported work to be queued")
	}
}

func TestRepairJavScrapeSavesLookupResult(t *testing.T) {
	gdb, err := db.Open(filepath.Join(t.TempDir(), "scrape-repair.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	previousDB := common.DB
	common.DB = gdb
	t.Cleanup(func() {
		common.DB = previousDB
		if sqlDB, dbErr := gdb.DB(); dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	now := time.Unix(1710000000, 0).UTC()
	if err := gdb.Create(&models.Jav{Code: "MISS-001", FetchedAt: now, CreatedAt: now}).Error; err != nil {
		t.Fatalf("create jav: %v", err)
	}

	originalLookup := lookupJavForScrapeRepair
	lookupJavForScrapeRepair = func(code string, provider jav.Provider) (*jav.JavInfo, error) {
		if provider != jav.ProviderJavBus {
			return nil, jav.ResourceNotFonud
		}
		uncensored := false
		return &jav.JavInfo{
			Code:         code,
			Title:        "补全标题",
			Studio:       "补全片商",
			Series:       "补全系列",
			Tags:         []string{"标签A"},
			Actors:       []string{"演员A"},
			ReleaseUnix:  now.Unix(),
			DurationMin:  80,
			IsUncensored: &uncensored,
			Provider:     jav.ProviderJavBus,
		}, nil
	}
	t.Cleanup(func() { lookupJavForScrapeRepair = originalLookup })

	if err := repairJavScrape(context.Background(), "MISS-001"); err != nil {
		t.Fatalf("repairJavScrape: %v", err)
	}

	stored, err := db.GetJavByCode(context.Background(), "MISS-001")
	if err != nil || stored == nil {
		t.Fatalf("load repaired jav: %v %#v", err, stored)
	}
	if stored.Title != "补全标题" || stored.StudioID == nil || stored.SeriesID == nil || stored.DurationMin != 80 {
		t.Fatalf("repaired jav = %#v", stored)
	}
}

func writeCoverFile(t *testing.T, dir, name string, size int) {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(strings.Repeat("x", size)), 0o644); err != nil {
		t.Fatalf("write cover %s: %v", name, err)
	}
}
