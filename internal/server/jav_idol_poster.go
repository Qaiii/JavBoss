package server

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"javboss/internal/common"
	"javboss/internal/common/logging"
	dbpkg "javboss/internal/db"
	"javboss/internal/models"
)

type idolPosterOptionWork struct {
	JavID   int64                   `json:"jav_id"`
	Code    string                  `json:"code"`
	Title   string                  `json:"title"`
	TitleZH string                  `json:"title_zh"`
	Videos  []idolPosterOptionVideo `json:"videos"`
}

type idolPosterOptionVideo struct {
	VideoID     int64                 `json:"video_id"`
	Filename    string                `json:"filename"`
	Screenshots []videoScreenshotInfo `json:"screenshots"`
}

func listJavIdolPosterOptions(c *gin.Context) {
	id, ok := parsePositiveIdolID(c)
	if !ok {
		return
	}
	if common.AppConfig == nil {
		respondLocalizedError(c, http.StatusInternalServerError, "应用配置尚未加载", "Application configuration is not loaded")
		return
	}

	rows, err := dbpkg.ListIdolPosterWorkVideos(c.Request.Context(), id, nil)
	if err != nil {
		logging.Error("list idol poster work videos id=%d: %v", id, err)
		respondLocalizedError(c, http.StatusInternalServerError, "加载女优海报选项失败", "Failed to load idol poster options")
		return
	}

	videoIDs := make([]int64, 0, len(rows))
	seenVideo := map[int64]bool{}
	for _, row := range rows {
		if row.VideoID <= 0 || seenVideo[row.VideoID] {
			continue
		}
		seenVideo[row.VideoID] = true
		videoIDs = append(videoIDs, row.VideoID)
	}
	coverNames, err := dbpkg.ListVideoCoverScreenshotNames(c.Request.Context(), videoIDs)
	if err != nil {
		logging.Error("list idol poster cover names id=%d: %v", id, err)
		respondLocalizedError(c, http.StatusInternalServerError, "加载女优海报选项失败", "Failed to load idol poster options")
		return
	}

	dataDir := filepath.Dir(common.AppConfig.DatabasePath)
	screenshotsByVideo := map[int64][]videoScreenshotInfo{}
	for _, videoID := range videoIDs {
		screenshotDir := filepath.Join(dataDir, "video", strconv.FormatInt(videoID, 10), "screenshot")
		items, err := readVideoScreenshotInfos(videoID, coverNames[videoID], screenshotDir)
		if err != nil {
			logging.Error("read idol poster screenshots id=%d video=%d: %v", id, videoID, err)
			respondLocalizedError(c, http.StatusInternalServerError, "加载女优海报选项失败", "Failed to load idol poster options")
			return
		}
		screenshotsByVideo[videoID] = items
	}

	works := make([]idolPosterOptionWork, 0)
	indexByJav := map[int64]int{}
	for _, row := range rows {
		index, exists := indexByJav[row.JavID]
		if !exists {
			index = len(works)
			indexByJav[row.JavID] = index
			works = append(works, idolPosterOptionWork{
				JavID:   row.JavID,
				Code:    strings.TrimSpace(row.Code),
				Title:   strings.TrimSpace(row.Title),
				TitleZH: strings.TrimSpace(row.TitleZH),
				Videos:  []idolPosterOptionVideo{},
			})
		}
		screenshots := screenshotsByVideo[row.VideoID]
		if len(screenshots) == 0 {
			continue
		}
		works[index].Videos = append(works[index].Videos, idolPosterOptionVideo{
			VideoID:     row.VideoID,
			Filename:    strings.TrimSpace(row.Filename),
			Screenshots: screenshots,
		})
	}
	filtered := works[:0]
	for _, work := range works {
		if len(work.Videos) == 0 {
			continue
		}
		filtered = append(filtered, work)
	}
	c.JSON(http.StatusOK, gin.H{"items": filtered})
}

