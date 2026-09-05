package jav

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"javboss/internal/common/logging"
	"javboss/internal/util"

	"golang.org/x/net/html"
)

const (
	missAVBaseURL         = "https://missav.ws"
	missAVUserAgent       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	missAVRequestInterval = 1500 * time.Millisecond
	missAVTitleCacheVer   = "v1"
)

var missAVRateLimiter = struct {
	sync.Mutex
	next time.Time
}{}

var missAVCodePrefixPattern = regexp.MustCompile(`(?i)^[A-Z0-9]{2,}-\d+\s+`)

// LookupMissAVChineseTitle fetches the Chinese title MissAV shows for a code.
func LookupMissAVChineseTitle(code string) (title string, err error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return "", ResourceNotFonud
	}

	cacheKey := missAVTitleCacheKey(code)
	if cached, ok, cacheErr := lookupCacheGet[string](cacheKey); ok {
		if cacheErr != nil {
			return "", cacheErr
		}
		if cached == nil || strings.TrimSpace(*cached) == "" {
			return "", ResourceNotFonud
		}
		return strings.TrimSpace(*cached), nil
	}

	title, err = fetchMissAVChineseTitle(code)
	if err == nil && strings.TrimSpace(title) == "" {
		err = ResourceNotFonud
	}
	cacheableLookupResult(cacheKey, title, err)
	return title, err
}

func missAVTitleCacheKey(code string) string {
	return strings.Join([]string{
		missAVTitleCacheVer,
		"jav",
		"missav",
		"lookup_title_zh",
		strings.ToUpper(strings.TrimSpace(code)),
	}, ":")
}

func fetchMissAVChineseTitle(code string) (string, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return "", ResourceNotFonud
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	var lastErr error
	for _, targetURL := range missAVTitleURLs(code) {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		doc, status, err := fetchMissAVHTML(ctx, targetURL)
		if err != nil {
			lastErr = err
			continue
		}
		if status == http.StatusNotFound {
			lastErr = ResourceNotFonud
			continue
		}
		title := parseMissAVChineseTitle(doc, code)
		if title != "" {
			return title, nil
		}
		lastErr = ResourceNotFonud
	}
	if lastErr == nil {
		return "", ResourceNotFonud
	}
	return "", lastErr
}

func missAVTitleURLs(code string) []string {
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return nil
	}
	escaped := url.PathEscape(trimmed)
	lower := url.PathEscape(strings.ToLower(trimmed))
	seen := make(map[string]struct{}, 3)
	out := make([]string, 0, 3)
	for _, path := range []string{
		escaped,
		lower,
		"cn/" + lower,
	} {
		target := missAVBaseURL + "/" + path
		if _, ok := seen[target]; ok {
			continue
		}
		seen[target] = struct{}{}
		out = append(out, target)
	}
	return out
}

func fetchMissAVHTML(ctx context.Context, targetURL string) (*html.Node, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", missAVUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	req.Header.Set("Referer", missAVBaseURL+"/")

	if err := waitForMissAVRateLimit(ctx); err != nil {
		return nil, 0, err
	}

	logging.Info("missav request: %s", targetURL)
	resp, err := util.DoRequest(req)
	if err != nil {
		if errors.Is(err, util.ErrCachedNotFound) {
			return nil, http.StatusNotFound, nil
		}
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	logging.Info("missav response status: %s, length: %d bytes", resp.Status, len(body))

	if resp.StatusCode == http.StatusNotFound {
		return nil, resp.StatusCode, nil
	}
	if isCloudflareChallenge(body, resp.StatusCode) {
		return nil, resp.StatusCode, fmt.Errorf("missav: cloudflare challenge http %d", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("missav: http %d", resp.StatusCode)
	}

	doc, err := parseHTMLDocument(body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("missav: parse html: %w", err)
	}
	return doc, resp.StatusCode, nil
}

func waitForMissAVRateLimit(ctx context.Context) error {
	for {
		missAVRateLimiter.Lock()
		now := time.Now()
		if !now.Before(missAVRateLimiter.next) {
			missAVRateLimiter.next = now.Add(missAVRequestInterval)
			missAVRateLimiter.Unlock()
			return nil
		}
		wait := time.Until(missAVRateLimiter.next)
		missAVRateLimiter.Unlock()

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return fmt.Errorf("missav: rate limit wait: %w", ctx.Err())
		case <-timer.C:
		}
	}
}

func isCloudflareChallenge(body []byte, status int) bool {
	if status == http.StatusForbidden || status == http.StatusServiceUnavailable {
		return true
	}
	text := string(body)
	return strings.Contains(text, "cf-browser-verification") ||
		strings.Contains(text, "challenge-platform") ||
		strings.Contains(text, "Just a moment")
}

func parseMissAVChineseTitle(root *html.Node, code string) string {
	if root == nil {
		return ""
	}
	sel := documentSelection(root)
	candidates := []string{
		cleanSelectionText(sel.Find("h1.text-base").First()),
		cleanSelectionText(sel.Find("h1").First()),
	}
	if content, ok := sel.Find(`meta[property="og:title"]`).Attr("content"); ok {
		candidates = append(candidates, strings.TrimSpace(content))
	}
	candidates = append(candidates, cleanSelectionText(sel.Find("title").First()))
	for _, raw := range candidates {
		if title := cleanMissAVTitle(raw, code); title != "" {
			return title
		}
	}
	return ""
}

func cleanMissAVTitle(title, code string) string {
	title = strings.Join(strings.Fields(title), " ")
	if title == "" {
		return ""
	}
	for _, suffix := range []string{
		" | MissAV",
		" | MissAV.ws",
		" | missav.ws",
		" - MissAV",
		" - MissAV.ws",
	} {
		title = strings.TrimSuffix(title, suffix)
		title = strings.TrimSpace(title)
	}
	code = strings.TrimSpace(code)
	if code != "" {
		prefix := regexp.MustCompile(`(?i)^` + regexp.QuoteMeta(code) + `\s+`)
		title = strings.TrimSpace(prefix.ReplaceAllString(title, ""))
	}
	title = strings.TrimSpace(missAVCodePrefixPattern.ReplaceAllString(title, ""))
	if title == "" || !containsHanRunes(title) {
		return ""
	}
	return title
}

func containsHanRunes(value string) bool {
	for _, r := range value {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}
