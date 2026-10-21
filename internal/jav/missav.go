package jav

import "javboss/internal/jav/scrape"

// LookupMissAVChineseTitle fetches the Chinese title MissAV shows for a code.
func LookupMissAVChineseTitle(code string) (string, error) {
	return scrape.LookupMissAVChineseTitle(code)
}
