package jav

import "time"

// ScrapeSource describes one outbound metadata fetch used by JavBoss.
type ScrapeSource struct {
	ID         string   `json:"id"`
	URLs       []string `json:"urls"`
	Data       []string `json:"data"`
	IntervalMS int64    `json:"interval_ms"`
}

// ScrapeSources returns the live provider catalog, including current request intervals.
func ScrapeSources() []ScrapeSource {
	return []ScrapeSource{
		{
			ID: "javbus",
			URLs: []string{
				"https://www.javbus.com/{code}",
				"https://www.javbus.com/genre",
				"https://www.javbus.com/uncensored/genre",
			},
			Data:       []string{"title", "code", "series", "release", "duration", "tags", "actors", "cover", "samples", "uncensored", "genres"},
			IntervalMS: scrapeIntervalMS(javBusRequestInterval),
		},
		{
			ID: "javdatabase",
			URLs: []string{
				"https://www.javdatabase.com/movies/{code}/",
				"https://www.javdatabase.com/idols/{slug}/?ipage={n}",
			},
			Data:       []string{"title", "code", "studio", "series", "release", "duration", "tags", "actors", "cover", "samples", "actress_profile", "idol_works"},
			IntervalMS: scrapeIntervalMS(javDatabaseRequestInterval),
		},
		{
			ID: "javdb",
			URLs: []string{
				"https://javdb.com/search?q={code}&f=all",
				"https://javdb.com/v/{id}",
				"https://javdb.com/actors/{id}?page={n}",
			},
			Data:       []string{"title", "code", "studio", "series", "release", "duration", "tags", "actors", "male_actors", "cover", "samples", "idol_works"},
			IntervalMS: scrapeIntervalMS(javDBRequestInterval),
		},
		{
			ID: "avmoo",
			URLs: []string{
				"https://avmoo.shop/tw/search/{code}",
				"https://avmoo.shop/jav/data/api/search",
				"https://avmoo.shop/jav/data/api/getMovie",
			},
			Data:       []string{"title", "code", "series", "release", "duration", "tags", "actors", "cover", "samples"},
			IntervalMS: scrapeIntervalMS(avmooRequestInterval),
		},
		{
			ID: "avsox",
			URLs: []string{
				"https://avsox.click/cn/search/{code}",
				"https://avsox.click/javu/data/api/search",
				"https://avsox.click/javu/data/api/getMovie",
			},
			Data:       []string{"title", "code", "series", "release", "duration", "tags", "actors", "cover", "samples", "uncensored"},
			IntervalMS: scrapeIntervalMS(avsoxRequestInterval),
		},
		{
			ID: "javmenu",
			URLs: []string{
				"https://javmenu.com/{CODE}",
			},
			Data:       []string{"title", "code", "studio", "series", "release", "duration", "tags", "actors", "samples"},
			IntervalMS: scrapeIntervalMS(javMenuRequestInterval),
		},
		{
			ID: "missav",
			URLs: []string{
				"https://missav.ws/{CODE}",
			},
			Data:       []string{"title_zh"},
			IntervalMS: scrapeIntervalMS(missAVRequestInterval),
		},
		{
			ID: "minnanoav",
			URLs: []string{
				"https://www.minnano-av.com/search_result.php?search_scope=actress&search_word={name}",
				"https://www.minnano-av.com/actress{id}.html",
			},
			Data:       []string{"actress_profile"},
			IntervalMS: scrapeIntervalMS(minnanoAVRequestInterval),
		},
		{
			ID: "javmodel",
			URLs: []string{
				"https://javmodel.com/jav/search.html?q={name}",
				"https://javmodel.com/jav/{slug}",
			},
			Data:       []string{"actress_profile"},
			IntervalMS: scrapeIntervalMS(javModelRequestInterval),
		},
		{
			ID: "avdanyuwiki",
			URLs: []string{
				"https://avdanyuwiki.com/?s={code}",
			},
			Data:       []string{"male_actors"},
			IntervalMS: scrapeIntervalMS(avdanyuWikiRequestInterval),
		},
		{
			ID: "theporndb",
			URLs: []string{
				"https://api.theporndb.net/jav?external_id={code}",
			},
			Data:       []string{"title", "code", "release", "duration", "tags", "actors", "cover"},
			IntervalMS: scrapeIntervalMS(thePornDBRequestInterval),
		},
	}
}

func scrapeIntervalMS(d time.Duration) int64 {
	return d.Milliseconds()
}
