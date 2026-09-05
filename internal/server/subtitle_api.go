package server

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"javboss/internal/common/logging"
	dbpkg "javboss/internal/db"
	"javboss/internal/models"
	"javboss/internal/subtitle"
)

// localSubtitleItem is a subtitle file discovered next to a video.
type localSubtitleItem struct {
	Name  string `json:"name"`
	Label string `json:"label"`
	IsVTT bool   `json:"is_vtt"`
}

type subtitleSearchItem struct {
	Code          string   `json:"code"`
	CanonicalCode string   `json:"canonical_code,omitempty"`
	Title         string   `json:"title"`
	HasSubtitles  bool     `json:"has_subtitles"`
	Versions      []string `json:"versions"`
}

type subtitleDetailItem struct {
	ID    string `json:"id"`
	Lang  string `json:"lang"`
	Label string `json:"label"`
}

type subtitleSaveRequest struct {
	Code     string `json:"code"`
	Subtitle string `json:"subtitle_id"`
	Format   string `json:"format"` // "srt" | "vtt"
}

// subtitleVideoTarget resolves the video and its primary file path (same
// resolution used by playback) so subtitles are saved next to the video.
func subtitleVideoTarget(c *gin.Context) (*models.Video, string, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		return nil, "", errors.New("invalid id")
	}
	video, err := dbpkg.GetVideo(c.Request.Context(), id)
	if err != nil {
		return nil, "", err
	}
	if video == nil {
		return nil, "", os.ErrNotExist
	}
	fullPath, err := resolveVideoPrimaryPath(c.Request.Context(), video)
	if err != nil {
		return nil, "", err
	}
	if _, err := os.Stat(fullPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, "", err
		}
		return nil, "", err
	}
	return video, fullPath, nil
}

// listLocalSubtitles returns subtitle files for this video. For JAV videos
// (which carry a 番号) only subtitle files whose name contains the code are
// returned, so unrelated subtitles in the same folder are not shown.
func listLocalSubtitles(c *gin.Context) {
	video, fullPath, err := subtitleVideoTarget(c)
	if err != nil {
		respondSubtitleError(c, err)
		return
	}
	subs, err := subtitle.ListLocalSubtitles(fullPath, videoCodeOf(video))
	if err != nil {
		logging.Error("list local subtitles error: %v", err)
		respondLocalizedError(c, http.StatusInternalServerError, "读取本地字幕失败", "Failed to read local subtitles")
		return
	}
	items := make([]localSubtitleItem, 0, len(subs))
	for _, sub := range subs {
		label := sub.Name
		if sub.Matched {
			label += " (匹配)"
		}
		items = append(items, localSubtitleItem{
			Name:  sub.Name,
			Label: label,
			IsVTT: sub.IsVTT,
		})
	}
	c.JSON(http.StatusOK, gin.H{"subtitles": items})
}

// getSubtitleVTT serves a local or online subtitle as WebVTT to the browser
// <track> element. Local .srt files are converted on the fly.
func getSubtitleVTT(c *gin.Context) {
	video, fullPath, err := subtitleVideoTarget(c)
	if err != nil {
		respondSubtitleError(c, err)
		return
	}
	name := strings.TrimSpace(c.Query("name"))
	code := strings.TrimSpace(c.Query("code"))
	subID := strings.TrimSpace(c.Query("subtitle_id"))

	switch {
	case name != "":
		serveLocalSubtitleVTT(c, fullPath, name)
	case code != "" && subID != "":
		serveOnlineSubtitleVTT(c, video, code, subID)
	default:
		respondLocalizedError(c, http.StatusBadRequest, "字幕参数缺失", "Missing subtitle parameters")
	}
}

func serveLocalSubtitleVTT(c *gin.Context, videoPath, name string) {
	dir := filepath.Dir(videoPath)
	base := filepath.Base(name)
	if base != name || filepath.Dir(name) != "." {
		respondLocalizedError(c, http.StatusBadRequest, "字幕文件名无效", "Invalid subtitle file name")
		return
	}
	path := filepath.Join(dir, base)
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			respondLocalizedError(c, http.StatusNotFound, "本地字幕不存在", "Local subtitle does not exist")
			return
		}
		logging.Error("read local subtitle error: %v", err)
		respondLocalizedError(c, http.StatusInternalServerError, "读取本地字幕失败", "Failed to read local subtitle")
		return
	}
	text := subtitle.DecodeToUTF8(data)
	vtt, err := subtitle.VTT(text)
	if err != nil {
		// Raw VTT files pass through as UTF-8; srt files are converted.
		if filepath.Ext(base) == ".vtt" {
			serveVTTResponse(c, []byte(text))
			return
		}
		logging.Error("convert local subtitle to vtt error: %v", err)
		respondLocalizedError(c, http.StatusUnprocessableEntity, "字幕解析失败", "Failed to parse subtitle")
		return
	}
	serveVTTResponse(c, []byte(vtt))
}

