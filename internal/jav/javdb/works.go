package javdb

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"javboss/internal/jav/internal/htmlutil"
	"javboss/internal/jav/internal/parseutil"
	"javboss/internal/jav/metadata"

	"github.com/PuerkitoBio/goquery"
	"golang.org/x/net/html"
)

// ListActressWorksPage fetches one actress listing page without using the lookup cache.
func (p *JavDBClient) ListActressWorksPage(ctx context.Context, profileURL string, page int) ([]*metadata.JavInfo, bool, error) {
	if page < 1 {
		page = 1
	}
	targetURL := javDBActressWorksPageURL(profileURL, page)
	doc, status, err := p.fetchJavDBHTML(ctx, targetURL, javDBBaseURL)
	if err != nil {
		return nil, false, err
	}
	if status == http.StatusNotFound || doc == nil {
		return nil, false, metadata.ErrNotFound
	}
	return parseJavDBActressWorksPage(doc, targetURL), hasJavDBNextPage(doc, page), nil
}

func javDBActressWorksPageURL(profileURL string, page int) string {
	if page <= 1 {
		return strings.TrimSpace(profileURL)
	}
	sep := "?"
	if strings.Contains(profileURL, "?") {
		sep = "&"
	}
	return fmt.Sprintf("%s%spage=%d", profileURL, sep, page)
}

func parseJavDBActressWorksPage(root *html.Node, pageURL string) []*metadata.JavInfo {
	if root == nil {
		return nil
	}

	seen := make(map[string]struct{})
	var items []*metadata.JavInfo
	htmlutil.DocumentSelection(root).Find("div.movie-list div.item").Each(func(_ int, item *goquery.Selection) {
		code := htmlutil.CleanSelectionText(item.Find("div.video-title strong").First())
		if code == "" {
			code = htmlutil.CleanSelectionText(item.Find("strong").First())
		}
		if code == "" {
			return
		}

		info := &metadata.JavInfo{
			Title:       javDBListItemTitle(item, code),
			Code:        code,
			CoverURL:    javDBListItemCoverURL(htmlutil.FirstSelectionNode(item), pageURL),
			ReleaseUnix: parseFlexibleDateUnix(javDBListItemReleaseText(item)),
			DurationMin: parseutil.ParseRuntimeMinutes(htmlutil.CleanSelectionText(item.Find(".duration").First())),
			Provider:    metadata.ProviderJavDB,
		}
		if href := htmlutil.SelectionAttr(item.Find(`a[href*="/v/"]`).First(), "href"); href != "" {
			info.SampleImages = []metadata.SampleImage{{DetailURL: parseutil.ResolveURL(pageURL, href)}}
		}

		key := normalizeJavDBCode(code)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		items = append(items, info)
	})
	return items
}

func javDBListItemTitle(item *goquery.Selection, code string) string {
	if item == nil {
		return ""
	}
	if title := htmlutil.CleanSelectionText(item.Find("span.origin-title, .origin-title").First()); title != "" {
		return trimJavDBListTitle(title, code)
	}
	if title := trimJavDBListTitle(htmlutil.SelectionAttr(item.Find("a.box").First(), "title"), code); title != "" {
		return title
	}
	if title := trimJavDBListTitle(htmlutil.SelectionAttr(item.Find("img").First(), "alt"), code); parseutil.ContainsJapaneseRunes(title) {
		return title
	}
	return trimJavDBListTitle(htmlutil.CleanSelectionText(item.Find("div.video-title").First()), code)
}

func javDBListItemReleaseText(item *goquery.Selection) string {
	if item == nil {
		return ""
	}
	for _, selector := range []string{"div.meta", ".meta", "div.item-meta", "time"} {
		if text := htmlutil.CleanSelectionText(item.Find(selector).First()); parseFlexibleDateUnix(text) != 0 {
			return text
		}
	}
	return htmlutil.CleanSelectionText(item)
}

func trimJavDBListTitle(title, code string) string {
	title = strings.TrimSpace(title)
	code = strings.TrimSpace(code)
	if code != "" {
		title = strings.TrimSpace(strings.TrimPrefix(title, code))
	}
	return title
}

func javDBListItemCoverURL(root *html.Node, pageURL string) string {
	if root == nil {
		return ""
	}
	img := htmlutil.DocumentSelection(root).Find("a.box img, a img, img").First()
	return parseutil.FirstResolvedSampleURL(
		pageURL,
		htmlutil.SelectionAttr(img, "data-src"),
		htmlutil.SelectionAttr(img, "data-original"),
		htmlutil.SelectionAttr(img, "data-lazy-src"),
		htmlutil.SelectionAttr(img, "src"),
	)
}

func hasJavDBNextPage(root *html.Node, currentPage int) bool {
	return htmlutil.ListingHasLaterPage(root, currentPage, "page")
}

var (
	flexibleDateYMDRe = regexp.MustCompile(`\d{4}[-/.]\d{1,2}[-/.]\d{1,2}`)
	flexibleDateMDYRe = regexp.MustCompile(`\b\d{1,2}/\d{1,2}/\d{4}\b`)
)

func parseFlexibleDateUnix(value string) int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if match := flexibleDateYMDRe.FindString(value); match != "" {
		normalized := strings.ReplaceAll(strings.ReplaceAll(match, "/", "-"), ".", "-")
		if t, err := time.Parse("2006-1-2", normalized); err == nil {
			return t.Unix()
		}
	}
	if match := flexibleDateMDYRe.FindString(value); match != "" {
		if t, err := time.Parse("1/2/2006", match); err == nil {
			return t.Unix()
		}
	}
	return 0
}
