package server

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"javboss/internal/common/logging"
	"javboss/internal/service"
)

func getJavScrapeCheck(c *gin.Context) {
	c.JSON(http.StatusOK, service.JavScrapeCheckStatus())
}

func runJavScrapeCheck(c *gin.Context) {
	report, err := service.CheckAndRepairJavScrape(c.Request.Context())
	if err != nil {
		logging.Error("jav scrape check failed: %v", err)
		respondLocalizedError(c, http.StatusInternalServerError, "检查 JAV 抓取情况失败", "Failed to check JAV scrape completeness")
		return
	}
	c.JSON(http.StatusOK, report)
}
