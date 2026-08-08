package service

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"javboss/internal/common"
	dbpkg "javboss/internal/db"
	"javboss/internal/jav"
	"javboss/internal/models"

	"gorm.io/gorm"
)

func openServiceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	gdb, err := dbpkg.Open(filepath.Join(t.TempDir(), "idol-works.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	prev := common.DB
	common.DB = gdb
	t.Cleanup(func() {
		common.DB = prev
		sqlDB, dbErr := gdb.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
	})
	return gdb
}

func TestScrapeIdolWorksPersistsAllPages(t *testing.T) {
	gdb := openServiceTestDB(t)
	ctx := context.Background()

	dir := models.Directory{Path: "/media/test"}
	video := models.Video{Fingerprint: "idol-works-video"}
	javRec := models.Jav{Code: "IPX-001"}
	for name, value := range map[string]any{
		"directory": &dir,
		"video":     &video,
		"javRec":    &javRec,
	} {
		if err := gdb.Create(value).Error; err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
	}
	idol := models.JavIdol{Name: "Scrape Test Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	if err := gdb.Create(&models.JavIdolMap{JavID: javRec.ID, JavIdolID: idol.ID}).Error; err != nil {
		t.Fatalf("create idol map: %v", err)
	}
	javID := javRec.ID
	if err := gdb.Create(&models.VideoLocation{
		VideoID:      video.ID,
		DirectoryID:  dir.ID,
		RelativePath: "IPX-001.mp4",
		JavID:        &javID,
	}).Error; err != nil {
		t.Fatalf("create video location: %v", err)
	}

	// stub the profile URL resolution and works listing
	lookupActressURLByCodeAndName = func(code, name string, provider jav.Provider) (string, error) {
		return "https://javdb.com/actors/scrape-test", nil
	}
	pageCalls := 0
	listJavWorksByActressURL = func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error) {
		pageCalls++
		if page == 1 {
			return []*jav.JavInfo{
				{Code: "IPX-001", Title: "In Library Work", Provider: jav.ProviderJavDB},
				{Code: "ABP-999", Title: "External Work", Provider: jav.ProviderJavDB},
			}, true, nil
		}
		return []*jav.JavInfo{
			{Code: "SSIS-123", Title: "Page Two Work", Provider: jav.ProviderJavDB},
		}, false, nil
	}
	t.Cleanup(func() {
		lookupActressURLByCodeAndName = jav.LookupActressURLByCodeAndName
		listJavWorksByActressURL = jav.ListJavWorksByActressURL
	})

	if err := ScrapeIdolWorks(ctx, idol.ID); err != nil {
		t.Fatalf("scrape: %v", err)
	}

	items, total, err := dbpkg.ListJavIdolWorks(ctx, idol.ID, 24, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 3 || len(items) != 3 {
		t.Fatalf("total=%d items=%d, want 3", total, len(items))
	}
	inLibraryByCode := map[string]bool{}
	for _, item := range items {
		inLibraryByCode[item.Code] = item.InLibrary
	}
	if !inLibraryByCode["IPX-001"] {
		t.Fatal("IPX-001 should be in-library")
	}
	if inLibraryByCode["ABP-999"] || inLibraryByCode["SSIS-123"] {
		t.Fatal("external codes should not be in-library")
	}

	track, err := dbpkg.GetJavIdolTrack(ctx, idol.ID)
	if err != nil {
		t.Fatalf("get track: %v", err)
	}
	if !track.Tracked || track.WorksCount != 3 || track.LastScrapedAt == nil {
		t.Fatalf("track = %+v", track)
	}
	if track.JavdbURL != "https://javdb.com/actors/scrape-test" {
		t.Fatalf("javdb url = %q", track.JavdbURL)
	}
	if pageCalls != 2 {
		t.Fatalf("page fetches = %d, want 2", pageCalls)
	}
}

func TestScrapeIdolWorksRecordsProfileResolutionError(t *testing.T) {
	gdb := openServiceTestDB(t)
	ctx := context.Background()

	idol := models.JavIdol{Name: "No Profile Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}

	lookupActressURLByCodeAndName = func(code, name string, provider jav.Provider) (string, error) {
		return "", jav.ResourceNotFonud
	}
	t.Cleanup(func() {
		lookupActressURLByCodeAndName = jav.LookupActressURLByCodeAndName
	})

	err := ScrapeIdolWorks(ctx, idol.ID)
	if err == nil {
		t.Fatal("expected error when profile URL cannot be resolved")
	}
	if !errors.Is(err, jav.ResourceNotFonud) {
		t.Fatalf("err = %v, want ResourceNotFonud", err)
	}

	track, trackErr := dbpkg.GetJavIdolTrack(ctx, idol.ID)
	if trackErr != nil {
		t.Fatalf("get track: %v", trackErr)
	}
	if !track.Tracked || track.LastError == "" {
		t.Fatalf("track should exist with last_error set: %+v", track)
	}
}
