package db

import (
	"context"
	"testing"
	"time"

	"javboss/internal/models"
)

func TestListDirectorySubdirectories(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/subdir-root"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	// Videos: root file, two under "JAV", one under "IDOL", one deleted under "HIDDEN".
	files := []string{
		"root.mp4",
		"JAV/IPX-001.mp4",
		"JAV/IPX-002.mp4",
		"IDOL/name-001.mp4",
		"HIDDEN/secret.mp4",
	}
	locations := make([]models.VideoLocation, 0, len(files))
	for i, rel := range files {
		video := models.Video{Fingerprint: "subdir-video-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		loc, err := UpsertVideoLocation(ctx, video.ID, dir.ID, rel, now)
		if err != nil {
			t.Fatalf("upsert location %s: %v", rel, err)
		}
		locations = append(locations, *loc)
	}
	if err := gdb.Model(&models.VideoLocation{}).
		Where("id = ?", locations[4].ID).
		Update("is_delete", true).Error; err != nil {
		t.Fatalf("hide location: %v", err)
	}

	got, err := ListDirectorySubdirectories(ctx, dir.ID)
	if err != nil {
		t.Fatalf("list subdirectories: %v", err)
	}
	if got.RootVideoCount != 1 {
		t.Fatalf("root video count = %d, want 1", got.RootVideoCount)
	}
	if len(got.Subdirectories) != 2 {
		t.Fatalf("subdirectory count = %d, want 2 (%#v)", len(got.Subdirectories), got.Subdirectories)
	}
	if got.Subdirectories[0].Name != "JAV" || got.Subdirectories[0].VideoCount != 2 {
		t.Fatalf("first subdirectory = %+v, want JAV with 2 videos", got.Subdirectories[0])
	}
	if got.Subdirectories[1].Name != "IDOL" || got.Subdirectories[1].VideoCount != 1 {
		t.Fatalf("second subdirectory = %+v, want IDOL with 1 video", got.Subdirectories[1])
	}
}

func TestListDirectorySubdirectoriesNoRootFiles(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/subdir-no-root"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	for i, rel := range []string{"A/one.mp4", "A/two.mp4", "B/three.mp4"} {
		video := models.Video{Fingerprint: "subdir-no-root-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		if _, err := UpsertVideoLocation(ctx, video.ID, dir.ID, rel, now); err != nil {
			t.Fatalf("upsert location %s: %v", rel, err)
		}
	}

	got, err := ListDirectorySubdirectories(ctx, dir.ID)
	if err != nil {
		t.Fatalf("list subdirectories: %v", err)
	}
	if got.RootVideoCount != 0 {
		t.Fatalf("root video count = %d, want 0", got.RootVideoCount)
	}
	if len(got.Subdirectories) != 2 {
		t.Fatalf("subdirectory count = %d, want 2 (%#v)", len(got.Subdirectories), got.Subdirectories)
	}
}

func TestListDirectorySubdirectoriesNestedTree(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/subdir-tree"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	entries := []string{
		"root.mp4",
		"JAV/a.mp4",
		"JAV/ABC/deep1.mp4",
		"JAV/ABC/deep2.mp4",
		"JAV/XYZ/deep3.mp4",
		"IDOL/b.mp4",
	}
	for i, rel := range entries {
		video := models.Video{Fingerprint: "subdir-tree-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		if _, err := UpsertVideoLocation(ctx, video.ID, dir.ID, rel, now); err != nil {
		t.Fatalf("upsert location %s: %v", rel, err)
		}
	}

	got, err := ListDirectorySubdirectories(ctx, dir.ID)
	if err != nil {
		t.Fatalf("list subdirectories: %v", err)
	}
	if got.RootVideoCount != 1 {
		t.Fatalf("root video count = %d, want 1", got.RootVideoCount)
	}
	if len(got.Subdirectories) != 2 {
		t.Fatalf("top-level subdirectories = %d, want 2 (%#v)", len(got.Subdirectories), got.Subdirectories)
	}
	jav := got.Subdirectories[0]
	if jav.Name != "JAV" || jav.Path != "JAV" || jav.DirectVideoCount != 1 || jav.VideoCount != 4 {
		t.Fatalf("JAV node = %+v, want direct 1 total 4", jav)
	}
	if len(jav.Subdirectories) != 2 {
		t.Fatalf("JAV children = %d, want 2 (%#v)", len(jav.Subdirectories), jav.Subdirectories)
	}
	abc := jav.Subdirectories[0]
	if abc.Name != "ABC" || abc.Path != "JAV/ABC" || abc.DirectVideoCount != 2 || abc.VideoCount != 2 {
		t.Fatalf("ABC node = %+v, want direct 2 total 2", abc)
	}
	if len(abc.Subdirectories) != 0 {
		t.Fatalf("ABC children = %d, want 0", len(abc.Subdirectories))
	}
	xyz := jav.Subdirectories[1]
	if xyz.Name != "XYZ" || xyz.Path != "JAV/XYZ" || xyz.VideoCount != 1 {
		t.Fatalf("XYZ node = %+v, want total 1", xyz)
	}
}

