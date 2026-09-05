package server

import (
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

func TestJavScrapeCheckReportsIncompleteLibraryRows(t *testing.T) {
	gin.SetMode(gin.TestMode)
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "scrape-check.db"))
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
	if err := database.Create(&models.Jav{Code: "MISS-API", FetchedAt: now, CreatedAt: now}).Error; err != nil {
		t.Fatalf("create jav: %v", err)
	}

	router := gin.New()
	router.GET("/tools/jav-scrape-check", getJavScrapeCheck)
	router.POST("/tools/jav-scrape-check", runJavScrapeCheck)

	post := httptest.NewRecorder()
	router.ServeHTTP(post, httptest.NewRequest(http.MethodPost, "/tools/jav-scrape-check", nil))
	if post.Code != http.StatusOK {
		t.Fatalf("POST status = %d body=%s", post.Code, post.Body.String())
	}
	var report service.JavScrapeCheckReport
	if err := json.Unmarshal(post.Body.Bytes(), &report); err != nil {
		t.Fatalf("decode POST body: %v", err)
	}
	if report.Total != 1 || report.Incomplete != 1 || report.Fields["title"] != 1 {
		t.Fatalf("POST report = %#v", report)
	}

	get := httptest.NewRecorder()
	router.ServeHTTP(get, httptest.NewRequest(http.MethodGet, "/tools/jav-scrape-check", nil))
	if get.Code != http.StatusOK {
		t.Fatalf("GET status = %d body=%s", get.Code, get.Body.String())
	}
	var status service.JavScrapeCheckReport
	if err := json.Unmarshal(get.Body.Bytes(), &status); err != nil {
		t.Fatalf("decode GET body: %v", err)
	}
	if status.Total != 1 || status.Incomplete != 1 {
		t.Fatalf("GET status = %#v", status)
	}
}
