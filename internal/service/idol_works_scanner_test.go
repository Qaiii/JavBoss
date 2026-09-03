package service

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

// seedScrapeIdol creates an idol that owns one in-library movie, so
// ListIdolCoverCodes returns the movie code used by profile resolvers.
func seedScrapeIdol(t *testing.T, gdb *gorm.DB, idolName, code string) models.JavIdol {
	t.Helper()
	dir := models.Directory{Path: "/media/test"}
	video := models.Video{Fingerprint: "idol-works-video-" + code}
	javRec := models.Jav{Code: code}
	for name, value := range map[string]any{
		"directory": &dir,
		"video":     &video,
		"javRec":    &javRec,
	} {
		if err := gdb.Create(value).Error; err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
	}
	idol := models.JavIdol{Name: idolName}
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
		RelativePath: code + ".mp4",
		JavID:        &javID,
	}).Error; err != nil {
		t.Fatalf("create video location: %v", err)
	}
	return idol
}

// stubWorksSources installs deterministic stubs for every works-provider hook
// and collapses the inter-page/inter-source sleeps so tests stay fast. Returned
// call counters let tests assert which provider was actually used.
func stubWorksSources(t *testing.T) (javdbResolveCalls, javdbListCalls, jdbResolveCalls, jdbListCalls *int) {
	t.Helper()
	javdbResolve := 0
	javdbList := 0
	jdbResolve := 0
	jdbList := 0

	lookupActressURLByCodeAndName = func(code, name string, provider jav.Provider) (string, error) {
		javdbResolve++
		return "https://javdb.com/actors/scrape-test", nil
	}
	listJavWorksByActressURL = func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error) {
		javdbList++
		return nil, false, errors.New("javdb works stub")
	}
	resolveJavDatabaseProfileURL = func(ctx context.Context, item *models.JavIdol) (string, error) {
		jdbResolve++
		return "https://www.javdatabase.com/idols/scrape-test/", nil
	}
	listJavDatabaseWorksByActressURL = func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error) {
		jdbList++
		return nil, false, errors.New("javdatabase works stub")
	}
	t.Cleanup(func() {
		lookupActressURLByCodeAndName = jav.LookupActressURLByCodeAndName
		listJavWorksByActressURL = jav.ListJavWorksByActressURL
		resolveJavDatabaseProfileURL = lookupJavDatabaseProfileURL
		listJavDatabaseWorksByActressURL = jav.ListJavDatabaseWorksByActressURL
	})

	// Keep sleeps negligible so the default (JavDB-first) scrape does not stall.
	mgr := InitIdolWorksManager()
	mgr.pageDelay = time.Millisecond
	mgr.pageDelayJitter = 0
	mgr.sourceSwitchDelay = time.Millisecond
	mgr.sourceSwitchJitter = 0

	return &javdbResolve, &javdbList, &jdbResolve, &jdbList
}

func TestScrapeIdolWorksPersistsAllPages(t *testing.T) {
	gdb := openServiceTestDB(t)
	ctx := context.Background()
	idol := seedScrapeIdol(t, gdb, "Scrape Test Idol", "IPX-001")

	javdbResolve, javdbList, _, _ := stubWorksSources(t)
	// This test exercises the JavDB path specifically, so point the JavDB list
	// stub at a two-page listing (the other provider's list stub fails fast).
	listJavWorksByActressURL = func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error) {
		(*javdbList)++
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
	sourceByCode := map[string]int{}
	for _, item := range items {
		inLibraryByCode[item.Code] = item.InLibrary
		sourceByCode[item.Code] = item.Source
	}
	if !inLibraryByCode["IPX-001"] {
		t.Fatal("IPX-001 should be in-library")
	}
	if inLibraryByCode["ABP-999"] || inLibraryByCode["SSIS-123"] {
		t.Fatal("external codes should not be in-library")
	}
	if sourceByCode["SSIS-123"] != int(jav.ProviderJavDB) {
		t.Fatalf("work source = %d, want ProviderJavDB(%d)", sourceByCode["SSIS-123"], jav.ProviderJavDB)
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
	if *javdbList != 2 {
		t.Fatalf("javdb page fetches = %d, want 2", *javdbList)
	}
	if *javdbResolve != 1 {
		t.Fatalf("javdb profile resolutions = %d, want 1", *javdbResolve)
	}
}

func TestScrapeIdolWorksFallsBackToJavDatabaseWhenJavDBProfileMissing(t *testing.T) {
	gdb := openServiceTestDB(t)
	ctx := context.Background()
	idol := seedScrapeIdol(t, gdb, "Fallback Idol", "IPX-002")

	_, _, _, _ = stubWorksSources(t)
	// JavDB cannot resolve a profile URL for this idol.
	lookupActressURLByCodeAndName = func(code, name string, provider jav.Provider) (string, error) {
		return "", jav.ResourceNotFonud
	}
	listJavDatabaseWorksByActressURL = func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error) {
		return []*jav.JavInfo{
			{Code: "ABP-888", Title: "JavDatabase Work", Provider: jav.ProviderJavDatabase},
			{Code: "IPX-002", Title: "In Library Work", Provider: jav.ProviderJavDatabase},
		}, false, nil
	}

	if err := ScrapeIdolWorks(ctx, idol.ID); err != nil {
		t.Fatalf("scrape: %v", err)
	}

	items, total, err := dbpkg.ListJavIdolWorks(ctx, idol.ID, 24, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 2 || len(items) != 2 {
		t.Fatalf("total=%d items=%d, want 2 (from JavDatabase fallback)", total, len(items))
	}
	for _, item := range items {
		if item.Source != int(jav.ProviderJavDatabase) {
			t.Fatalf("work source = %d, want ProviderJavDatabase(%d)", item.Source, jav.ProviderJavDatabase)
		}
	}
	track, err := dbpkg.GetJavIdolTrack(ctx, idol.ID)
	if err != nil {
		t.Fatalf("get track: %v", err)
	}
	if track.LastError != "" {
		t.Fatalf("track last_error = %q, want empty after successful fallback", track.LastError)
	}
	if !strings.Contains(track.JavdbURL, "javdatabase.com") {
		t.Fatalf("track javdb_url = %q, want javdatabase profile URL", track.JavdbURL)
	}
}

func TestScrapeIdolWorksRecordsErrorWhenAllSourcesFail(t *testing.T) {
	gdb := openServiceTestDB(t)
	ctx := context.Background()
	idol := seedScrapeIdol(t, gdb, "No Profile Idol", "IPX-003")

	_, _, _, _ = stubWorksSources(t)
	lookupActressURLByCodeAndName = func(code, name string, provider jav.Provider) (string, error) {
		return "", jav.ResourceNotFonud
	}
	resolveJavDatabaseProfileURL = func(ctx context.Context, item *models.JavIdol) (string, error) {
		return "", jav.ResourceNotFonud
	}

	err := ScrapeIdolWorks(ctx, idol.ID)
	if err == nil {
		t.Fatal("expected error when no provider can resolve a profile URL")
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
