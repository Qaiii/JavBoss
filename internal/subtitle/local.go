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
// are returned, so unrelated subtitles in the same directory are hidden.
func ListLocalSubtitles(videoPath, code string) ([]LocalSubtitle, error) {
	dir := filepath.Dir(videoPath)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	videoBase := normalizeName(filepath.Base(videoPath))
	codeKey := normalizeName(code)
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
		if codeKey != "" && !strings.Contains(subBase, codeKey) {
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
