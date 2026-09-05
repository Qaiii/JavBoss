package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"javboss/internal/common"
	dbpkg "javboss/internal/db"
	"javboss/internal/models"
	"javboss/internal/service"
)

func TestScrapedDataCleanupPreviewAndRun(t *testing.T) {
	gin.SetMode(gin.TestMode)
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "cleanup.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("database handle: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	previousDB := common.DB
	common.DB = database
	t.Cleanup(func() { common.DB = previousDB })

	now := time.Unix(1710000000, 0).UTC()
	keep := models.Jav{Code: "KEEP-API", Title: "Keep", FetchedAt: now, CreatedAt: now}
	orphan := models.Jav{Code: "ORPH-API", Title: "Orphan", FetchedAt: now, CreatedAt: now}
	if err := database.Create(&keep).Error; err != nil {
		t.Fatalf("create keep jav: %v", err)
	}
	if err := database.Create(&orphan).Error; err != nil {
		t.Fatalf("create orphan jav: %v", err)
	}
	dir := models.Directory{Path: t.TempDir()}
	if err := database.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	video := models.Video{Fingerprint: "cleanup-api-video"}
	if err := database.Create(&video).Error; err != nil {
		t.Fatalf("create video: %v", err)
	}
	location, err := dbpkg.UpsertVideoLocation(context.Background(), video.ID, dir.ID, "keep.mp4", now)
	if err != nil {
		t.Fatalf("create location: %v", err)
	}
	if err := database.Model(&models.VideoLocation{}).Where("id = ?", location.ID).Update("jav_id", keep.ID).Error; err != nil {
		t.Fatalf("link location: %v", err)
	}

	router := gin.New()
	router.GET("/tools/scraped-data-cleanup", getScrapedDataCleanup)
	router.POST("/tools/scraped-data-cleanup", runScrapedDataCleanup)

	get := httptest.NewRecorder()
	router.ServeHTTP(get, httptest.NewRequest(http.MethodGet, "/tools/scraped-data-cleanup", nil))
	if get.Code != http.StatusOK {
		t.Fatalf("GET status = %d body=%s", get.Code, get.Body.String())
	}
	var preview service.ScrapedDataCleanupReport
	if err := json.Unmarshal(get.Body.Bytes(), &preview); err != nil {
		t.Fatalf("decode GET body: %v", err)
	}
	if preview.Javs != 1 || preview.Total != 1 {
		t.Fatalf("GET report = %#v", preview)
	}

	post := httptest.NewRecorder()
	router.ServeHTTP(post, httptest.NewRequest(http.MethodPost, "/tools/scraped-data-cleanup", nil))
	if post.Code != http.StatusOK {
		t.Fatalf("POST status = %d body=%s", post.Code, post.Body.String())
	}
	var report service.ScrapedDataCleanupReport
	if err := json.Unmarshal(post.Body.Bytes(), &report); err != nil {
		t.Fatalf("decode POST body: %v", err)
	}
	if report.Javs != 1 || report.CleanedAt == nil {
		t.Fatalf("POST report = %#v", report)
	}

	var leftover int64
	if err := database.Model(&models.Jav{}).Count(&leftover).Error; err != nil {
		t.Fatalf("count javs: %v", err)
	}
	if leftover != 1 {
		t.Fatalf("jav count = %d, want 1", leftover)
	}
}
