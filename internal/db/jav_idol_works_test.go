package db

import (
	"context"
	"testing"
	"time"

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

	libraryHighPlay := models.Jav{Code: "LIB-HIGH", Title: "High plays", CreatedAt: now, FetchedAt: now}
	libraryLowPlay := models.Jav{Code: "LIB-LOW", Title: "Low plays", CreatedAt: older, FetchedAt: older}
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

func codesOf(items []models.Jav) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.Code)
	}
	return out
}