func serveOnlineSubtitleVTT(c *gin.Context, video *models.Video, code, subID string) {
	code = sanitizeCode(code)
	if code == "" {
		respondLocalizedError(c, http.StatusBadRequest, "番号无效", "Invalid movie code")
		return
	}
	data, err := subtitle.DownloadJavSubVTT(c.Request.Context(), code, subID)
	if err != nil {
		logging.Error("download jav subtitle error: %v", err)
		respondLocalizedError(c, http.StatusBadGateway, "字幕下载失败", "Failed to download subtitle")
		return
	}
	// Online tracks are already WebVTT; normalize through the parser so the
	// output is a clean, renderable UTF-8 VTT.
	vtt, err := subtitle.VTT(subtitle.DecodeToUTF8(data))
	if err != nil {
		logging.Error("normalize online subtitle error: %v", err)
		respondLocalizedError(c, http.StatusUnprocessableEntity, "字幕解析失败", "Failed to parse subtitle")
		return
	}
	serveVTTResponse(c, []byte(vtt))
}

func serveVTTResponse(c *gin.Context, data []byte) {
	c.Header("Content-Type", "text/vtt; charset=utf-8")
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, "text/vtt; charset=utf-8", data)
}

// searchJavSubtitles queries the online JAV subtitle index by the video's 番号
// (or a manual query when provided).
func searchJavSubtitles(c *gin.Context) {
	video, _, err := subtitleVideoTarget(c)
	if err != nil {
		respondSubtitleError(c, err)
		return
	}
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		query = videoCodeOf(video)
	}
	if query == "" {
		respondLocalizedError(c, http.StatusBadRequest, "缺少番号，无法搜索", "Missing movie code for search")
		return
	}
	items, err := subtitle.SearchJavSubMovies(c.Request.Context(), query)
	if err != nil {
		logging.Error("search jav subtitle error: %v", err)
		respondLocalizedError(c, http.StatusBadGateway, "字幕搜索失败", "Subtitle search failed")
		return
	}
	out := make([]subtitleSearchItem, 0, len(items))
	for _, item := range items {
		out = append(out, subtitleSearchItem{
			Code:          item.Code,
			CanonicalCode: item.CanonicalCode,
			Title:         item.Title,
			HasSubtitles:  item.HasSubtitles,
			Versions:      item.AvailableVersions,
		})
	}
	c.JSON(http.StatusOK, gin.H{"query": query, "items": out})
}

// getJavSubtitleDetail lists the language tracks available for one movie.
func getJavSubtitleDetail(c *gin.Context) {
	code := sanitizeCode(c.Query("code"))
	if code == "" {
		respondLocalizedError(c, http.StatusBadRequest, "番号无效", "Invalid movie code")
		return
	}
	title, tracks, err := subtitle.GetJavSubMovieDetail(c.Request.Context(), code)
	if err != nil {
		logging.Error("get jav subtitle detail error: %v", err)
		respondLocalizedError(c, http.StatusBadGateway, "字幕详情获取失败", "Failed to load subtitle details")
		return
	}
	items := make([]subtitleDetailItem, 0, len(tracks))
	for _, track := range tracks {
		items = append(items, subtitleDetailItem{
			ID:    track.ID,
			Lang:  track.Lang,
			Label: track.Label,
		})
	}
	c.JSON(http.StatusOK, gin.H{"code": code, "title": title, "subtitles": items})
}