func updateJavIdolPoster(c *gin.Context) {
	id, ok := parsePositiveIdolID(c)
	if !ok {
		return
	}
	var req struct {
		Images models.JavIdolPosterImages `json:"images"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondLocalizedError(c, http.StatusBadRequest, "更新女优海报请求无效", "Invalid idol poster update request")
		return
	}
	normalized := req.Images.Normalized()
	for _, image := range normalized {
		switch image.Kind {
		case models.JavIdolPosterKindScreenshot:
			if !isScreenshotImageName(image.Name) {
				respondLocalizedError(c, http.StatusBadRequest, "海报截图文件名无效", "Invalid poster screenshot filename")
				return
			}
		case models.JavIdolPosterKindUpload:
			if !isIdolPosterUploadName(image.Name) {
				respondLocalizedError(c, http.StatusBadRequest, "自定义海报文件名无效", "Invalid custom poster filename")
				return
			}
			if common.AppConfig == nil {
				respondLocalizedError(c, http.StatusInternalServerError, "应用配置尚未加载", "Application configuration is not loaded")
				return
			}
			path := idolPosterFilePath(filepath.Dir(common.AppConfig.DatabasePath), id, image.Name)
			if _, err := os.Stat(path); err != nil {
				respondLocalizedError(c, http.StatusBadRequest, "自定义海报文件不存在", "Custom poster file was not found")
				return
			}
		}
	}

	item, err := dbpkg.UpdateJavIdolPosterImages(c.Request.Context(), id, normalized, nil)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			respondLocalizedError(c, http.StatusNotFound, "女优不存在", "Idol was not found")
			return
		}
		logging.Error("update jav idol poster id=%d: %v", id, err)
		respondLocalizedError(c, http.StatusBadRequest, "保存女优海报失败", "Failed to save idol poster")
		return
	}

	if common.AppConfig != nil {
		if err := pruneIdolPosterUploads(filepath.Dir(common.AppConfig.DatabasePath), id, normalized); err != nil {
			logging.Error("prune idol poster uploads id=%d: %v", id, err)
		}
	}

	items := []dbpkg.JavIdolSummary{*item}
	enrichJavIdolSummaries(c.Request.Context(), items)
	c.JSON(http.StatusOK, items[0])
}

func uploadJavIdolPoster(c *gin.Context) {
	id, ok := parsePositiveIdolID(c)
	if !ok {
		return
	}
	if common.AppConfig == nil {
		respondLocalizedError(c, http.StatusInternalServerError, "应用配置尚未加载", "Application configuration is not loaded")
		return
	}
	if _, err := dbpkg.GetJavIdolSummary(c.Request.Context(), id, nil); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			respondLocalizedError(c, http.StatusNotFound, "女优不存在", "Idol was not found")
			return
		}
		logging.Error("get jav idol for poster upload id=%d: %v", id, err)
		respondLocalizedError(c, http.StatusInternalServerError, "加载女优信息失败", "Failed to load idol information")
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		respondLocalizedError(c, http.StatusBadRequest, "请选择要上传的海报图片", "Choose a poster image to upload")
		return
	}
	defer file.Close()
	if header != nil && header.Size > maxScreenshotUploadBytes {
		respondLocalizedError(c, http.StatusRequestEntityTooLarge, "海报图片过大", "The poster image is too large")
		return
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		respondLocalizedError(c, http.StatusUnsupportedMediaType, "海报图片格式无效", "The poster image format is invalid")
		return
	}
	name, err := newIdolPosterUploadName(ext)
	if err != nil {
		logging.Error("generate idol poster name id=%d: %v", id, err)
		respondLocalizedError(c, http.StatusInternalServerError, "保存女优海报失败", "Failed to save idol poster")
		return
	}

	dir := idolPosterDir(filepath.Dir(common.AppConfig.DatabasePath), id)
	info, err := saveUploadedScreenshot(dir, name, io.LimitReader(file, maxScreenshotUploadBytes+1))
	if err != nil {
		switch {
		case errors.Is(err, errScreenshotUploadTooLarge):
			respondLocalizedError(c, http.StatusRequestEntityTooLarge, "海报图片过大", "The poster image is too large")
		case errors.Is(err, errScreenshotUploadType):
			respondLocalizedError(c, http.StatusUnsupportedMediaType, "海报图片格式无效", "The poster image format is invalid")
		default:
			logging.Error("save idol poster upload id=%d: %v", id, err)
			respondLocalizedError(c, http.StatusInternalServerError, "保存女优海报失败", "Failed to save idol poster")
		}
		return
	}

	image := models.JavIdolPosterImage{
		Kind: models.JavIdolPosterKindUpload,
		Name: name,
	}
	image.URL = idolPosterURL(id, image, info.ModTime().UnixNano())
	c.JSON(http.StatusCreated, image)
}

func getJavIdolPoster(c *gin.Context) {
	id, ok := parsePositiveIdolID(c)
	if !ok {
		return
	}
	name := filepath.Base(strings.TrimSpace(c.Param("name")))
	if !isIdolPosterUploadName(name) || name != strings.TrimSpace(c.Param("name")) {
		respondLocalizedError(c, http.StatusBadRequest, "自定义海报文件名无效", "Invalid custom poster filename")
		return
	}
	if common.AppConfig == nil {
		respondLocalizedError(c, http.StatusInternalServerError, "应用配置尚未加载", "Application configuration is not loaded")
		return
	}
	path := idolPosterFilePath(filepath.Dir(common.AppConfig.DatabasePath), id, name)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			respondLocalizedError(c, http.StatusNotFound, "自定义海报不存在", "Custom poster was not found")
			return
		}
		logging.Error("stat idol poster id=%d name=%s: %v", id, name, err)
		respondLocalizedError(c, http.StatusInternalServerError, "读取女优海报失败", "Failed to read idol poster")
		return
	}
	c.File(path)
}

func parsePositiveIdolID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		respondLocalizedError(c, http.StatusBadRequest, "女优 ID 无效", "Invalid idol ID")
		return 0, false
	}
	return id, true
}

func newIdolPosterUploadName(ext string) (string, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", fmt.Errorf("read random: %w", err)
	}
	return "upload_" + hex.EncodeToString(buf[:]) + strings.ToLower(ext), nil
}

func isIdolPosterUploadName(name string) bool {
	if strings.TrimSpace(name) == "" || filepath.Base(name) != name {
		return false
	}
	if !strings.HasPrefix(name, "upload_") {
		return false
	}
	rest := strings.TrimPrefix(name, "upload_")
	dot := strings.LastIndex(rest, ".")
	if dot != 16 {
		return false
	}
	for _, ch := range rest[:16] {
		if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') {
			return false
		}
	}
	switch strings.ToLower(rest[dot:]) {
	case ".jpg", ".jpeg", ".png", ".webp":
		return true
	default:
		return false
	}
}

func idolPosterDir(dataDir string, idolID int64) string {
	return filepath.Join(dataDir, "idol", strconv.FormatInt(idolID, 10), "poster")
}

func idolPosterFilePath(dataDir string, idolID int64, name string) string {
	return filepath.Join(idolPosterDir(dataDir, idolID), filepath.Base(name))
}

func idolPosterURL(idolID int64, image models.JavIdolPosterImage, mtime int64) string {
	switch image.Kind {
	case models.JavIdolPosterKindUpload:
		value := "/jav/idols/" + strconv.FormatInt(idolID, 10) + "/poster/" + url.PathEscape(image.Name)
		if mtime > 0 {
			value += "?mtime=" + strconv.FormatInt(mtime, 10)
		}
		return value
	case models.JavIdolPosterKindScreenshot:
		value := "/videos/" + strconv.FormatInt(image.VideoID, 10) + "/screenshots/" + url.PathEscape(image.Name)
		if mtime > 0 {
			value += "?mtime=" + strconv.FormatInt(mtime, 10)
		}
		return value
	default:
		return ""
	}
}

func pruneIdolPosterUploads(dataDir string, idolID int64, images models.JavIdolPosterImages) error {
	dir := idolPosterDir(dataDir, idolID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read idol poster dir: %w", err)
	}
	keep := map[string]bool{}
	for _, image := range images {
		if image.Kind == models.JavIdolPosterKindUpload {
			keep[image.Name] = true
		}
	}
	for _, entry := range entries {
		if entry.IsDir() || keep[entry.Name()] {
			continue
		}
		if !isIdolPosterUploadName(entry.Name()) {
			continue
		}
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("remove unused idol poster %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func enrichIdolPosterImages(idolID int64, images models.JavIdolPosterImages) models.JavIdolPosterImages {
	if len(images) == 0 {
		return models.JavIdolPosterImages{}
	}
	if common.AppConfig == nil {
		out := make(models.JavIdolPosterImages, 0, len(images))
		for _, image := range images {
			image.URL = idolPosterURL(idolID, image, 0)
			out = append(out, image)
		}
		return out
	}
	dataDir := filepath.Dir(common.AppConfig.DatabasePath)
	out := make(models.JavIdolPosterImages, 0, len(images))
	for _, image := range images {
		var mtime int64
		var path string
		switch image.Kind {
		case models.JavIdolPosterKindUpload:
			path = idolPosterFilePath(dataDir, idolID, image.Name)
		case models.JavIdolPosterKindScreenshot:
			path = filepath.Join(dataDir, "video", strconv.FormatInt(image.VideoID, 10), "screenshot", filepath.Base(image.Name))
		}
		if path != "" {
			if info, err := os.Stat(path); err == nil {
				mtime = info.ModTime().UnixNano()
			}
		}
		image.URL = idolPosterURL(idolID, image, mtime)
		out = append(out, image)
	}
	return out
}
