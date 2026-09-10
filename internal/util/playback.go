package util

import "strings"

type PlaybackProbeResult struct {
	Container      string `json:"container"`
	VideoCodec     string `json:"video_codec"`
	AudioCodec     string `json:"audio_codec"`
	SupportsDirect bool   `json:"supports_direct"`
	// OffersMP4 is true when the file is already an MP4 the browser might play
	// natively (H.264, or HEVC on Safari/Edge/Chrome with HEVC support).
	OffersMP4 bool `json:"offers_mp4"`
}

func ProbePlaybackSupport(path string) (*PlaybackProbeResult, error) {
	meta, err := ProbeVideo(path)
	if err != nil {
		return nil, err
	}
	result := AssessPlaybackSupport(meta)
	return &result, nil
}

func AssessPlaybackSupport(meta *VideoMetadata) PlaybackProbeResult {
	result := PlaybackProbeResult{}
	if meta == nil {
		return result
	}

	result.Container = normalizePlaybackValue(meta.Container)
	result.VideoCodec = normalizePlaybackValue(meta.VideoCodec)
	result.AudioCodec = normalizePlaybackValue(meta.AudioCodec)

	audioSafe := result.AudioCodec == "" || result.AudioCodec == "aac" || result.AudioCodec == "mp3"
	webmAudioSafe := result.AudioCodec == "" || result.AudioCodec == "opus" || result.AudioCodec == "vorbis"

	switch result.Container {
	case "mp4":
		h264 := result.VideoCodec == "h264"
		hevc := isHEVCCodec(result.VideoCodec)
		result.OffersMP4 = (h264 || hevc) && audioSafe && meta.ConstantFrameRate
		result.SupportsDirect = h264 && audioSafe && meta.ConstantFrameRate
	case "webm":
		result.SupportsDirect = (result.VideoCodec == "vp8" || result.VideoCodec == "vp9") && webmAudioSafe
	default:
		result.SupportsDirect = false
	}
	return result
}

func isHEVCCodec(codec string) bool {
	switch strings.ToLower(strings.TrimSpace(codec)) {
	case "hevc", "h265", "h.265":
		return true
	default:
		return false
	}
}

func normalizePlaybackValue(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}