// saveJavSubtitle downloads an online subtitle and writes it next to the video
// as "<番号>.srt" (or "<番号>.vtt"). When that name already exists locally, a
// numeric suffix is appended ("<番号>-2.srt") so the existing file is never
// overwritten.
func saveJavSubtitle(c *gin.Context) {
	video, fullPath, err := subtitleVideoTarget(c)
	if err != nil {
		respondSubtitleError(c, err)
		return
	}
	var req subtitleSaveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondLocalizedError(c, http.StatusBadRequest, "请求参数无效", "Invalid request body")
		return
	}
	code := sanitizeCode(req.Code)
	if code == "" {
		respondLocalizedError(c, http.StatusBadRequest, "番号无效", "Invalid movie code")
		return
	}
	subID := strings.TrimSpace(req.Subtitle)
	if subID == "" {
		respondLocalizedError(c, http.StatusBadRequest, "缺少字幕标识", "Missing subtitle id")
		return
	}
	data, err := subtitle.DownloadJavSubVTT(c.Request.Context(), code, subID)
	if err != nil {
		logging.Error("download jav subtitle for save error: %v", err)
		respondLocalizedError(c, http.StatusBadGateway, "字幕下载失败", "Failed to download subtitle")
		return
	}

	format := strings.ToLower(strings.TrimSpace(req.Format))
	if format != "srt" && format != "vtt" {
		format = "srt"
	}
	text := subtitle.DecodeToUTF8(data)
	if format == "srt" {
		converted, cerr := subtitle.SRT(text)
		if cerr != nil {
			logging.Error("convert online subtitle to srt error: %v", cerr)
			respondLocalizedError(c, http.StatusUnprocessableEntity, "字幕转换失败", "Failed to convert subtitle")
			return
		}
		text = converted
	} else if converted, cerr := subtitle.VTT(text); cerr == nil {
		text = converted
	}

	name := videoCodeOf(video)
	if name == "" {
		name = strings.TrimSuffix(filepath.Base(fullPath), filepath.Ext(fullPath))
	}
	name = subtitleFileStem(name)
	savePath, err := nextAvailablePath(filepath.Join(filepath.Dir(fullPath), name+"."+format))
	if err != nil {
		logging.Error("resolve subtitle save path error: %v", err)
		respondLocalizedError(c, http.StatusInternalServerError, "保存字幕失败", "Failed to save subtitle")
		return
	}
	if err := os.WriteFile(savePath, []byte(text), 0o644); err != nil {
		logging.Error("write subtitle file error: path=%s err=%v", savePath, err)
		if isUnwritableError(err) {
			respondLocalizedError(c, http.StatusInternalServerError, "保存字幕失败：视频目录只读，请去掉 Docker 挂载末尾的 :ro", "Failed to save subtitle: media library is mounted read-only")
			return
		}
		respondLocalizedError(c, http.StatusInternalServerError, "保存字幕失败", "Failed to save subtitle")
		return
	}
	c.JSON(http.StatusOK, gin.H{"name": filepath.Base(savePath)})
}

func isUnwritableError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, os.ErrPermission) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "read-only") ||
		strings.Contains(msg, "erofs") ||
		strings.Contains(msg, "permission denied") ||
		strings.Contains(msg, "operation not permitted")
}

// nextAvailablePath returns a path that does not currently exist on disk,
// inserting a numeric suffix before the extension when the base name is taken:
// "SSIS-480.srt" -> "SSIS-480-2.srt" -> "SSIS-480-3.srt". It never overwrites
// an existing file, so a previously saved local subtitle is always preserved.
func nextAvailablePath(path string) (string, error) {
	if !pathExists(path) {
		return path, nil
	}
	dir := filepath.Dir(path)
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	for i := 2; ; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s-%d%s", stem, i, ext))
		if !pathExists(candidate) {
			return candidate, nil
		}
	}
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// subtitleFileStem returns a filename stem that is safe to write next to a
// video on Windows and Unix. Path separators and reserved characters are
// replaced so os.WriteFile cannot be pointed at another directory.
func subtitleFileStem(name string) string {
	name = strings.TrimSpace(name)
	name = filepath.Base(name)
	if name == "." || name == string(filepath.Separator) {
		name = ""
	}
	var b strings.Builder
	b.Grow(len(name))
	for _, r := range name {
		switch r {
		case '<', '>', ':', '"', '/', '\\', '|', '?', '*':
			b.WriteByte('_')
		default:
			if r < 32 {
				b.WriteByte('_')
				continue
			}
			b.WriteRune(r)
		}
	}
	name = strings.Trim(b.String(), " .")
	if name == "" {
		return "subtitle"
	}
	return name
}

// videoCodeOf returns the JAV 番号 of a video when available.
func videoCodeOf(video *models.Video) string {
	if video == nil {
		return ""
	}
	if video.Jav != nil {
		if code := strings.TrimSpace(video.Jav.Code); code != "" {
			return code
		}
	}
	if code := strings.TrimSpace(video.JavScrapeOverride); code != "" && code != models.JavScrapeOverrideSkip &&
		!strings.HasPrefix(code, models.JavScrapeOverrideManualPrefix) {
		return code
	}
	return ""
}

func sanitizeCode(code string) string {
	code = strings.TrimSpace(code)
	if code == "" || len(code) > 128 {
		return ""
	}
	for _, r := range code {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '-', r == '.', r == '_', r == '+':
		default:
			return ""
		}
	}
	return code
}

func respondSubtitleError(c *gin.Context, err error) {
	if errors.Is(err, os.ErrNotExist) {
		respondLocalizedError(c, http.StatusNotFound, "视频不存在", "Video does not exist")
		return
	}
	logging.Error("resolve subtitle video target error: %v", err)
	respondLocalizedError(c, http.StatusInternalServerError, "加载视频失败", "Failed to load video")
}
