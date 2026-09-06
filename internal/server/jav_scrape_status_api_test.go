package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"javboss/internal/service"
)

func TestJavScrapeStatusReportsSourcesAndQueues(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/tools/jav-scrape-status", getJavScrapeStatus)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/tools/jav-scrape-status", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", recorder.Code, recorder.Body.String())
	}

	var report service.JavScrapeStatusReport
	if err := json.Unmarshal(recorder.Body.Bytes(), &report); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if len(report.Sources) < 12 {
		t.Fatalf("sources = %d, want at least 12", len(report.Sources))
	}

	foundJavBus := false
	foundSubtitle := false
	for _, source := range report.Sources {
		if source.ID == "javbus" {
			foundJavBus = true
			if len(source.URLs) == 0 || source.IntervalMS < 3000 {
				t.Fatalf("javbus source = %#v", source)
			}
		}
		if source.ID == "javsubtitle" {
			foundSubtitle = true
			if len(source.URLs) == 0 || source.IntervalMS < 3000 {
				t.Fatalf("javsubtitle source = %#v", source)
			}
		}
	}
	if !foundJavBus || !foundSubtitle {
		t.Fatalf("missing expected sources: javbus=%v javsubtitle=%v", foundJavBus, foundSubtitle)
	}

	wantQueues := map[string]struct{}{
		service.JavScrapeQueueCovers:           {},
		service.JavScrapeQueueMetadataRepair:   {},
		service.JavScrapeQueueIdolWorks:        {},
		service.JavScrapeQueueIdolWorkMetadata: {},
	}
	if len(report.Queues) != len(wantQueues) {
		t.Fatalf("queues = %#v", report.Queues)
	}
	for _, queue := range report.Queues {
		if _, ok := wantQueues[queue.ID]; !ok {
			t.Fatalf("unexpected queue %s", queue.ID)
		}
		if queue.Pending < 0 {
			t.Fatalf("queue %s pending = %d", queue.ID, queue.Pending)
		}
		delete(wantQueues, queue.ID)
	}
	if len(wantQueues) != 0 {
		t.Fatalf("missing queues %#v", wantQueues)
	}
}
