package util

import "testing"

func TestAssessPlaybackSupportCFRRequiredForDirectMP4(t *testing.T) {
	tests := []struct {
		name string
		meta *VideoMetadata
		want bool
	}{
		{
			name: "h264 CFR mp4 with aac direct",
			meta: &VideoMetadata{
				Container:         "mp4",
				VideoCodec:        "h264",
				AudioCodec:        "aac",
				ConstantFrameRate: true,
			},
			want: true,
		},
		{
			name: "h264 VFR mp4 falls back to HLS",
			meta: &VideoMetadata{
				Container:         "mp4",
				VideoCodec:        "h264",
				AudioCodec:        "aac",
				ConstantFrameRate: false,
			},
			want: false,
		},
		{
			name: "h264 mp4 with non-browser audio falls back to HLS",
			meta: &VideoMetadata{
				Container:         "mp4",
				VideoCodec:        "h264",
				AudioCodec:        "ac3",
				ConstantFrameRate: true,
			},
			want: false,
		},
		{
			name: "hevc mp4 falls back to HLS even when CFR",
			meta: &VideoMetadata{
				Container:         "mp4",
				VideoCodec:        "hevc",
				AudioCodec:        "aac",
				ConstantFrameRate: true,
			},
			want: false,
		},
		{
			name: "mkv always falls back to HLS",
			meta: &VideoMetadata{
				Container:         "mkv",
				VideoCodec:        "h264",
				AudioCodec:        "aac",
				ConstantFrameRate: true,
			},
			want: false,
		},
		{
			name: "webm vp9 opus direct",
			meta: &VideoMetadata{
				Container:         "webm",
				VideoCodec:        "vp9",
				AudioCodec:        "opus",
				ConstantFrameRate: true,
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := AssessPlaybackSupport(tt.meta).SupportsDirect
			if got != tt.want {
				t.Fatalf("AssessPlaybackSupport(%+v).SupportsDirect = %v, want %v", tt.meta, got, tt.want)
			}
		})
	}
}

func TestAssessPlaybackSupportNilMetaDoesNotPanic(t *testing.T) {
	result := AssessPlaybackSupport(nil)
	if result.SupportsDirect {
		t.Fatal("nil metadata should not support direct playback")
	}
}
