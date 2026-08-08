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

func TestListDueJavIdolTrackIDs(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()

	now := time.Unix(1750000000, 0).UTC()
	idol1 := models.JavIdol{Name: "Due Idol"}
	idol2 := models.JavIdol{Name: "Fresh Idol"}
	idol3 := models.JavIdol{Name: "Never Scraped"}
	for _, id := range []*models.JavIdol{&idol1, &idol2, &idol3} {
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
	if err := UpsertJavIdolTrack(ctx, idol3.ID, nil); err != nil {
		t.Fatalf("track idol3 without scrape: %v", err)
	}

	since := now.Add(-7 * 24 * time.Hour)
	due, err := ListDueJavIdolTrackIDs(ctx, since)
	if err != nil {
		t.Fatalf("list due: %v", err)
	}
	got := map[int64]bool{}
	for _, id := range due {
		got[id] = true
	}
	if !got[idol1.ID] {
		t.Fatal("idol1 (old scrape) should be due")
	}
	if got[idol2.ID] {
		t.Fatal("idol2 (fresh scrape) should not be due")
	}
	if got[idol3.ID] {
		t.Fatal("idol3 (never scraped) should not be due via the refresh scheduler; it is re-queued on import")
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
