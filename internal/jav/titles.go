package jav

import "javboss/internal/jav/javdatabase"

// PreferJapaneseTitle keeps an existing Japanese title when the incoming title
// has none, so an English fallback scrape does not overwrite Japanese listing
// titles. Incoming Japanese (or incoming when neither side is Japanese) wins.
func PreferJapaneseTitle(existing, incoming string) string {
	return javdatabase.PreferJapaneseTitle(existing, incoming)
}
