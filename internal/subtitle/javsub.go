// Package subtitle provides subtitle support for the browser player: local
// subtitle discovery, srt/vtt conversion, and online JAV subtitle search and
// download backed by the javsubtitle.com index (source of the "版本号" style
// subtitles commonly paired with JAV releases).
package subtitle

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"javboss/internal/util"
)

// javSubBaseURL is the javsubtitle.com origin. All lookups are performed
// server-side so the signed subtitle URLs never leak to the browser.
const javSubBaseURL = "https://javsubtitle.com"

const javSubBrowserUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

var javSubClient = util.NewHTTPClientWithTransport(20*time.Second, nil)

// JavSubMovie is a movie (番号/版本) that shows up in a subtitle search.
type JavSubMovie struct {
	Code              string   `json:"code"`
	Title             string   `json:"title"`
	HasSubtitles      bool     `json:"has_subtitles"`
	AvailableVersions []string `json:"versions"`
}

// JavSubSubtitle is a single subtitle track of a movie detail. VTTURL is only
// used server-side (it embeds a signed token) and is never serialized.
type JavSubSubtitle struct {
	ID          string `json:"id"`
	Lang        string `json:"lang"`
	Label       string `json:"label"`
	LanguageTag string `json:"language_tag"`
	vttURL      string
}

// SearchJavSubMovies queries the javsubtitle.com index by 番号 or free text.
func SearchJavSubMovies(ctx context.Context, query string) ([]JavSubMovie, error) {
	raw := strings.TrimSpace(query)
	if raw == "" {
		return nil, nil
	}
	target := javSubBaseURL + "/api/movies?" + url.Values{
		"q":        {raw},
		"subsOnly": {"false"},
		"limit":    {"20"},
		"sort":     {"views"},
		"fast":     {"true"},
	}.Encode()

	body, err := javSubGet(ctx, target)
	if err != nil {
		return nil, err
	}

	var payload struct {
		Items []struct {
			Code              string   `json:"code"`
			Title             string   `json:"title"`
			HasSubtitles      bool     `json:"hasSubtitles"`
			AvailableVersions []string `json:"availableVersions"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("search jav subtitle: parse response: %w", err)
	}

	out := make([]JavSubMovie, 0, len(payload.Items))
	for _, item := range payload.Items {
		if strings.TrimSpace(item.Code) == "" {
			continue
		}
		out = append(out, JavSubMovie{
			Code:              item.Code,
			Title:             item.Title,
			HasSubtitles:      item.HasSubtitles,
			AvailableVersions: item.AvailableVersions,
		})
	}
	return out, nil
}

// GetJavSubMovieDetail fetches the subtitle tracks of one movie. The returned
// tracks carry stable identifiers plus a server-side signed download URL that
// is never serialized to clients.
func GetJavSubMovieDetail(ctx context.Context, code string) (title string, subtitles []JavSubSubtitle, err error) {
	code = strings.TrimSpace(code)
	if !safeCode(code) {
		return "", nil, fmt.Errorf("get jav subtitle detail: invalid code")
	}
	target := javSubBaseURL + "/api/movie/" + url.PathEscape(code)

	body, err := javSubGet(ctx, target)
	if err != nil {
		return "", nil, err
	}

	var payload struct {
		Title     string `json:"title"`
		Subtitles []struct {
			ID          string `json:"id"`
			Lang        string `json:"lang"`
			Label       string `json:"label"`
			LanguageTag string `json:"languageTag"`
			VTTURL      string `json:"vttUrlSigned"`
		} `json:"subtitles"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", nil, fmt.Errorf("get jav subtitle detail: parse response: %w", err)
	}

	out := make([]JavSubSubtitle, 0, len(payload.Subtitles))
	for _, sub := range payload.Subtitles {
		id := strings.TrimSpace(sub.ID)
		if !safeSubtitleID(id) || strings.TrimSpace(sub.VTTURL) == "" {
			continue
		}
		out = append(out, JavSubSubtitle{
			ID:          id,
			Lang:        sub.Lang,
			Label:       sub.Label,
			LanguageTag: sub.LanguageTag,
			vttURL:      javSubBaseURL + sub.VTTURL,
		})
	}
	return payload.Title, out, nil
}

// DownloadJavSubVTT downloads the WebVTT content of one subtitle track by movie
// code and subtitle id. It re-fetches the movie detail to obtain the signed URL
// so callers never handle signed tokens.
func DownloadJavSubVTT(ctx context.Context, code, subtitleID string) ([]byte, error) {
	_, subtitles, err := GetJavSubMovieDetail(ctx, code)
	if err != nil {
		return nil, err
	}
	var vttURL string
	for _, sub := range subtitles {
		if sub.ID == subtitleID {
			vttURL = sub.vttURL
			break
		}
	}
	if vttURL == "" {
		return nil, fmt.Errorf("download jav subtitle: subtitle not found")
	}
	return javSubGet(ctx, vttURL)
}

func javSubGet(ctx context.Context, target string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, fmt.Errorf("jav subtitle request: %w", err)
	}
	req.Header.Set("User-Agent", javSubBrowserUA)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Referer", javSubBaseURL+"/")

	resp, err := javSubClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("jav subtitle request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("jav subtitle request: unexpected status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("jav subtitle request: read body: %w", err)
	}
	return body, nil
}

// safeCode allows only JAV-style codes (letters, digits, dashes, dots, plus).
func safeCode(code string) bool {
	if code == "" || len(code) > 128 {
		return false
	}
	for _, r := range code {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '-', r == '.', r == '_', r == '+':
		default:
			return false
		}
	}
	return true
}

// safeSubtitleID allows only UUID-shaped identifiers.
func safeSubtitleID(id string) bool {
	if len(id) != 36 {
		return false
	}
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'f', r >= 'A' && r <= 'F', r >= '0' && r <= '9', r == '-':
		default:
			return false
		}
	}
	return true
}
