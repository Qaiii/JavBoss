package jav

import "javboss/internal/jav/internal/parseutil"

// SelectCoverAndPoster picks the landscape cover URL and an optional portrait
// poster URL. large is preferred for the landscape cover; small is used as the
// poster when it is a distinct URL, otherwise a poster URL is derived from the
// cover when the provider uses a known DMM-style pl/ps naming pattern.
func SelectCoverAndPoster(large, small string) (coverURL, posterURL string) {
	return parseutil.SelectCoverAndPoster(large, small)
}

// DerivePosterURL returns a portrait image URL derived from a landscape cover
// URL when the provider uses a known naming pattern. An empty string means no
// dedicated poster URL is available.
func DerivePosterURL(coverURL string) string {
	return parseutil.DerivePosterURL(coverURL)
}

// IsThumbnailPosterURL reports DMM-style package-small poster URLs (ps.jpg).
// Those files are listing thumbnails, not display-sized posters.
func IsThumbnailPosterURL(raw string) bool {
	return parseutil.IsThumbnailPosterURL(raw)
}
