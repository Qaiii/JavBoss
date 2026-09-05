package server

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"javboss/internal/common/logging"
	"javboss/internal/service"
)

func getScrapedDataCleanup(c *gin.Context) {
	report, err := service.PreviewScrapedDataCleanup(c.Request.Context())
	if err != nil {
		logging.Error("preview scraped data cleanup failed: %v", err)
		respondLocalizedError(c, http.StatusInternalServerError, "预览可清理的抓取数据失败", "Failed to preview unused scraped data")
		return
	}
	c.JSON(http.StatusOK, report)
}

func runScrapedDataCleanup(c *gin.Context) {
	report, err := service.CleanScrapedData(c.Request.Context())
	if err != nil {
		if errors.Is(err, service.ErrScrapedDataCleanupBusy) {
			respondLocalizedError(c, http.StatusConflict, "正在清理抓取数据，请稍后再试", "Scraped data cleanup is already running")
			return
		}
		logging.Error("scraped data cleanup failed: %v", err)
		respondLocalizedError(c, http.StatusInternalServerError, "清理抓取数据失败", "Failed to clean unused scraped data")
		return
	}
	c.JSON(http.StatusOK, report)
}
