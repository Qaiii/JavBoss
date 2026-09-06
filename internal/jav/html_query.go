package jav

import (
	"bytes"
	"net/url"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"golang.org/x/net/html"
)

func documentSelection(root *html.Node) *goquery.Selection {
	if root == nil {
		return goquery.NewDocumentFromNode(&html.Node{Type: html.DocumentNode}).Selection
	}
	return goquery.NewDocumentFromNode(root).Selection
}

func firstSelectionNode(selection *goquery.Selection) *html.Node {
	if selection == nil || selection.Length() == 0 {
		return nil
	}
	return selection.Get(0)
}

func cleanSelectionText(selection *goquery.Selection) string {
	if selection == nil {
		return ""
	}
	return strings.Join(strings.Fields(selection.Text()), " ")
}

func parseHTMLDocument(body []byte) (*html.Node, error) {
	document, err := goquery.NewDocumentFromReader(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	return firstSelectionNode(document.Selection), nil
}

func listingHasLaterPage(root *html.Node, currentPage int, queryKey string) bool {
	if root == nil || strings.TrimSpace(queryKey) == "" {
		return false
	}
	if currentPage < 1 {
		currentPage = 1
	}
	found := false
	documentSelection(root).
		Find("div.pagination a, nav.pagination a, ul.pagination a, .pagination a, a.pagination-next, a[rel=next]").
		EachWithBreak(func(_ int, link *goquery.Selection) bool {
			if selectionLooksDisabled(link) {
				return true
			}
			href := selectionAttr(link, "href")
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
	if selectionAttr(link, "disabled") != "" || strings.EqualFold(selectionAttr(link, "aria-disabled"), "true") {
		return true
	}
	class := " " + strings.ToLower(selectionAttr(link, "class")) + " "
	return strings.Contains(class, " disabled ") || strings.Contains(class, " is-disabled ")
}
