package server

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"javboss/internal/service"
)

func getJavScrapeStatus(c *gin.Context) {
	c.JSON(http.StatusOK, service.JavScrapeStatus())
}
