package service

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"javboss/internal/cache"
	"javboss/internal/common"
	"javboss/internal/db"
	"javboss/internal/jav"
	"javboss/internal/models"
)

func TestCleanScrapedDataRemovesUnusedMetadataAndCoversNotVideos(t *testing.T) {
	gdb, err := db.Open(filepath.Join(t.TempDir(), "cleanup.db"))
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
	scrapedDataCleanupResetForTest()
	t.Cleanup(scrapedDataCleanupResetForTest)

	coverDir := t.TempDir()
	libraryDir := t.TempDir()
	previousConfig := common.AppConfig
	common.AppConfig = &common.Config{JavCoverDir: coverDir}
	t.Cleanup(func() { common.AppConfig = previousConfig })

	store, err := cache.OpenSQLiteKV(filepath.Join(t.TempDir(), "jav_cache.db"))
	if err != nil {
		t.Fatalf("open lookup cache: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	jav.SetCache(store)
	t.Cleanup(func() { jav.SetCache(nil) })
	now := time.Unix(1710000000, 0).UTC()
	if err := store.Set("stale", []byte("old"), now.Add(-time.Minute)); err != nil {
		t.Fatalf("set expired cache: %v", err)
	}

	directory := models.Directory{Path: libraryDir}
	if err := gdb.Create(&directory).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	videoPath := filepath.Join(libraryDir, "keep.mp4")
	if err := os.WriteFile(videoPath, []byte("video-bytes"), 0o644); err != nil {
		t.Fatalf("write video file: %v", err)
	}
	keepJav := models.Jav{Code: "KEEP-001", Title: "Keep", FetchedAt: now, CreatedAt: now, UpdatedAt: now}
	orphanJav := models.Jav{Code: "ORPH-001", Title: "Orphan", FetchedAt: now, CreatedAt: now, UpdatedAt: now}
	if err := gdb.Create(&keepJav).Error; err != nil {
		t.Fatalf("create keep jav: %v", err)
	}
	if err := gdb.Create(&orphanJav).Error; err != nil {
		t.Fatalf("create orphan jav: %v", err)
	}
	video := models.Video{Fingerprint: "keep-video"}
	if err := gdb.Create(&video).Error; err != nil {
		t.Fatalf("create video: %v", err)
	}
	location, err := db.UpsertVideoLocation(context.Background(), video.ID, directory.ID, "keep.mp4", now)
	if err != nil {
		t.Fatalf("create location: %v", err)
	}
	if err := gdb.Model(&models.VideoLocation{}).Where("id = ?", location.ID).Update("jav_id", keepJav.ID).Error; err != nil {
		t.Fatalf("link location: %v", err)
	}

	for name, body := range map[string]string{
		"keep-001.jpg": "keep",
		"orph-001.jpg": "orphan",
	} {
		if err := os.WriteFile(filepath.Join(coverDir, name), []byte(body), 0o644); err != nil {
			t.Fatalf("write cover %s: %v", name, err)
		}
	}

	ctx := context.Background()
	preview, err := PreviewScrapedDataCleanup(ctx)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if preview.Javs != 1 || preview.Covers != 1 || preview.ExpiredCache != 1 || preview.Total != 3 {
		t.Fatalf("preview = %#v", preview)
	}

	report, err := CleanScrapedData(ctx)
	if err != nil {
		t.Fatalf("clean: %v", err)
	}
	if report.Javs != 1 || report.Covers != 1 || report.ExpiredCache != 1 || report.CleanedAt == nil {
		t.Fatalf("report = %#v", report)
	}

	var leftover int64
	if err := gdb.Model(&models.Jav{}).Count(&leftover).Error; err != nil {
		t.Fatalf("count javs: %v", err)
	}
	if leftover != 1 {
		t.Fatalf("jav count = %d, want 1", leftover)
	}
	if _, err := os.Stat(videoPath); err != nil {
		t.Fatalf("video file removed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(coverDir, "keep-001.jpg")); err != nil {
		t.Fatalf("kept cover removed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(coverDir, "orph-001.jpg")); !os.IsNotExist(err) {
		t.Fatalf("orphan cover still present: %v", err)
	}
}
