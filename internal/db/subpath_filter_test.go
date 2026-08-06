package db

import (
	"context"
	"testing"
	"time"

	"javboss/internal/models"
)

func TestDirectorySubpathFilterVideos(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/subpath-root"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	// Videos: one directly at the root, two under "JAV", one deep under
	// "JAV/ABC", one under a sibling "IDOL".
	entries := []string{
		"root.mp4",
		"JAV/IPX-001.mp4",
		"JAV/IPX-002.mp4",
		"JAV/ABC/deep.mp4",
		"IDOL/name-001.mp4",
	}
	for i, rel := range entries {
		video := models.Video{Fingerprint: "subpath-video-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		if _, err := UpsertVideoLocation(ctx, video.ID, dir.ID, rel, now); err != nil {
			t.Fatalf("upsert location %s: %v", rel, err)
		}
	}

	subpaths := []DirectorySubpath{{DirectoryID: dir.ID, Path: "JAV"}}
	items, err := ListVideos(ctx, 50, 0, nil, "", "recent", nil, []int64{dir.ID}, nil, subpaths)
	if err != nil {
		t.Fatalf("list videos with subpath: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("video count = %d, want 3 (JAV subtree only): %#v", len(items), items)
	}
	gotPaths := map[string]bool{}
	for _, item := range items {
		gotPaths[item.Path] = true
	}
	for _, want := range []string{"JAV/IPX-001.mp4", "JAV/IPX-002.mp4", "JAV/ABC/deep.mp4"} {
		if !gotPaths[want] {
			t.Fatalf("missing %s in results %#v", want, gotPaths)
		}
	}
	if gotPaths["root.mp4"] || gotPaths["IDOL/name-001.mp4"] {
		t.Fatalf("subpath filter leaked root/sibling videos: %#v", gotPaths)
	}

	count, err := CountVideos(ctx, nil, "", []int64{dir.ID}, nil, subpaths)
	if err != nil {
		t.Fatalf("count videos with subpath: %v", err)
	}
	if count != 3 {
		t.Fatalf("count = %d, want 3", count)
	}

	// Whole-root filter (no subpath) still returns everything.
	all, err := ListVideos(ctx, 50, 0, nil, "", "recent", nil, []int64{dir.ID}, nil, nil)
	if err != nil {
		t.Fatalf("list videos without subpath: %v", err)
	}
	if len(all) != 5 {
		t.Fatalf("video count without subpath = %d, want 5", len(all))
	}
}

func TestDirectorySubpathFilterTags(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/subpath-tags"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	tag := models.Tag{Name: "subpath-tag"}
	if err := gdb.Create(&tag).Error; err != nil {
		t.Fatalf("create tag: %v", err)
	}
	entries := []string{"FOCUS/one.mp4", "FOCUS/two.mp4", "OTHER/three.mp4"}
	for i, rel := range entries {
		video := models.Video{Fingerprint: "subpath-tag-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		if _, err := UpsertVideoLocation(ctx, video.ID, dir.ID, rel, now); err != nil {
			t.Fatalf("upsert location %s: %v", rel, err)
		}
		if err := gdb.Model(&models.VideoTag{}).Create(&models.VideoTag{VideoID: video.ID, TagID: tag.ID}).Error; err != nil {
			t.Fatalf("tag video: %v", err)
		}
	}

	subpaths := []DirectorySubpath{{DirectoryID: dir.ID, Path: "FOCUS"}}
	tags, err := ListTags(ctx, []int64{dir.ID}, nil, subpaths)
	if err != nil {
		t.Fatalf("list tags with subpath: %v", err)
	}
	if len(tags) != 1 || tags[0].Count != 2 {
		t.Fatalf("tag counts = %#v, want 1 tag with count 2", tags)
	}
}

func TestDirectorySubpathFilterJav(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/subpath-jav"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	javA := models.Jav{Code: "FOCUS-001", Title: "Focus A"}
	javB := models.Jav{Code: "OTHER-002", Title: "Other B"}
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
		{javA, "FOCUS/FOCUS-001.mp4"},
		{javA, "FOCUS/SUB/FOCUS-001-2nd.mp4"},
		{javB, "OTHER/OTHER-002.mp4"},
	}
	for i, entry := range entries {
		video := models.Video{Fingerprint: "subpath-jav-" + string(rune('a'+i))}
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

	subpaths := []DirectorySubpath{{DirectoryID: dir.ID, Path: "FOCUS"}}
	items, total, err := SearchJavWithPrefix(ctx, nil, nil, "", "", "recent", 50, 0, nil, []int64{dir.ID}, nil, subpaths)
	if err != nil {
		t.Fatalf("search jav with subpath: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].ID != javA.ID {
		t.Fatalf("jav filter = total %d items %#v, want only FOCUS-001", total, items)
	}
	if len(items[0].Videos) != 2 {
		t.Fatalf("attached videos = %#v, want the 2 FOCUS subtree locations", items[0].Videos)
	}

	// Play-count ordering must respect the subpath scope too.
	if err := gdb.Model(&models.Video{}).Where("id IN (SELECT video_id FROM video_location WHERE relative_path = ?)", "OTHER/OTHER-002.mp4").Update("play_count", 999).Error; err != nil {
		t.Fatalf("bump other play count: %v", err)
	}
	items, total, err = SearchJavWithPrefix(ctx, nil, nil, "", "", "play_count", 50, 0, nil, []int64{dir.ID}, nil, subpaths)
	if err != nil {
		t.Fatalf("search jav play_count with subpath: %v", err)
	}
	if total != 1 || items[0].ID != javA.ID {
		t.Fatalf("play_count filter = total %d items %#v, want only FOCUS-001", total, items)
	}
}

func TestDirectorySubpathFilterSpecialNames(t *testing.T) {
	gdb := openTestDB(t)
	ctx := context.Background()
	now := time.Unix(1710000000, 0).UTC()

	dir := models.Directory{Path: "/media/subpath-special"}
	if err := gdb.Create(&dir).Error; err != nil {
		t.Fatalf("create directory: %v", err)
	}
	// Subdirectory names containing LIKE wildcards and quotes.
	entries := []string{
		"50%_off/a.mp4",
		"50%_off/b.mp4",
		"50%x_off/c.mp4",
		"it's/d.mp4",
		"plain/e.mp4",
	}
	for i, rel := range entries {
		video := models.Video{Fingerprint: "subpath-special-" + string(rune('a'+i))}
		if err := gdb.Create(&video).Error; err != nil {
			t.Fatalf("create video: %v", err)
		}
		if _, err := UpsertVideoLocation(ctx, video.ID, dir.ID, rel, now); err != nil {
			t.Fatalf("upsert location %s: %v", rel, err)
		}
	}

	subpaths := []DirectorySubpath{
		{DirectoryID: dir.ID, Path: "50%_off"},
		{DirectoryID: dir.ID, Path: "it's"},
	}
	items, err := ListVideos(ctx, 50, 0, nil, "", "recent", nil, []int64{dir.ID}, nil, subpaths)
	if err != nil {
		t.Fatalf("list videos with special subpaths: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("video count = %d, want 3 (50%%_off x2 + it's): %#v", len(items), items)
	}
	for _, item := range items {
		if item.Path == "50%x_off/c.mp4" || item.Path == "plain/e.mp4" {
			t.Fatalf("special-name subpath filter leaked %s", item.Path)
		}
	}
}
