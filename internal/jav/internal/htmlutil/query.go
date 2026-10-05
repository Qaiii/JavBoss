package htmlutil

import (
	"bytes"
	"net/url"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"golang.org/x/net/html"
)

func DocumentSelection(root *html.Node) *goquery.Selection {
	if root == nil {
		return goquery.NewDocumentFromNode(&html.Node{Type: html.DocumentNode}).Selection
	}
	return goquery.NewDocumentFromNode(root).Selection
}

func FirstSelectionNode(selection *goquery.Selection) *html.Node {
	if selection == nil || selection.Length() == 0 {
		return nil
	}
	return selection.Get(0)
}

func CleanSelectionText(selection *goquery.Selection) string {
	if selection == nil {
		return ""
	}
	return strings.Join(strings.Fields(selection.Text()), " ")
}

func ParseHTMLDocument(body []byte) (*html.Node, error) {
	document, err := goquery.NewDocumentFromReader(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	return FirstSelectionNode(document.Selection), nil
}

func FirstTextByTag(root *html.Node, tag string) string {
	return CleanSelectionText(DocumentSelection(root).Find(tag).First())
}

func SelectionTexts(selection *goquery.Selection) []string {
	var values []string
	selection.Each(func(_ int, item *goquery.Selection) {
		if text := CleanSelectionText(item); text != "" {
			values = append(values, text)
		}
	})
	return values
}

func SelectionAttr(selection *goquery.Selection, name string) string {
	if selection == nil {
		return ""
	}
	return strings.TrimSpace(selection.AttrOr(name, ""))
}

// ListingHasLaterPage reports whether pagination links include a page after currentPage.
// Links back to earlier pages, and disabled next controls, are ignored.
func ListingHasLaterPage(root *html.Node, currentPage int, queryKey string) bool {
	if root == nil || strings.TrimSpace(queryKey) == "" {
		return false
	}
	if currentPage < 1 {
		currentPage = 1
	}
	found := false
	DocumentSelection(root).
		Find("div.pagination a, nav.pagination a, ul.pagination a, .pagination a, a.pagination-next, a[rel=next]").
		EachWithBreak(func(_ int, link *goquery.Selection) bool {
			if selectionLooksDisabled(link) {
				return true
			}
			href := SelectionAttr(link, "href")
			if href == "" || href == "#" {
				return true
			}
			if hrefQueryInt(href, queryKey) > currentPage {
				found = true
				return false
			}
			return true
		})
	return found
}

func hrefQueryInt(raw, key string) int {
	raw = strings.TrimSpace(raw)
	key = strings.TrimSpace(key)
	if raw == "" || key == "" {
		return 0
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(parsed.Query().Get(key)))
	if err != nil || n <= 0 {
		return 0
	}
	return n
}

func selectionLooksDisabled(link *goquery.Selection) bool {
	if link == nil || link.Length() == 0 {
		return true
	}
	if SelectionAttr(link, "disabled") != "" || strings.EqualFold(SelectionAttr(link, "aria-disabled"), "true") {
		return true
	}
	class := " " + strings.ToLower(SelectionAttr(link, "class")) + " "
	return strings.Contains(class, " disabled ") || strings.Contains(class, " is-disabled ")
}

func CollectAnchorTexts(root *html.Node) []string {
	if root == nil {
		return nil
	}

	seen := make(map[string]struct{})
	var texts []string
	DocumentSelection(root).Find("a").Each(func(_ int, link *goquery.Selection) {
		text := CleanSelectionText(link)
		if text != "" {
			if _, exists := seen[text]; !exists {
				seen[text] = struct{}{}
				texts = append(texts, text)
			}
		}
	})
	return texts
}
