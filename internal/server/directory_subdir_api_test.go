package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"javboss/internal/common"
	dbpkg "javboss/internal/db"
	"javboss/internal/models"
)

func TestListDirectorySubdirectoriesHandler(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	previousDB := common.DB
	common.DB = database
	t.Cleanup(func() {
		common.DB = previousDB
		if sqlDB, dbErr := database.DB(); dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	ctx := context.Background()
	dir := models.Directory{Path: "/media/subdir-api"}
	if err := database.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	for i, rel := range []string{"root.mp4", "JAV/IPX-001.mp4", "JAV/IPX-002.mp4"} {
		video := models.Video{Fingerprint: "subdir-api-" + string(rune('a'+i))}
		if err := database.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		if _, err := dbpkg.UpsertVideoLocation(
			ctx,
			video.ID,
			dir.ID,
			rel,
			time.Unix(1710000000, 0).UTC(),
		); err != nil {
			t.Fatalf("upsert location %s: %v", rel, err)
		}
	}

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/directories/:id/subdirectories", listDirectorySubdirectories)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodGet,
		"/directories/"+strconv.FormatInt(dir.ID, 10)+"/subdirectories",
		nil,
	)
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 body=%s", recorder.Code, recorder.Body.String())
	}
	var payload dbpkg.DirectorySubdirectories
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v body=%s", err, recorder.Body.String())
	}
	if payload.RootVideoCount != 1 {
		t.Fatalf("root video count = %d, want 1", payload.RootVideoCount)
	}
	if len(payload.Subdirectories) != 1 || payload.Subdirectories[0].Name != "JAV" || payload.Subdirectories[0].VideoCount != 2 {
		t.Fatalf("subdirectories = %#v, want JAV with 2 videos", payload.Subdirectories)
	}

	// Unknown directory id returns 404.
	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/directories/99999/subdirectories", nil)
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("unknown directory status = %d, want 404", recorder.Code)
	}
}
