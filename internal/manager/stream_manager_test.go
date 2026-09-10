package manager

import (
	"slices"
	"strings"
	"testing"
)

func TestBuildHLSArgsUsesHighQualityTranscode(t *testing.T) {
	args := buildHLSArgs(hlsEncodeOptions{
		Segment:   3,
		OutputDir: "/tmp/hls",
	})

	required := []string{
		"-c:v", "libx264",
		"-preset", hlsTranscodePreset,
		"-crf", hlsTranscodeCRF,
		"-c:a", "aac",
		"-start_number", "3",
	}
	for i := 0; i+1 < len(required); i += 2 {
		if !hasFlagValue(args, required[i], required[i+1]) {
			t.Fatalf("expected %s %s in %v", required[i], required[i+1], args)
		}
	}
	if slices.Contains(args, "25") {
		t.Fatalf("legacy CRF 25 should not be used, got %v", args)
	}
}

func TestBuildHLSArgsCopiesBrowserSafeAudio(t *testing.T) {
	args := buildHLSArgs(hlsEncodeOptions{
		OutputDir: "/tmp/hls",
		CopyAudio: true,
	})
	if !hasFlagValue(args, "-c:a", "copy") {
		t.Fatalf("expected audio copy, got %v", args)
	}
	if slices.Contains(args, "aac") {
		t.Fatalf("did not expect audio transcode when copying, got %v", args)
	}
}

func TestBuildHLSArgsDropsAudioWhenVideoOnly(t *testing.T) {
	args := buildHLSArgs(hlsEncodeOptions{
		OutputDir: "/tmp/hls",
		VideoOnly: true,
		CopyAudio: true,
	})
	if !slices.Contains(args, "-an") {
		t.Fatalf("expected -an for video-only, got %v", args)
	}
	if hasFlagValue(args, "-c:a", "copy") || hasFlagValue(args, "-c:a", "aac") {
		t.Fatalf("video-only should not set an audio codec, got %v", args)
	}
}

func TestCanCopyAudio(t *testing.T) {
	tests := []struct {
		codec string
		want  bool
	}{
		{codec: "aac", want: true},
		{codec: "AAC", want: true},
		{codec: "mp3", want: true},
		{codec: "ac3", want: false},
		{codec: "", want: false},
	}
	for _, tt := range tests {
		got := canCopyAudio(&streamVideoFile{AudioCodec: tt.codec})
		if got != tt.want {
			t.Fatalf("canCopyAudio(%q) = %v, want %v", tt.codec, got, tt.want)
		}
	}
	if canCopyAudio(nil) {
		t.Fatal("nil video file should not copy audio")
	}
}

func TestScaleFilterUsesLanczosWhenDownscaling(t *testing.T) {
	got := scaleFilter(&streamVideoFile{Width: 1920, Height: 1080}, 720)
	if !strings.Contains(got, "flags=lanczos") {
		t.Fatalf("expected lanczos scale, got %q", got)
	}
	if scaleFilter(&streamVideoFile{Width: 1280, Height: 720}, 720) != "" {
		t.Fatal("same or smaller source should not scale")
	}
}

func hasFlagValue(args []string, flag string, value string) bool {
	for i := 0; i+1 < len(args); i++ {
		if args[i] == flag && args[i+1] == value {
			return true
		}
	}
	return false
}
