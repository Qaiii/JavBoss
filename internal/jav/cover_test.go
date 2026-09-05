package jav

import "testing"

func TestSelectCoverAndPosterPrefersDistinctSmallPoster(t *testing.T) {
	cover, poster := SelectCoverAndPoster(
		"https://cdn.example/ipx00228pl.jpg",
		"https://cdn.example/ipx00228ps.jpg",
	)
	if cover != "https://cdn.example/ipx00228pl.jpg" {
		t.Fatalf("cover = %q", cover)
	}
	if poster != "https://cdn.example/ipx00228ps.jpg" {
		t.Fatalf("poster = %q", poster)
	}
}

func TestSelectCoverAndPosterDerivesDMMPoster(t *testing.T) {
	cover, poster := SelectCoverAndPoster("https://jp.netcdn.space/digital/video/ipx00228/ipx00228pl.jpg", "")
	if cover != "https://jp.netcdn.space/digital/video/ipx00228/ipx00228pl.jpg" {
		t.Fatalf("cover = %q", cover)
	}
	if poster != "https://jp.netcdn.space/digital/video/ipx00228/ipx00228ps.jpg" {
		t.Fatalf("poster = %q, want derived ps.jpg", poster)
	}
}

func TestDerivePosterURLIgnoresUnknownPatterns(t *testing.T) {
	if got := DerivePosterURL("https://www.javbus.com/pics/cover/c85j_b.jpg"); got != "" {
		t.Fatalf("javbus cover should not derive a poster URL, got %q", got)
	}
	if got := DerivePosterURL("https://c0.jdbstatic.com/covers/kk/kKdRm.jpg"); got != "" {
		t.Fatalf("javdb cover should not derive a poster URL, got %q", got)
	}
}

func TestIsThumbnailPosterURL(t *testing.T) {
	if !IsThumbnailPosterURL("https://jp.netcdn.space/digital/video/ipx00228/ipx00228ps.jpg") {
		t.Fatal("expected DMM ps.jpg to be a thumbnail poster")
	}
	if !IsThumbnailPosterURL("https://www.javdatabase.com/covers/thumb/1s/1sods00062ps.webp") {
		t.Fatal("expected listing ps.webp to be a thumbnail poster")
	}
	if IsThumbnailPosterURL("https://jp.netcdn.space/digital/video/ipx00228/ipx00228pl.jpg") {
		t.Fatal("landscape pl.jpg should not be treated as a thumbnail poster")
	}
	if IsThumbnailPosterURL("https://www.javbus.com/pics/cover/c85j_b.jpg") {
		t.Fatal("javbus landscape cover should not be treated as a thumbnail poster")
	}
}