func TestClosedSubdirectoryFilterNested(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/closed-nested"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	entries := []string{
		"JAV/direct.mp4",
		"JAV/ABC/deep1.mp4",
		"JAV/ABC/deep2.mp4",
		"JAV/XYZ/deep3.mp4",
		"IDOL/other.mp4",
	}
	for i, rel := range entries {
		video := models.Video{Fingerprint: "closed-nested-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		if _, err := UpsertVideoLocation(ctx, video.ID, dir.ID, rel, now); err != nil {
		t.Fatalf("upsert location %s: %v", rel, err)
		}
	}

	// Closing only the nested JAV/ABC hides that subtree but keeps JAV direct files.
	closed := []ClosedSubdirectory{{DirectoryID: dir.ID, Name: "JAV/ABC"}}
	items, err := ListVideos(ctx, 50, 0, nil, "", "recent", nil, []int64{dir.ID}, closed)
	if err != nil {
		t.Fatalf("list videos with nested closed subdir: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("nested filter count = %d, want 3 (%#v)", len(items), items)
	}
	for _, item := range items {
		if item.Path == "JAV/ABC/deep1.mp4" || item.Path == "JAV/ABC/deep2.mp4" {
			t.Fatalf("nested closed subdirectory video still visible: %s", item.Path)
		}
	}

	// Closing the parent JAV hides the whole subtree including JAV/ABC.
	closedParent := []ClosedSubdirectory{{DirectoryID: dir.ID, Name: "JAV"}}
	parentItems, err := ListVideos(ctx, 50, 0, nil, "", "recent", nil, []int64{dir.ID}, closedParent)
	if err != nil {
		t.Fatalf("list videos with parent closed subdir: %v", err)
	}
	if len(parentItems) != 1 || parentItems[0].Path != "IDOL/other.mp4" {
		t.Fatalf("parent filter result = %#v, want only IDOL/other.mp4", parentItems)
	}
}

func TestClosedSubdirectoryFilterVideos(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dirA := models.Directory{Path: "/media/closed-a"}
	dirB := models.Directory{Path: "/media/closed-b"}
	if err := gdb.Create(&dirA).Error; err != nil {
		t.Fatalf("create directory A: %v", err)
	}
	if err := gdb.Create(&dirB).Error; err != nil {
		t.Fatalf("create directory B: %v", err)
	}
	// dirA: root file + JAV subdir; dirB: PRED subdir.
	entries := []struct {
		dir  models.Directory
		path string
	}{
		{dirA, "root.mp4"},
		{dirA, "JAV/IPX-001.mp4"},
		{dirA, "JAV/IPX-002.mp4"},
		{dirA, "IDOL/name-001.mp4"},
		{dirB, "PRED/PRED-001.mp4"},
	}
	for i, entry := range entries {
		video := models.Video{Fingerprint: "closed-filter-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		if _, err := UpsertVideoLocation(ctx, video.ID, entry.dir.ID, entry.path, now); err != nil {
			t.Fatalf("upsert location %s: %v", entry.path, err)
		}
	}

	// No closed subdirs: everything in dirA is visible.
	all, err := ListVideos(ctx, 50, 0, nil, "", "recent", nil, []int64{dirA.ID}, nil)
	if err != nil {
		t.Fatalf("list videos without filter: %v", err)
	}
	if len(all) != 4 {
		t.Fatalf("unfiltered count = %d, want 4", len(all))
	}

	// Close JAV under dirA: root + IDOL remain, JAV is hidden.
	closed := []ClosedSubdirectory{{DirectoryID: dirA.ID, Name: "JAV"}}
	filtered, err := ListVideos(ctx, 50, 0, nil, "", "recent", nil, []int64{dirA.ID}, closed)
	if err != nil {
		t.Fatalf("list videos with closed subdir: %v", err)
	}
	if len(filtered) != 2 {
		t.Fatalf("filtered count = %d, want 2 (%#v)", len(filtered), filtered)
	}
	for _, item := range filtered {
		if item.Path == "JAV/IPX-001.mp4" || item.Path == "JAV/IPX-002.mp4" {
			t.Fatalf("closed subdirectory video still visible: %s", item.Path)
		}
	}
	count, err := CountVideos(ctx, nil, "", []int64{dirA.ID}, closed)
	if err != nil {
		t.Fatalf("count videos with closed subdir: %v", err)
	}
	if count != 2 {
		t.Fatalf("filtered count total = %d, want 2", count)
	}

	// Closing JAV in dirA must not affect dirB.
	dirBItems, err := ListVideos(ctx, 50, 0, nil, "", "recent", nil, []int64{dirA.ID, dirB.ID}, closed)
	if err != nil {
		t.Fatalf("list videos across directories: %v", err)
	}
	if len(dirBItems) != 3 {
		t.Fatalf("cross-directory count = %d, want 3 (dirA root+IDOL, dirB PRED)", len(dirBItems))
	}
}

func TestClosedSubdirectoryFilterJav(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/closed-jav"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	javA := models.Jav{Code: "CLOSED-001", Title: "Closed A"}
	javB := models.Jav{Code: "CLOSED-002", Title: "Closed B"}
	if err := gdb.Create(&javA).Error; err != nil {
		t.Fatalf("create jav A: %v", err)
	}
	if err := gdb.Create(&javB).Error; err != nil {
		t.Fatalf("create jav B: %v", err)
	}
	entries := []struct {
		jav  models.Jav
		path string
	}{
		{javA, "KEEP/CLOSED-001.mp4"},
		{javB, "HIDE/CLOSED-002.mp4"},
	}
	for i, entry := range entries {
		video := models.Video{Fingerprint: "closed-jav-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		loc, err := UpsertVideoLocation(ctx, video.ID, dir.ID, entry.path, now)
		if err != nil {
			t.Fatalf("upsert location %s: %v", entry.path, err)
		}
		if err := gdb.Model(&models.VideoLocation{}).
			Where("id = ?", loc.ID).
			Update("jav_id", entry.jav.ID).Error; err != nil {
			t.Fatalf("link jav: %v", err)
		}
	}

	closed := []ClosedSubdirectory{{DirectoryID: dir.ID, Name: "HIDE"}}
	items, total, err := SearchJavWithPrefix(ctx, nil, nil, "", "", "recent", 50, 0, nil, []int64{dir.ID}, closed)
	if err != nil {
		t.Fatalf("search jav with closed subdir: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].ID != javA.ID {
		t.Fatalf("jav filter = total %d items %#v, want only CLOSED-001", total, items)
	}
	if len(items[0].Videos) != 1 || items[0].Videos[0].Path != "KEEP/CLOSED-001.mp4" {
		t.Fatalf("attached videos = %#v, want only KEEP/CLOSED-001.mp4", items[0].Videos)
	}
}

func TestClosedSubdirectoryFilterTags(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/closed-tags"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	tag := models.Tag{Name: "closed-tag"}
	if err := gdb.Create(&tag).Error; err != nil {
		t.Fatalf("create tag: %v", err)
	}
	entries := []string{"VISIBLE/one.mp4", "HIDDEN/two.mp4"}
	for i, rel := range entries {
		video := models.Video{Fingerprint: "closed-tag-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		loc, err := UpsertVideoLocation(ctx, video.ID, dir.ID, rel, now)
		if err != nil {
			t.Fatalf("upsert location %s: %v", rel, err)
		}
		if err := gdb.Model(&models.VideoTag{}).Create(&models.VideoTag{VideoID: video.ID, TagID: tag.ID}).Error; err != nil {
			t.Fatalf("tag video: %v", err)
		}
		_ = loc
	}

	closed := []ClosedSubdirectory{{DirectoryID: dir.ID, Name: "HIDDEN"}}
	tags, err := ListTags(ctx, []int64{dir.ID}, closed)
	if err != nil {
		t.Fatalf("list tags with closed subdir: %v", err)
	}
	if len(tags) != 1 || tags[0].Count != 1 {
		t.Fatalf("tag counts = %#v, want 1 tag with count 1", tags)
	}
}

func TestClosedSubdirectoryFilterSpecialNames(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/closed-special"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	// Subdirectory names containing LIKE wildcards, slashes and quotes.
	entries := []string{
		"50%_off/a.mp4",
		"50%_off/b.mp4",
		"it's/c.mp4",
		"plain/d.mp4",
	}
	for i, rel := range entries {
		video := models.Video{Fingerprint: "closed-special-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		if _, err := UpsertVideoLocation(ctx, video.ID, dir.ID, rel, now); err != nil {
			t.Fatalf("upsert location %s: %v", rel, err)
		}
	}

	closed := []ClosedSubdirectory{
		{DirectoryID: dir.ID, Name: "50%_off"},
		{DirectoryID: dir.ID, Name: "it's"},
	}
	items, err := ListVideos(ctx, 50, 0, nil, "", "recent", nil, []int64{dir.ID}, closed)
	if err != nil {
		t.Fatalf("list videos with special names: %v", err)
	}
	if len(items) != 1 || items[0].Path != "plain/d.mp4" {
		t.Fatalf("special-name filter result = %#v, want only plain/d.mp4", items)
	}

	// The inline SQL variant (used by tag counts) must behave the same.
	tags, err := ListTags(ctx, []int64{dir.ID}, closed)
	if err != nil {
		t.Fatalf("list tags with special names: %v", err)
	}
	_ = tags
}
