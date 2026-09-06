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

	"github.com/PuerkitoBio/goquery"
	"golang.org/x/net/html"

	"javboss/internal/common/logging"
	"javboss/internal/util"
)

const (
	avdanyuWikiBaseURL         = "https://avdanyuwiki.com"
	avdanyuWikiUserAgent       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	avdanyuWikiRequestInterval = 4 * time.Second
)

var avdanyuWikiRateLimiter = struct {
	sync.Mutex
	next time.Time
}{}

var (
	avdanyuMaleActorLabelRe = regexp.MustCompile(`出演(?:AV)?男優\s*[：:]`)
	avdanyuCodeLabelRe      = regexp.MustCompile(`(?:メーカー|配信)?品番\s*[：:]\s*([A-Za-z0-9][A-Za-z0-9_-]*)`)
	avdanyuJavCodeRe        = regexp.MustCompile(`(?i)^([A-Z0-9]*?)(\d+)([A-Z]*)$`)
)

type avdanyuWikiWork struct {
	Codes  []string
	Actors []string
}

func lookupAVDanyuMaleActorsByCode(code string) ([]string, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, ResourceNotFonud
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	for _, query := range avdanyuSearchQueries(code) {
		doc, status, err := fetchAVDanyuWikiHTML(ctx, avdanyuSearchURL(query))
		if err != nil {
			return nil, err
		}
		if status == http.StatusNotFound || doc == nil {
			continue
		}
		names := matchAVDanyuMaleActors(parseAVDanyuWikiWorks(doc), code)
		if len(names) > 0 {
			return names, nil
		}
	}
	return nil, ResourceNotFonud
}

func avdanyuSearchURL(query string) string {
	return avdanyuWikiBaseURL + "/?s=" + url.QueryEscape(query)
}

func avdanyuSearchQueries(code string) []string {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil
	}
	queries := make([]string, 0, 3)
	seen := map[string]struct{}{}
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		queries = append(queries, value)
	}
	add(dmmContentID(code))
	add(strings.ToUpper(code))
	add(compactJavCode(code))
	return queries
}

func fetchAVDanyuWikiHTML(ctx context.Context, targetURL string) (*html.Node, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", avdanyuWikiUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "ja-JP,ja;q=0.9,zh-CN;q=0.8,en;q=0.5")
	req.Header.Set("Referer", avdanyuWikiBaseURL+"/")

	if err := waitForAVDanyuWikiRateLimit(ctx); err != nil {
		return nil, 0, err
	}

	logging.Info("avdanyuwiki request: %s", targetURL)
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
	logging.Info("avdanyuwiki response status: %s, length: %d bytes", resp.Status, len(body))
	if looksLikeCloudflareChallenge(body) {
		return nil, resp.StatusCode, fmt.Errorf("avdanyuwiki: cloudflare challenge")
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil, resp.StatusCode, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("avdanyuwiki: http %d", resp.StatusCode)
	}

	doc, err := parseHTMLDocument(body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("avdanyuwiki: parse html: %w", err)
	}
	return doc, resp.StatusCode, nil
}

func waitForAVDanyuWikiRateLimit(ctx context.Context) error {
	for {
		avdanyuWikiRateLimiter.Lock()
		now := time.Now()
		if !now.Before(avdanyuWikiRateLimiter.next) {
			avdanyuWikiRateLimiter.next = now.Add(avdanyuWikiRequestInterval)
			avdanyuWikiRateLimiter.Unlock()
			return nil
		}
		wait := time.Until(avdanyuWikiRateLimiter.next)
		avdanyuWikiRateLimiter.Unlock()

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return fmt.Errorf("avdanyuwiki: rate limit wait: %w", ctx.Err())
		case <-timer.C:
		}
	}
}

func looksLikeCloudflareChallenge(body []byte) bool {
	text := strings.ToLower(string(body))
	return strings.Contains(text, "cf-browser-verification") ||
		strings.Contains(text, "just a moment") ||
		(strings.Contains(text, "checking your browser") && strings.Contains(text, "cloudflare"))
}

func parseAVDanyuWikiWorks(root *html.Node) []avdanyuWikiWork {
	if root == nil {
		return nil
	}
	doc := documentSelection(root)
	posts := doc.Find("article, .post, .hentry, .type-post")
	if posts.Length() == 0 {
		if work, ok := parseAVDanyuWikiWork(doc); ok {
			return []avdanyuWikiWork{work}
		}
		return nil
	}
	works := make([]avdanyuWikiWork, 0, posts.Length())
	posts.Each(func(_ int, post *goquery.Selection) {
		if work, ok := parseAVDanyuWikiWork(post); ok {
			works = append(works, work)
		}
	})
	return works
}

func parseAVDanyuWikiWork(scope *goquery.Selection) (avdanyuWikiWork, bool) {
	if scope == nil || scope.Length() == 0 {
		return avdanyuWikiWork{}, false
	}
	text := strings.Join(strings.Fields(strings.ReplaceAll(scope.Text(), "\u00a0", " ")), " ")
	if text == "" {
		return avdanyuWikiWork{}, false
	}
	work := avdanyuWikiWork{
		Codes:  parseAVDanyuWikiCodes(text),
		Actors: parseAVDanyuWikiActors(scope, text),
	}
	if len(work.Codes) == 0 && len(work.Actors) == 0 {
		return avdanyuWikiWork{}, false
	}
	return work, true
}

