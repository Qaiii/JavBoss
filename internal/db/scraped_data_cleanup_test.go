package db

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"javboss/internal/jav"
	"javboss/internal/models"

	"gorm.io/gorm"
)

func TestDeleteUnusedScrapedDataRemovesUnreferencedMetadataOnly(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: filepath.Join(t.TempDir(), "library")}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	videoPath := filepath.Join(dir.Path, "keep.mp4")
	if err := os.MkdirAll(dir.Path, 0o755); err != nil {
		t.Fatalf("create library dir: %v", err)
	}
	if err := os.WriteFile(videoPath, []byte("video-bytes"), 0o644); err != nil {
		t.Fatalf("write video file: %v", err)
	}

	keepStudio := models.JavStudio{Name: "Keep Studio"}
	orphanStudio := models.JavStudio{Name: "Orphan Studio"}
	keepSeries := models.JavSeries{Name: "Keep Series"}
	orphanSeries := models.JavSeries{Name: "Orphan Series"}
	englishSeries := models.JavSeries{Name: "Keep English Series", IsEnglish: true}
	keepIdol := models.JavIdol{Name: "Keep Idol"}
	orphanIdol := models.JavIdol{Name: "Orphan Idol"}
	trackedIdol := models.JavIdol{Name: "Tracked Idol"}
	keepScrapedTag := models.JavTag{Name: "Keep Scraped"}
	orphanScrapedTag := models.JavTag{Name: "Orphan Scraped"}
	unusedUserTag := models.JavTag{Name: "User Tag", IsUser: true}
	for name, value := range map[string]any{
		"keep studio":        &keepStudio,
		"orphan studio":      &orphanStudio,
		"keep series":        &keepSeries,
		"orphan series":      &orphanSeries,
		"english series":     &englishSeries,
		"keep idol":          &keepIdol,
		"orphan idol":        &orphanIdol,
		"tracked idol":       &trackedIdol,
		"keep scraped tag":   &keepScrapedTag,
		"orphan scraped tag": &orphanScrapedTag,
		"user tag":           &unusedUserTag,
	} {
		if err := gdb.Create(value).Error; err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
	}

	keepJav := models.Jav{
		Code:        "KEEP-001",
		Title:       "Keep Title",
		StudioID:    &keepStudio.ID,
		SeriesID:    &keepSeries.ID,
		SeriesEnID:  &englishSeries.ID,
		FetchedAt:   now,
		CreatedAt:   now,
		UpdatedAt:   now,
		DurationMin: 90,
	}
	orphanJav := models.Jav{
		Code:      "ORPH-001",
		Title:     "Orphan Title",
		StudioID:  &orphanStudio.ID,
		SeriesID:  &orphanSeries.ID,
		FetchedAt: now,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := gdb.Create(&keepJav).Error; err != nil {
		t.Fatalf("create keep jav: %v", err)
	}
	if err := gdb.Create(&orphanJav).Error; err != nil {
		t.Fatalf("create orphan jav: %v", err)
	}
	if err := gdb.Create(&models.JavIdolMap{JavID: keepJav.ID, JavIdolID: keepIdol.ID}).Error; err != nil {
		t.Fatalf("create keep idol map: %v", err)
	}
	if err := gdb.Create(&models.JavIdolMap{JavID: orphanJav.ID, JavIdolID: orphanIdol.ID}).Error; err != nil {
		t.Fatalf("create orphan idol map: %v", err)
	}
	if err := gdb.Create(&models.JavTagMap{
		JavID: keepJav.ID, JavTagID: keepScrapedTag.ID, Provider: int(jav.ProviderJavBus), CreatedAt: now,
	}).Error; err != nil {
		t.Fatalf("create keep tag map: %v", err)
	}
	if err := gdb.Create(&models.JavTagMap{
		JavID: orphanJav.ID, JavTagID: orphanScrapedTag.ID, Provider: int(jav.ProviderJavBus), CreatedAt: now,
	}).Error; err != nil {
		t.Fatalf("create orphan tag map: %v", err)
	}
	if err := gdb.Create(&models.JavIdolTrack{JavIdolID: trackedIdol.ID, JavdbURL: "https://javdb.com/actors/keep"}).Error; err != nil {
		t.Fatalf("create idol track: %v", err)
	}
	if err := gdb.Create(&models.JavIdolWork{JavIdolID: trackedIdol.ID, Code: "WORK-001", Title: "Unimported"}).Error; err != nil {
		t.Fatalf("create idol work: %v", err)
	}

	video := models.Video{Fingerprint: "keep-video"}
	if err := gdb.Create(&video).Error; err != nil {
		t.Fatalf("create video: %v", err)
	}
	location, err := UpsertVideoLocation(ctx, video.ID, dir.ID, "keep.mp4", now)
	if err != nil {
		t.Fatalf("create location: %v", err)
	}
	if err := gdb.Model(&models.VideoLocation{}).Where("id = ?", location.ID).Update("jav_id", keepJav.ID).Error; err != nil {
		t.Fatalf("link location: %v", err)
	}

	preview, err := CountUnusedScrapedData(ctx)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if preview != (UnusedScrapedDataCounts{Javs: 1, ScrapedTags: 1, Idols: 1, Studios: 1, Series: 1}) {
		t.Fatalf("preview = %#v", preview)
	}

	deleted, err := DeleteUnusedScrapedData(ctx)
	if err != nil {
		t.Fatalf("delete unused scraped data: %v", err)
	}
	if deleted != preview {
		t.Fatalf("deleted = %#v, want %#v", deleted, preview)
	}

	assertCount(t, gdb.Model(&models.Jav{}), 1)
	assertCount(t, gdb.Model(&models.JavTag{}), 2)
	assertCount(t, gdb.Model(&models.JavIdol{}), 2)
	assertCount(t, gdb.Model(&models.JavStudio{}), 1)
	assertCount(t, gdb.Model(&models.JavSeries{}), 2)
	assertCount(t, gdb.Model(&models.Video{}), 1)
	assertCount(t, gdb.Model(&models.VideoLocation{}), 1)
	assertCount(t, gdb.Model(&models.JavIdolWork{}), 1)

	if _, err := os.Stat(videoPath); err != nil {
		t.Fatalf("video file was removed: %v", err)
	}

	keepCodes, err := ListKeptCoverCodes(ctx)
	if err != nil {
		t.Fatalf("list kept cover codes: %v", err)
	}
	if _, ok := keepCodes["keep-001"]; !ok {
		t.Fatalf("kept codes missing library jav: %#v", keepCodes)
	}
	if _, ok := keepCodes["work-001"]; !ok {
		t.Fatalf("kept codes missing idol work: %#v", keepCodes)
	}
	if _, ok := keepCodes["orph-001"]; ok {
		t.Fatalf("orphan jav cover should not be kept: %#v", keepCodes)
	}

	leftover, err := CountUnusedScrapedData(ctx)
	if err != nil {
		t.Fatalf("second preview: %v", err)
	}
	if leftover != (UnusedScrapedDataCounts{}) {
		t.Fatalf("leftover = %#v, want empty", leftover)
	}
}

