package subtitle

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// localSubtitleExtensions are the formats the browser player can render. ASS
// files are excluded because browsers have no native ASS support and rendering
// them requires a complex text layout engine.
var localSubtitleExtensions = map[string]bool{
	".srt": true,
	".vtt": true,
}

// LocalSubtitle is one subtitle file found next to a video.
type LocalSubtitle struct {
	Name    string `json:"name"`
	Path    string `json:"-"`
	IsVTT   bool   `json:"is_vtt"`
	Matched bool   `json:"matched"`
}

// ListLocalSubtitles scans the video's directory for subtitle files and returns
// them ordered by how closely their name matches the video file name. When code
// is non-empty, only subtitle files whose name contains that code (the JAV 番号)
// are returned. When code is empty the filter falls back to the video file name,
// so unrelated subtitles in the same directory are hidden either way.
func ListLocalSubtitles(videoPath, code string) ([]LocalSubtitle, error) {
	dir := filepath.Dir(videoPath)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	videoBase := normalizeName(filepath.Base(videoPath))
	codeTokens := strings.Fields(normalizeName(code))
	var subs []LocalSubtitle
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if !localSubtitleExtensions[ext] {
			continue
		}
		subBase := normalizeName(entry.Name())
		if len(codeTokens) > 0 {
			// 有番号：字幕名必须完整包含番号的每个词元（如 "WAAA-366" -> waaa + 366），
			// 且作为连续片段出现——"WAAA-36.srt"、同系列的 "ABC-123"（番号为
			// ABC-12）这类部分/粘连编号不会被误判为匹配。
			if !containsTokenSeq(strings.Fields(subBase), codeTokens) {
				continue
			}
		} else if matchScore(videoBase, subBase) <= 0 {
			// 无番号可依（视频未关联 JAV 元数据）：退化为按视频文件名过滤，
			// 只显示与本视频文件有关联的字幕，避免同目录其他视频的字幕混入。
			continue
		}
		subs = append(subs, LocalSubtitle{
			Name:    entry.Name(),
			Path:    filepath.Join(dir, entry.Name()),
			IsVTT:   ext == ".vtt",
			Matched: matchScore(videoBase, subBase) > 0,
		})
	}

	sort.SliceStable(subs, func(i, j int) bool {
		si := matchScore(videoBase, normalizeName(subs[i].Name))
		sj := matchScore(videoBase, normalizeName(subs[j].Name))
		if si != sj {
			return si > sj
		}
		return strings.ToLower(subs[i].Name) < strings.ToLower(subs[j].Name)
	})
	return subs, nil
}

// normalizeName lowercases a file name and collapses separators/spaces so that
// "SSIS-480", "ssis_480" and "ssis 480" compare equal.
func normalizeName(name string) string {
	name = strings.ToLower(name)
	name = strings.TrimSuffix(name, filepath.Ext(name))
	replacer := strings.NewReplacer("-", " ", "_", " ", ".", " ", "(", " ", ")", " ", "[", " ", "]", " ")
	return strings.Join(strings.Fields(replacer.Replace(name)), " ")
}

// containsTokenSeq reports whether haystack contains needle as a contiguous
// token sequence (all tokens must match in order). "waaa 366 chinese" contains
// "waaa 366", but "waaa 36" or "abc 123" (needle "abc 12") do not.
func containsTokenSeq(haystack, needle []string) bool {
	if len(needle) == 0 {
		return true
	}
	if len(needle) > len(haystack) {
		return false
	}
outer:
	for i := 0; i+len(needle) <= len(haystack); i++ {
		for j := range needle {
			if haystack[i+j] != needle[j] {
				continue outer
			}
		}
		return true
	}
	return false
}

func matchScore(videoBase, subBase string) int {
	if videoBase == subBase {
		return 100
	}
	if strings.HasPrefix(subBase, videoBase) {
		return 90
	}
	if strings.HasPrefix(videoBase, subBase) {
		return 80
	}
	if strings.Contains(subBase, videoBase) {
		return 60
	}
	if strings.Contains(videoBase, subBase) {
		return 50
	}
	return 0
}