func parseAVDanyuWikiCodes(text string) []string {
	matches := avdanyuCodeLabelRe.FindAllStringSubmatch(text, -1)
	codes := make([]string, 0, len(matches))
	seen := map[string]struct{}{}
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		code := strings.TrimSpace(match[1])
		if code == "" {
			continue
		}
		key := compactJavCodeKey(code)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		codes = append(codes, code)
	}
	return codes
}

func parseAVDanyuWikiActors(scope *goquery.Selection, text string) []string {
	loc := avdanyuMaleActorLabelRe.FindStringIndex(text)
	if loc == nil {
		return nil
	}
	remainder := strings.TrimSpace(text[loc[1]:])
	if cut := strings.Index(remainder, "監督"); cut >= 0 {
		remainder = remainder[:cut]
	}
	if cut := strings.Index(remainder, "シリーズ"); cut >= 0 {
		remainder = remainder[:cut]
	}
	if cut := strings.Index(remainder, "メーカー"); cut >= 0 {
		remainder = remainder[:cut]
	}
	if cut := strings.Index(remainder, "品番"); cut >= 0 {
		remainder = remainder[:cut]
	}
	if cut := strings.Index(remainder, "ジャンル"); cut >= 0 {
		remainder = remainder[:cut]
	}

	names := collectAVDanyuTagLinkNames(scope)
	if len(names) == 0 {
		names = splitAVDanyuActorNames(remainder)
	} else {
		filtered := make([]string, 0, len(names))
		remainderCompact := compactActorHaystack(remainder)
		for _, name := range names {
			if remainderCompact == "" || strings.Contains(remainderCompact, compactActorHaystack(name)) {
				filtered = append(filtered, name)
			}
		}
		if len(filtered) > 0 {
			names = filtered
		}
	}
	return dedupeNonEmpty(names)
}

func collectAVDanyuTagLinkNames(scope *goquery.Selection) []string {
	if scope == nil {
		return nil
	}
	var names []string
	scope.Find(`a[href*="/tag/"]`).Each(func(_ int, link *goquery.Selection) {
		name := cleanAVDanyuActorName(cleanSelectionText(link))
		if name != "" {
			names = append(names, name)
		}
	})
	return names
}

func splitAVDanyuActorNames(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		switch r {
		case ',', '、', '/', '|', ';', '；':
			return true
		default:
			return unicode.IsSpace(r)
		}
	})
	names := make([]string, 0, len(fields))
	for _, field := range fields {
		name := cleanAVDanyuActorName(field)
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

func cleanAVDanyuActorName(name string) string {
	name = strings.TrimSpace(strings.ReplaceAll(name, "\u00a0", " "))
	name = strings.Trim(name, " ,、/|")
	if name == "" || isAVDanyuPlaceholderName(name) {
		return ""
	}
	switch name {
	case "出演男優", "出演AV男優", "出演者", "監督":
		return ""
	}
	return name
}

func isAVDanyuPlaceholderName(name string) bool {
	if name == "" {
		return true
	}
	for _, r := range name {
		switch r {
		case '-', '—', '–', '−', '_', '.', '/', '\\':
			continue
		default:
			if unicode.IsSpace(r) {
				continue
			}
			return false
		}
	}
	return true
}

func compactActorHaystack(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), ""))
}

func matchAVDanyuMaleActors(works []avdanyuWikiWork, code string) []string {
	for _, work := range works {
		if avdanyuWorkMatchesCode(work, code) {
			return append([]string(nil), work.Actors...)
		}
	}
	return nil
}

func avdanyuWorkMatchesCode(work avdanyuWikiWork, code string) bool {
	for _, candidate := range work.Codes {
		if javCodesMatch(candidate, code) {
			return true
		}
	}
	return false
}

func javCodesMatch(left, right string) bool {
	a := compactJavCodeKey(left)
	b := compactJavCodeKey(right)
	if a == "" || b == "" {
		return false
	}
	if a == b {
		return true
	}
	if dmm := dmmContentIDKey(right); dmm != "" && (a == dmm || strings.HasSuffix(a, dmm)) {
		return true
	}
	if dmm := dmmContentIDKey(left); dmm != "" && (b == dmm || strings.HasSuffix(b, dmm)) {
		return true
	}
	return false
}

func compactJavCode(code string) string {
	code = strings.ToLower(strings.TrimSpace(code))
	code = strings.ReplaceAll(code, "-", "")
	code = strings.ReplaceAll(code, "_", "")
	return strings.Join(strings.Fields(code), "")
}

func compactJavCodeKey(code string) string {
	return strings.ToUpper(compactJavCode(code))
}

func dmmContentID(code string) string {
	prefix, number, suffix := splitJavCodeParts(code)
	if prefix == "" || number == "" {
		return compactJavCode(code)
	}
	for len(number) < 5 {
		number = "0" + number
	}
	return strings.ToLower(prefix + number + suffix)
}

func dmmContentIDKey(code string) string {
	return strings.ToUpper(dmmContentID(code))
}

func splitJavCodeParts(code string) (prefix, number, suffix string) {
	compact := compactJavCodeKey(code)
	match := avdanyuJavCodeRe.FindStringSubmatch(compact)
	if len(match) != 4 {
		return "", "", ""
	}
	return match[1], match[2], match[3]
}