func TestCountUnusedScrapedDataKeepsFavoritedUnusedEntities(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()

	idol := models.JavIdol{Name: "Favorited Idol"}
	studio := models.JavStudio{Name: "Favorited Studio"}
	series := models.JavSeries{Name: "Favorited Series"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	if err := gdb.Create(&studio).Error; err != nil {
		t.Fatalf("create studio: %v", err)
	}
	if err := gdb.Create(&series).Error; err != nil {
		t.Fatalf("create series: %v", err)
	}
	groups := []models.JavFavoriteGroup{
		{EntityType: JavFavoriteEntityIdol, Name: "Idols"},
		{EntityType: JavFavoriteEntityStudio, Name: "Studios"},
		{EntityType: JavFavoriteEntitySeries, Name: "Series"},
	}
	if err := gdb.Create(&groups).Error; err != nil {
		t.Fatalf("create groups: %v", err)
	}
	maps := []models.JavFavoriteMap{
		{JavFavoriteGroupID: groups[0].ID, EntityType: JavFavoriteEntityIdol, EntityID: idol.ID},
		{JavFavoriteGroupID: groups[1].ID, EntityType: JavFavoriteEntityStudio, EntityID: studio.ID},
		{JavFavoriteGroupID: groups[2].ID, EntityType: JavFavoriteEntitySeries, EntityID: series.ID},
	}
	if err := gdb.Create(&maps).Error; err != nil {
		t.Fatalf("create favorite maps: %v", err)
	}

	preview, err := CountUnusedScrapedData(ctx)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if preview != (UnusedScrapedDataCounts{}) {
		t.Fatalf("preview = %#v, want empty", preview)
	}
}

func assertCount(t *testing.T, query *gorm.DB, want int) {
	t.Helper()
	var n int64
	if err := query.Count(&n).Error; err != nil {
		t.Fatalf("count: %v", err)
	}
	if int(n) != want {
		t.Fatalf("count = %d, want %d", n, want)
	}
}
