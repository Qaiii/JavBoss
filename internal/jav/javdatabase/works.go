package javdatabase

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

// ListIdolWorksPage fetches one idol listing page without using the lookup cache.
func (p *JavDatabaseClient) ListIdolWorksPage(ctx context.Context, profileURL string, page int) ([]*metadata.JavInfo, bool, error) {
	if page < 1 {
		page = 1
	}
	targetURL := javDatabaseIdolWorksPageURL(profileURL, page)
	doc, status, err := p.fetchJavDatabaseHTML(ctx, targetURL, profileURL)
	if err != nil {
		return nil, false, err
	}
	if status == http.StatusNotFound || doc == nil {
		return nil, false, metadata.ErrNotFound
	}
	return parseJavDatabaseIdolWorksPage(doc, targetURL), hasJavDatabaseNextIdolPage(doc, page), nil
}

func javDatabaseIdolWorksPageURL(profileURL string, page int) string {
	if page <= 1 {
		return strings.TrimSpace(profileURL)
	}
	sep := "?"
	if strings.Contains(profileURL, "?") {
		sep = "&"
	}
	return fmt.Sprintf("%s%sipage=%d", profileURL, sep, page)
}

func parseJavDatabaseIdolWorksPage(root *html.Node, pageURL string) []*metadata.JavInfo {
	if root == nil {
		return nil
	}

	seen := make(map[string]struct{})
	var items []*metadata.JavInfo
	htmlutil.DocumentSelection(root).
		Find("div.card.h-100.borderlesscard, div.card.borderlesscard").
		Each(func(_ int, card *goquery.Selection) {
			code := ""
			card.Find("p.display-6.pcard a, p.display-6 a, p.pcard a").EachWithBreak(func(_ int, link *goquery.Selection) bool {
				href := htmlutil.SelectionAttr(link, "href")
				if idx := strings.Index(strings.ToLower(href), "/movies/"); idx >= 0 {
					rest := href[idx+len("/movies/"):]
					rest = strings.TrimSuffix(rest, "/")
					if rest != "" {
						code = rest
						return false
					}
				}
				return true
			})
			if code == "" {
				return
			}

			info := &metadata.JavInfo{
				Code:     strings.ToUpper(strings.TrimSpace(code)),
				Title:    javDatabaseCardTitle(card),
				CoverURL: javDatabaseCardCoverURL(card, pageURL),
				Provider: metadata.ProviderJavDatabase,
			}
			info.ReleaseUnix = parseDateUnix(javDatabaseCardFooterText(card))
			if strings.TrimSpace(info.Title) == "" {
				info.Title = info.Code
			}

			key := normalizeJavDatabaseCode(info.Code)
			if _, exists := seen[key]; exists {
				return
			}
			seen[key] = struct{}{}
			items = append(items, info)
		})
	return items
}

func javDatabaseCardCoverURL(card *goquery.Selection, pageURL string) string {
	if card == nil {
		return ""
	}
	img := card.Find("div.movie-cover-thumb img, a img, img").First()
	return parseutil.FirstResolvedSampleURL(
		pageURL,
		htmlutil.SelectionAttr(img, "data-src"),
		htmlutil.SelectionAttr(img, "data-original"),
		htmlutil.SelectionAttr(img, "data-lazy-src"),
		htmlutil.SelectionAttr(img, "src"),
	)
}

func javDatabaseCardTitle(card *goquery.Selection) string {
	if card == nil {
		return ""
	}
	title := htmlutil.CleanSelectionText(card.Find("div.mt-auto a").First())
	if title == "" {
		title = htmlutil.CleanSelectionText(card.Find("div.mt-auto").First())
	}
	return strings.TrimSpace(title)
}

func javDatabaseCardFooterText(card *goquery.Selection) string {
	if card == nil {
		return ""
	}
	return htmlutil.CleanSelectionText(card.Find("div.mt-auto").First())
}

func hasJavDatabaseNextIdolPage(root *html.Node, currentPage int) bool {
	return htmlutil.ListingHasLaterPage(root, currentPage, "ipage")
}

// PreferJapaneseTitle keeps an existing Japanese title when the incoming title
// has none, so an English fallback scrape does not overwrite Japanese listing
// titles. Incoming Japanese (or incoming when neither side is Japanese) wins.
func PreferJapaneseTitle(existing, incoming string) string {
	incoming = strings.TrimSpace(incoming)
	existing = strings.TrimSpace(existing)
	if incoming == "" {
		return existing
	}
	if parseutil.ContainsJapaneseRunes(incoming) || !parseutil.ContainsJapaneseRunes(existing) {
		return incoming
	}
	return existing
}

func parseDateUnix(value string) int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if match := dateYMDRe.FindString(value); match != "" {
		normalized := strings.ReplaceAll(strings.ReplaceAll(match, "/", "-"), ".", "-")
		if t, err := time.Parse("2006-1-2", normalized); err == nil {
			return t.Unix()
		}
	}
	if match := dateMDYRe.FindString(value); match != "" {
		if t, err := time.Parse("1/2/2006", match); err == nil {
			return t.Unix()
		}
	}
	return 0
}

var (
	dateYMDRe = regexp.MustCompile(`\d{4}[-/.]\d{1,2}[-/.]\d{1,2}`)
	dateMDYRe = regexp.MustCompile(`\b\d{1,2}/\d{1,2}/\d{4}\b`)
)
