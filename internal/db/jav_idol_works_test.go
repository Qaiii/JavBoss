package db

import (
	"context"
	"testing"
	"time"

	"javboss/internal/jav"
	"javboss/internal/models"
)

func TestUpsertGetRemoveJavIdolTrack(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()

	idol := models.JavIdol{Name: "Tracked Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}

	// absent state
	state, err := GetJavIdolTrack(ctx, idol.ID)
	if err != nil {
		t.Fatalf("get track: %v", err)
	}
	if state.Tracked {
		t.Fatal("new idol should not be tracked")
	}

	// mark scraped
	now := time.Unix(1750000000, 0).UTC()
	if err := MarkJavIdolTrackScraped(ctx, idol.ID, "https://javdb.com/actors/abc", 12, now); err != nil {
		t.Fatalf("mark scraped: %v", err)
	}
	state, err = GetJavIdolTrack(ctx, idol.ID)
	if err != nil {
		t.Fatalf("get track: %v", err)
	}
	if !state.Tracked || state.WorksCount != 12 || state.JavdbURL != "https://javdb.com/actors/abc" {
		t.Fatalf("track state = %+v", state)
	}
	if state.LastScrapedAt == nil || !state.LastScrapedAt.Equal(now) {
		t.Fatalf("last_scraped_at = %v, want %v", state.LastScrapedAt, now)
	}

	// error state does not clobber prior scrape info beyond last_error
	if err := MarkJavIdolTrackError(ctx, idol.ID, nil); err != nil {
		t.Fatalf("mark error: %v", err)
	}
	state, err = GetJavIdolTrack(ctx, idol.ID)
	if err != nil {
		t.Fatalf("get track: %v", err)
	}
	if state.Tracked && state.WorksCount != 12 {
		t.Fatalf("error update should preserve works count: %+v", state)
	}

	if err := RemoveJavIdolTrack(ctx, idol.ID); err != nil {
		t.Fatalf("remove track: %v", err)
	}
	state, err = GetJavIdolTrack(ctx, idol.ID)
	if err != nil {
		t.Fatalf("get track: %v", err)
	}
	if state.Tracked {
		t.Fatal("idol should be untracked after remove")
	}
}

func TestReplaceAndListJavIdolWorks(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()

	idol := models.JavIdol{Name: "Works Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	other := models.JavIdol{Name: "Other Idol"}
	if err := gdb.Create(&other).Error; err != nil {
		t.Fatalf("create other idol: %v", err)
	}
	// one in-library work
	if err := gdb.Create(&models.Jav{Code: "IPX-001", Title: "In Library"}).Error; err != nil {
		t.Fatalf("create jav: %v", err)
	}

	works := []models.JavIdolWork{
		{JavIdolID: idol.ID, Code: "IPX-001", Title: "In Library", ReleaseUnix: 200},
		{JavIdolID: idol.ID, Code: "ABP-999", Title: "External", ReleaseUnix: 100},
		{JavIdolID: other.ID, Code: "SSIS-000", Title: "Other Idol Work", ReleaseUnix: 300},
	}
	if err := ReplaceJavIdolWorks(ctx, idol.ID, works); err != nil {
		t.Fatalf("replace works: %v", err)
	}

	items, total, err := ListJavIdolWorks(ctx, idol.ID, 24, 0)
	if err != nil {
		t.Fatalf("list works: %v", err)
	}
	if total != 2 {
		t.Fatalf("total = %d, want 2 (other idol's work excluded)", total)
	}
	if len(items) != 2 {
		t.Fatalf("items = %d, want 2", len(items))
	}
	if items[0].Code != "IPX-001" || !items[0].InLibrary {
		t.Fatalf("items[0] = %+v, want IPX-001 in-library", items[0])
	}
	if items[1].Code != "ABP-999" || items[1].InLibrary {
		t.Fatalf("items[1] = %+v, want ABP-999 not in-library", items[1])
	}

	// replace truncates: only new set remains
	if err := ReplaceJavIdolWorks(ctx, idol.ID, nil); err != nil {
		t.Fatalf("replace empty: %v", err)
	}
	_, total, err = ListJavIdolWorks(ctx, idol.ID, 24, 0)
	if err != nil {
		t.Fatalf("list works: %v", err)
	}
	if total != 0 {
		t.Fatalf("total after empty replace = %d, want 0", total)
	}
}

func TestReplaceJavIdolWorksKeepsJapaneseTitles(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()

	idol := models.JavIdol{Name: "Title Merge Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	if err := ReplaceJavIdolWorks(ctx, idol.ID, []models.JavIdolWork{
		{JavIdolID: idol.ID, Code: "IPX-001", Title: "中年オヤジ", CoverURL: "https://example.com/old.jpg", ReleaseUnix: 100, SourceURL: "https://javdb.com/v/old"},
		{JavIdolID: idol.ID, Code: "ABP-999", Title: "Old English", ReleaseUnix: 90},
	}); err != nil {
		t.Fatalf("seed works: %v", err)
	}
	if err := ReplaceJavIdolWorks(ctx, idol.ID, []models.JavIdolWork{
		{JavIdolID: idol.ID, Code: "IPX-001", Title: "Middle-aged Man", CoverURL: "https://example.com/new.jpg", ReleaseUnix: 0},
		{JavIdolID: idol.ID, Code: "ABP-999", Title: "ケースの女", ReleaseUnix: 190},
		{JavIdolID: idol.ID, Code: "SSIS-123", Title: "Brand New English", ReleaseUnix: 180},
	}); err != nil {
		t.Fatalf("replace works: %v", err)
	}

	items, total, err := ListJavIdolWorks(ctx, idol.ID, 24, 0)
	if err != nil {
		t.Fatalf("list works: %v", err)
	}
	if total != 3 {
		t.Fatalf("total = %d, want 3", total)
	}
	byCode := map[string]string{}
	coverByCode := map[string]string{}
	releaseByCode := map[string]int64{}
	sourceByCode := map[string]string{}
	for _, item := range items {
		byCode[item.Code] = item.Title
		coverByCode[item.Code] = item.CoverURL
		releaseByCode[item.Code] = item.ReleaseUnix
		sourceByCode[item.Code] = item.SourceURL
	}
	if byCode["IPX-001"] != "中年オヤジ" {
		t.Fatalf("IPX-001 title = %q, want Japanese kept", byCode["IPX-001"])
	}
	if coverByCode["IPX-001"] != "https://example.com/new.jpg" {
		t.Fatalf("IPX-001 cover = %q, want incoming cover", coverByCode["IPX-001"])
	}
	if releaseByCode["IPX-001"] != 100 {
		t.Fatalf("IPX-001 release = %d, want previous date kept", releaseByCode["IPX-001"])
	}
	if sourceByCode["IPX-001"] != "https://javdb.com/v/old" {
		t.Fatalf("IPX-001 source_url = %q, want previous source kept", sourceByCode["IPX-001"])
	}
	if byCode["ABP-999"] != "ケースの女" {
		t.Fatalf("ABP-999 title = %q, want incoming Japanese", byCode["ABP-999"])
	}
	if byCode["SSIS-123"] != "Brand New English" {
		t.Fatalf("SSIS-123 title = %q, want incoming English", byCode["SSIS-123"])
	}
}

func TestListIdolsNeedingWorksScrape(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()

	now := time.Unix(1750000000, 0).UTC()
	idol1 := models.JavIdol{Name: "Stale Idol"}      // scraped long ago -> due
	idol2 := models.JavIdol{Name: "Fresh Idol"}      // scraped recently -> not due
	idol3 := models.JavIdol{Name: "Never Attempted"} // no track row -> due
	idol4 := models.JavIdol{Name: "Old Failure"}     // failed long ago -> retry due
	idol5 := models.JavIdol{Name: "Recent Failure"}  // failed recently -> not retried yet
	idol6 := models.JavIdol{Name: "Recovered Stale"} // failed long ago, then succeeded recently
	for _, id := range []*models.JavIdol{&idol1, &idol2, &idol3, &idol4, &idol5, &idol6} {
		if err := gdb.Create(id).Error; err != nil {
			t.Fatalf("create idol: %v", err)
		}
	}
	old := now.Add(-8 * 24 * time.Hour)
	fresh := now.Add(-time.Hour)
	if err := MarkJavIdolTrackScraped(ctx, idol1.ID, "url1", 5, old); err != nil {
		t.Fatalf("mark idol1: %v", err)
	}
	if err := MarkJavIdolTrackScraped(ctx, idol2.ID, "url2", 3, fresh); err != nil {
		t.Fatalf("mark idol2: %v", err)
	}
	if err := MarkJavIdolTrackError(ctx, idol4.ID, nil); err != nil {
		t.Fatalf("mark idol4 failure: %v", err)
	}
	// idol4's failure happened at now; backdate its updated_at so it looks old.
	if err := gdb.Model(&models.JavIdolTrack{}).Where("jav_idol_id = ?", idol4.ID).
		Update("updated_at", old).Error; err != nil {
		t.Fatalf("backdate idol4: %v", err)
	}
	if err := MarkJavIdolTrackError(ctx, idol5.ID, nil); err != nil {
		t.Fatalf("mark idol5 failure: %v", err)
	}
	// idol6: an old failure followed by a fresh success. The failed attempt
	// updated the row again at `fresh`, so only the recent success decides.
	if err := MarkJavIdolTrackError(ctx, idol6.ID, nil); err != nil {
		t.Fatalf("mark idol6 failure: %v", err)
	}
	if err := gdb.Model(&models.JavIdolTrack{}).Where("jav_idol_id = ?", idol6.ID).
		Update("updated_at", old).Error; err != nil {
		t.Fatalf("backdate idol6 failure: %v", err)
	}
	if err := MarkJavIdolTrackScraped(ctx, idol6.ID, "url6", 1, fresh); err != nil {
		t.Fatalf("mark idol6 success: %v", err)
	}

	// Retry window: 30 minutes. Refresh window: 7 days.
	retrySince := now.Add(-30 * time.Minute)
	since := now.Add(-7 * 24 * time.Hour)
	due, err := ListIdolsNeedingWorksScrape(ctx, retrySince, since)
	if err != nil {
		t.Fatalf("list needing: %v", err)
	}
	got := map[int64]bool{}
	for _, id := range due {
		got[id] = true
	}
	if !got[idol1.ID] {
		t.Fatal("idol1 (stale success) should be due")
	}
	if got[idol2.ID] {
		t.Fatal("idol2 (fresh success) should not be due")
	}
	if !got[idol3.ID] {
		t.Fatal("idol3 (never attempted, e.g. imported by an older version) should be due")
	}
	if !got[idol4.ID] {
		t.Fatal("idol4 (old failure) should be retried")
	}
	if got[idol5.ID] {
		t.Fatal("idol5 (recent failure) should not be retried yet")
	}
	if got[idol6.ID] {
		t.Fatal("idol6 (old failure then fresh success) should not be retried")
	}
}

func TestJavIdolRetryMinutesConfigFallback(t *testing.T) {
	openTestDB(t)
	ctx := context.Background()
	if got := JavIdolRetryMinutes(ctx); got != DefaultJavIdolRetryMinutes {
		t.Fatalf("default retry minutes = %d, want %d", got, DefaultJavIdolRetryMinutes)
	}
	if err := UpsertConfig(ctx, map[string]string{"jav_idol_retry_minutes": "90"}); err != nil {
		t.Fatalf("upsert retry minutes config: %v", err)
	}
	if got := JavIdolRetryMinutes(ctx); got != 90 {
		t.Fatalf("configured retry minutes = %d, want 90", got)
	}
}

func TestFindJavIdolsByNamesMatchesNameAndAlias(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()

	idol := models.JavIdol{Name: "相沢みなみ"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	if err := gdb.Create(&models.JavIdolAlias{JavIdolID: idol.ID, Alias: "Aizawa Minami"}).Error; err != nil {
		t.Fatalf("create alias: %v", err)
	}

	ids, err := FindJavIdolsByNames(ctx, []string{"相沢みなみ", "Aizawa Minami", "Not A Real Idol", "相沢みなみ"})
	if err != nil {
		t.Fatalf("find idols: %v", err)
	}
	if len(ids) != 1 || ids[0] != idol.ID {
		t.Fatalf("ids = %v, want [%d]", ids, idol.ID)
	}

	empty, err := FindJavIdolsByNames(ctx, []string{"", "  "})
	if err != nil {
		t.Fatalf("find empty: %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("empty names should return no ids, got %v", empty)
	}
}

func TestSearchJavMergesUnimportedIdolWorks(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()
	older := now.Add(-24 * time.Hour)

	dir := models.Directory{Path: "/tmp/media"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	idol := models.JavIdol{Name: "Merge Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	studio := models.JavStudio{Name: "Merge Studio"}
	if err := gdb.Create(&studio).Error; err != nil {
		t.Fatalf("create studio: %v", err)
	}

	libraryHighPlay := models.Jav{Code: "LIB-HIGH", Title: "High plays", StudioID: &studio.ID, CreatedAt: now, FetchedAt: now}
	libraryLowPlay := models.Jav{Code: "LIB-LOW", Title: "Low plays", StudioID: &studio.ID, CreatedAt: older, FetchedAt: older}
	if err := gdb.Create(&libraryHighPlay).Error; err != nil {
		t.Fatalf("create high play jav: %v", err)
	}
	if err := gdb.Create(&libraryLowPlay).Error; err != nil {
		t.Fatalf("create low play jav: %v", err)
	}
	if err := gdb.Create(&[]models.JavIdolMap{
		{JavID: libraryHighPlay.ID, JavIdolID: idol.ID},
		{JavID: libraryLowPlay.ID, JavIdolID: idol.ID},
	}).Error; err != nil {
		t.Fatalf("create idol maps: %v", err)
	}
	videos := []models.Video{
		{DirectoryID: dir.ID, Path: "lib-high.mp4", Filename: "lib-high.mp4", Fingerprint: "fp-lib-high", JavID: int64Ptr(libraryHighPlay.ID), PlayCount: 12, ModifiedAt: now},
		{DirectoryID: dir.ID, Path: "lib-low.mp4", Filename: "lib-low.mp4", Fingerprint: "fp-lib-low", JavID: int64Ptr(libraryLowPlay.ID), PlayCount: 3, ModifiedAt: older},
	}
	if err := gdb.Create(&videos).Error; err != nil {
		t.Fatalf("create videos: %v", err)
	}
	createVideoLocationsForVideos(t, gdb, videos...)

	if err := ReplaceJavIdolWorks(ctx, idol.ID, []models.JavIdolWork{
		{JavIdolID: idol.ID, Code: "LIB-HIGH", Title: "Also scraped", ReleaseUnix: 300},
		{JavIdolID: idol.ID, Code: "EXT-NEW", Title: "Unimported", ReleaseUnix: 400, CoverURL: "https://cover/ext-new.jpg", SourceURL: "https://javdb.com/ext-new"},
		{JavIdolID: idol.ID, Code: "EXT-HIDE", Title: "Disliked unimported", ReleaseUnix: 500},
	}); err != nil {
		t.Fatalf("replace works: %v", err)
	}
	if err := DislikeJavIdolWork(ctx, idol.ID, "EXT-HIDE"); err != nil {
		t.Fatalf("dislike unimported: %v", err)
	}
	if err := DislikeJavIdolWork(ctx, idol.ID, "LIB-HIGH"); err != nil {
		t.Fatalf("dislike imported: %v", err)
	}

	filters := JavSearchFilters{StudioID: -1, IncludeExternal: true}
	items, total, err := SearchJavWithPrefixFilters(ctx, []int64{idol.ID}, nil, "", "", "play_count", 20, 0, nil, nil, filters, nil, nil)
	if err != nil {
		t.Fatalf("search merged play_count: %v", err)
	}
	if total != 3 {
		t.Fatalf("total = %d, want 3 (library + unimported, disliked unimported hidden)", total)
	}
	got := make([]string, 0, len(items))
	for _, item := range items {
		got = append(got, item.Code)
	}
	want := []string{"LIB-HIGH", "LIB-LOW", "EXT-NEW"}
	if len(got) != len(want) {
		t.Fatalf("codes = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("codes = %v, want %v", got, want)
		}
	}
	if items[2].InLibrary == nil || *items[2].InLibrary {
		t.Fatalf("EXT-NEW in_library = %#v, want false", items[2].InLibrary)
	}
	if items[2].CoverURL != "https://cover/ext-new.jpg" || items[2].SourceURL != "https://javdb.com/ext-new" {
		t.Fatalf("EXT-NEW cover/source = %+v", items[2])
	}
	if !items[2].CreatedAt.Equal(javExternalEpoch) {
		t.Fatalf("unimported created_at = %v, want epoch %v", items[2].CreatedAt, javExternalEpoch)
	}
	if len(items[0].Videos) == 0 || items[0].Videos[0].PlayCount != 12 {
		t.Fatalf("LIB-HIGH videos = %+v, want hydrated play count 12", items[0].Videos)
	}

	byCode, _, err := SearchJavWithPrefixFilters(ctx, []int64{idol.ID}, nil, "", "", "code", 20, 0, nil, nil, filters, nil, nil)
	if err != nil {
		t.Fatalf("search merged code: %v", err)
	}
	if len(byCode) != 3 || byCode[0].Code != "EXT-NEW" || byCode[1].Code != "LIB-HIGH" || byCode[2].Code != "LIB-LOW" {
		t.Fatalf("code order = %v, want EXT-NEW, LIB-HIGH, LIB-LOW", codesOf(byCode))
	}

	byRelease, _, err := SearchJavWithPrefixFilters(ctx, []int64{idol.ID}, nil, "", "", "release", 20, 0, nil, nil, filters, nil, nil)
	if err != nil {
		t.Fatalf("search merged release: %v", err)
	}
	if len(byRelease) != 3 || byRelease[0].Code != "EXT-NEW" {
		t.Fatalf("release order = %v, want EXT-NEW first", codesOf(byRelease))
	}

	page, total, err := SearchJavWithPrefixFilters(ctx, []int64{idol.ID}, nil, "", "", "code", 1, 1, nil, nil, filters, nil, nil)
	if err != nil {
		t.Fatalf("search merged page: %v", err)
	}
	if total != 3 || len(page) != 1 || page[0].Code != "LIB-HIGH" {
		t.Fatalf("page offset 1 = %v total=%d, want [LIB-HIGH] total 3", codesOf(page), total)
	}
	if page[0].Studio == nil || page[0].Studio.Name != "Merge Studio" {
		t.Fatalf("paginated library item studio = %+v, want hydrated Merge Studio", page[0].Studio)
	}
	if len(page[0].Idols) != 1 || page[0].Idols[0].ID != idol.ID {
		t.Fatalf("paginated library item idols = %+v, want hydrated idol", page[0].Idols)
	}

	recent, _, err := SearchJavWithPrefixFilters(ctx, []int64{idol.ID}, nil, "", "", "recent", 20, 0, nil, nil, filters, nil, nil)
	if err != nil {
		t.Fatalf("search merged recent: %v", err)
	}
	if len(recent) != 3 || recent[0].Code != "LIB-HIGH" || recent[1].Code != "LIB-LOW" || recent[2].Code != "EXT-NEW" {
		t.Fatalf("recent order = %v, want LIB-HIGH, LIB-LOW, EXT-NEW", codesOf(recent))
	}

	recentAsc, _, err := SearchJavWithPrefixFilters(ctx, []int64{idol.ID}, nil, "", "", "recent_asc", 20, 0, nil, nil, filters, nil, nil)
	if err != nil {
		t.Fatalf("search merged recent_asc: %v", err)
	}
	if len(recentAsc) != 3 || recentAsc[0].Code != "EXT-NEW" {
		t.Fatalf("recent_asc first = %v, want EXT-NEW first", codesOf(recentAsc))
	}

	withoutExternal, total, err := SearchJavWithPrefixFilters(ctx, []int64{idol.ID}, nil, "", "", "code", 20, 0, nil, nil, JavSearchFilters{StudioID: -1}, nil, nil)
	if err != nil {
		t.Fatalf("search without external: %v", err)
	}
	if total != 2 || len(withoutExternal) != 2 {
		t.Fatalf("without external total=%d len=%d, want 2", total, len(withoutExternal))
	}
}

func TestJavCodePrefixFromCode(t *testing.T) {
	cases := map[string]string{
		"START-602":  "START",
		"heyzo_1751": "HEYZO",
		"IPX-001":    "IPX",
		"ABC":        "",
	}
	for in, want := range cases {
		if got := javCodePrefixFromCode(in); got != want {
			t.Fatalf("javCodePrefixFromCode(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSearchJavUnimportedAttachesStudioSeriesTags(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	dir := models.Directory{Path: "/tmp/unimported-meta"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	idol := models.JavIdol{Name: "Meta Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	studio := models.JavStudio{Name: "SOD CREATE"}
	if err := gdb.Create(&studio).Error; err != nil {
		t.Fatalf("create studio: %v", err)
	}
	aliasStudio := models.JavStudio{Name: "IDEA POCKET"}
	if err := gdb.Create(&aliasStudio).Error; err != nil {
		t.Fatalf("create alias studio: %v", err)
	}
	if err := gdb.Create(&models.JavStudioAlias{JavStudioID: aliasStudio.ID, Alias: "アイデアポケット"}).Error; err != nil {
		t.Fatalf("create studio alias: %v", err)
	}
	series := models.JavSeries{Name: "中年オヤジ"}
	if err := gdb.Create(&series).Error; err != nil {
		t.Fatalf("create series: %v", err)
	}
	tag := models.JavTag{Name: "美少女"}
	if err := gdb.Create(&tag).Error; err != nil {
		t.Fatalf("create tag: %v", err)
	}

	library := models.Jav{Code: "START-001", Title: "Library Start", StudioID: &studio.ID, CreatedAt: now, FetchedAt: now}
	if err := gdb.Create(&library).Error; err != nil {
		t.Fatalf("create library jav: %v", err)
	}
	if err := gdb.Create(&models.JavIdolMap{JavID: library.ID, JavIdolID: idol.ID}).Error; err != nil {
		t.Fatalf("create idol map: %v", err)
	}
	video := models.Video{
		DirectoryID: dir.ID,
		Path:        "start-001.mp4",
		Filename:    "start-001.mp4",
		Fingerprint: "fp-start-001",
		JavID:       int64Ptr(library.ID),
		ModifiedAt:  now,
	}
	if err := gdb.Create(&video).Error; err != nil {
		t.Fatalf("create video: %v", err)
	}
	createVideoLocationsForVideos(t, gdb, video)

	if err := ReplaceJavIdolWorks(ctx, idol.ID, []models.JavIdolWork{
		{
			JavIdolID:   idol.ID,
			Code:        "START-602",
			Title:       "Prefix Studio Work",
			ReleaseUnix: 200,
		},
		{
			JavIdolID:   idol.ID,
			Code:        "IPX-228",
			Title:       "Named Metadata Work",
			ReleaseUnix: 100,
			StudioName:  "アイデアポケット",
			SeriesName:  "中年オヤジ",
			Tags:        models.JavStringList{"美少女", "Unknown Tag"},
		},
	}); err != nil {
		t.Fatalf("replace works: %v", err)
	}

	items, total, err := SearchJavWithPrefixFilters(ctx, []int64{idol.ID}, nil, "", "", "code", 20, 0, nil, nil, JavSearchFilters{StudioID: -1, IncludeExternal: true}, nil, nil)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if total != 3 {
		t.Fatalf("total = %d, want 3", total)
	}
	byCode := map[string]models.Jav{}
	for _, item := range items {
		byCode[item.Code] = item
	}

	prefixItem := byCode["START-602"]
	if prefixItem.Studio == nil || prefixItem.Studio.ID != studio.ID || prefixItem.Studio.Name != "SOD CREATE" {
		t.Fatalf("START-602 studio = %+v, want SOD CREATE from prefix", prefixItem.Studio)
	}

	named := byCode["IPX-228"]
	if named.Studio == nil || named.Studio.ID != aliasStudio.ID {
		t.Fatalf("IPX-228 studio = %+v, want IDEA POCKET via alias", named.Studio)
	}
	if named.Series == nil || named.Series.ID != series.ID || named.Series.Name != "中年オヤジ" {
		t.Fatalf("IPX-228 series = %+v, want 中年オヤジ", named.Series)
	}
	if len(named.Tags) != 2 {
		t.Fatalf("IPX-228 tags = %+v, want 2", named.Tags)
	}
	if named.Tags[0].ID != tag.ID || named.Tags[0].Name != "美少女" {
		t.Fatalf("IPX-228 tag[0] = %+v, want catalog 美少女", named.Tags[0])
	}
	if named.Tags[1].ID != 0 || named.Tags[1].Name != "Unknown Tag" {
		t.Fatalf("IPX-228 tag[1] = %+v, want unmatched name", named.Tags[1])
	}
}

func TestApplyJavInfoToIdolWorksAndListNeedingMetadata(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	idol := models.JavIdol{Name: "Enrich Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	if err := ReplaceJavIdolWorks(ctx, idol.ID, []models.JavIdolWork{
		{JavIdolID: idol.ID, Code: "IPX-001", Title: "Old English", ReleaseUnix: 50},
	}); err != nil {
		t.Fatalf("replace works: %v", err)
	}
	codes, err := ListIdolWorkCodesNeedingMetadata(ctx)
	if err != nil {
		t.Fatalf("list needing: %v", err)
	}
	if len(codes) != 1 || codes[0] != "IPX-001" {
		t.Fatalf("needing codes = %v, want [IPX-001]", codes)
	}

	if err := ApplyJavInfoToIdolWorks(ctx, &jav.JavInfo{
		Code:        "IPX-001",
		Title:       "中年オヤジ",
		Studio:      "IDEA POCKET",
		Series:      "中年オヤジ",
		Tags:        []string{"美少女"},
		DurationMin: 170,
	}); err != nil {
		t.Fatalf("apply info: %v", err)
	}

	var row models.JavIdolWork
	if err := gdb.Where("code = ?", "IPX-001").First(&row).Error; err != nil {
		t.Fatalf("reload work: %v", err)
	}
	if row.Title != "中年オヤジ" || row.StudioName != "IDEA POCKET" || row.SeriesName != "中年オヤジ" || row.DurationMin != 170 {
		t.Fatalf("updated work = %+v", row)
	}
	if len(row.Tags) != 1 || row.Tags[0] != "美少女" {
		t.Fatalf("updated tags = %#v", row.Tags)
	}
	codes, err = ListIdolWorkCodesNeedingMetadata(ctx)
	if err != nil {
		t.Fatalf("list needing after apply: %v", err)
	}
	if len(codes) != 0 {
		t.Fatalf("needing codes after apply = %v, want empty", codes)
	}
}

func TestReplaceJavIdolWorksKeepsStudioSeriesTags(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	idol := models.JavIdol{Name: "Keep Meta Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	if err := ReplaceJavIdolWorks(ctx, idol.ID, []models.JavIdolWork{
		{
			JavIdolID:   idol.ID,
			Code:        "IPX-001",
			Title:       "中年オヤジ",
			StudioName:  "IDEA POCKET",
			SeriesName:  "中年オヤジ",
			Tags:        models.JavStringList{"美少女"},
			ReleaseUnix: 100,
		},
	}); err != nil {
		t.Fatalf("seed works: %v", err)
	}
	if err := ReplaceJavIdolWorks(ctx, idol.ID, []models.JavIdolWork{
		{JavIdolID: idol.ID, Code: "IPX-001", Title: "Middle-aged Man", ReleaseUnix: 100},
	}); err != nil {
		t.Fatalf("replace listing-only: %v", err)
	}
	var row models.JavIdolWork
	if err := gdb.Where("code = ?", "IPX-001").First(&row).Error; err != nil {
		t.Fatalf("reload work: %v", err)
	}
	if row.StudioName != "IDEA POCKET" || row.SeriesName != "中年オヤジ" {
		t.Fatalf("studio/series = %q / %q, want kept", row.StudioName, row.SeriesName)
	}
	if len(row.Tags) != 1 || row.Tags[0] != "美少女" {
		t.Fatalf("tags = %#v, want kept 美少女", row.Tags)
	}
}

func TestApplyTitleZHAndKeepOnReplace(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	idol := models.JavIdol{Name: "Title ZH Idol"}
	if err := gdb.Create(&idol).Error; err != nil {
		t.Fatalf("create idol: %v", err)
	}
	if err := gdb.Create(&models.Jav{Code: "IPX-001", Title: "中年オヤジ"}).Error; err != nil {
		t.Fatalf("create jav: %v", err)
	}
	if err := ReplaceJavIdolWorks(ctx, idol.ID, []models.JavIdolWork{
		{JavIdolID: idol.ID, Code: "IPX-001", Title: "中年オヤジ", ReleaseUnix: 50},
	}); err != nil {
		t.Fatalf("replace works: %v", err)
	}

	codes, err := ListCodesMissingTitleZH(ctx)
	if err != nil {
		t.Fatalf("list missing title_zh: %v", err)
	}
	if len(codes) != 1 || codes[0] != "IPX-001" {
		t.Fatalf("missing title_zh = %v, want [IPX-001]", codes)
	}
	needs, err := CodeNeedsTitleZH(ctx, "IPX-001")
	if err != nil {
		t.Fatalf("needs title_zh: %v", err)
	}
	if !needs {
		t.Fatal("expected IPX-001 to need title_zh")
	}

	if err := ApplyTitleZH(ctx, "IPX-001", "中年父亲与制服美少女"); err != nil {
		t.Fatalf("apply title_zh: %v", err)
	}
	if err := ApplyTitleZH(ctx, "IPX-001", "should not overwrite"); err != nil {
		t.Fatalf("apply title_zh second: %v", err)
	}

	var javRow models.Jav
	if err := gdb.Where("code = ?", "IPX-001").First(&javRow).Error; err != nil {
		t.Fatalf("reload jav: %v", err)
	}
	if javRow.TitleZH != "中年父亲与制服美少女" {
		t.Fatalf("jav title_zh = %q", javRow.TitleZH)
	}
	var work models.JavIdolWork
	if err := gdb.Where("code = ?", "IPX-001").First(&work).Error; err != nil {
		t.Fatalf("reload work: %v", err)
	}
	if work.TitleZH != "中年父亲与制服美少女" {
		t.Fatalf("work title_zh = %q", work.TitleZH)
	}

	codes, err = ListCodesMissingTitleZH(ctx)
	if err != nil {
		t.Fatalf("list missing after apply: %v", err)
	}
	if len(codes) != 0 {
		t.Fatalf("missing title_zh after apply = %v, want empty", codes)
	}

	if err := ReplaceJavIdolWorks(ctx, idol.ID, []models.JavIdolWork{
		{JavIdolID: idol.ID, Code: "IPX-001", Title: "中年オヤジ", ReleaseUnix: 50},
	}); err != nil {
		t.Fatalf("replace without title_zh: %v", err)
	}
	var reloaded models.JavIdolWork
	if err := gdb.Where("code = ?", "IPX-001").First(&reloaded).Error; err != nil {
		t.Fatalf("reload work after replace: %v", err)
	}
	if reloaded.TitleZH != "中年父亲与制服美少女" {
		t.Fatalf("kept title_zh = %q", reloaded.TitleZH)
	}
	item := javFromUnimportedIdolWork(reloaded, nil)
	if item.TitleZH != reloaded.TitleZH {
		t.Fatalf("unimported title_zh = %q, want %q", item.TitleZH, reloaded.TitleZH)
	}
}

func codesOf(items []models.Jav) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.Code)
	}
	return out
}
