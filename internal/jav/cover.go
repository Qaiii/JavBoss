package jav

import (
	"net/url"
	"path"
	"strings"
)

// SelectCoverAndPoster picks the landscape cover URL and an optional portrait
// poster URL. large is preferred for the landscape cover; small is used as the
// poster when it is a distinct URL, otherwise a poster URL is derived from the
// cover when the provider uses a known DMM-style pl/ps naming pattern.
func SelectCoverAndPoster(large, small string) (coverURL, posterURL string) {
	large = strings.TrimSpace(large)
	small = strings.TrimSpace(small)
	coverURL = firstNonEmpty(large, small)
	if large != "" && small != "" && !strings.EqualFold(large, small) {
		return coverURL, small
	}
	posterURL = DerivePosterURL(coverURL)
	if posterURL == "" || strings.EqualFold(posterURL, coverURL) {
		return coverURL, ""
	}
	return coverURL, posterURL
}

// DerivePosterURL returns a portrait image URL derived from a landscape cover
// URL when the provider uses a known naming pattern. An empty string means no
// dedicated poster URL is available.
func DerivePosterURL(coverURL string) string {
	coverURL = strings.TrimSpace(coverURL)
	if coverURL == "" {
		return ""
	}
	parsed, err := url.Parse(coverURL)
	if err != nil || parsed == nil || parsed.Path == "" {
		return ""
	}
	ext := path.Ext(parsed.Path)
	stem := strings.TrimSuffix(parsed.Path, ext)
	if len(stem) < 2 || ext == "" {
		return ""
	}
	if !strings.EqualFold(stem[len(stem)-2:], "pl") {
		return ""
	}
	parsed.Path = stem[:len(stem)-2] + "ps" + ext
	return parsed.String()
}

// IsThumbnailPosterURL reports DMM-style package-small poster URLs (ps.jpg).
// Those files are listing thumbnails, not display-sized posters.
func IsThumbnailPosterURL(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || parsed.Path == "" {
		return false
	}
	ext := path.Ext(parsed.Path)
	stem := strings.TrimSuffix(parsed.Path, ext)
	return len(stem) >= 2 && ext != "" && strings.EqualFold(stem[len(stem)-2:], "ps")
}
