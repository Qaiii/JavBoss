package util

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"github.com/h2non/filetype"

	"javboss/internal/runtimeconfig"
)

type VideoMetadata struct {
	Codec           string
	VideoCodec      string
	AudioCodec      string
	Container       string
	FormatName      string
	Width           int
	Height          int
	FPS             float64
	SampleRate      int
	Channels        int
	DurationSeconds float64
	FormatBitRate   int64
	VideoBitRate    int64
	AudioBitRate    int64
	// ConstantFrameRate reports whether the container's frame timing is uniform
	// (single stts delta for the video track). Non-CFR sources cause browsers'
	// CFR video renderers to periodically drop frames, so they should not be
	// served through the direct MP4 path.
	ConstantFrameRate bool
}

func (m *VideoMetadata) Fingerprint(size int64) string {
	fps := m.FPS
	if fps > 0 {
		fps = math.Round(fps*1000) / 1000
	}
	dur := math.Round(m.DurationSeconds)
	return fmt.Sprintf("%dx%d|%s|%.3f|%d|%d|%.0f|%d",
		m.Width,
		m.Height,
		strings.TrimSpace(m.Codec),
		fps,
		m.SampleRate,
		m.Channels,
		dur,
		size)
}

// FingerprintV2 returns a metadata-only fingerprint with higher granularity.
// Format: widthxheight|bitrate|video_bitrate|audio_bitrate|duration_ms|size
func (m *VideoMetadata) FingerprintV2(size int64) string {
	durationMs := int64(math.Round(m.DurationSeconds * 1000))
	return fmt.Sprintf("%dx%d|%d|%d|%d|%d|%d",
		m.Width,
		m.Height,
		m.FormatBitRate,
		m.VideoBitRate,
		m.AudioBitRate,
		durationMs,
		size)
}

// IsVideoCandidate reports whether a file should be passed to ffprobe for final
// video-stream validation. Known video extensions are accepted as candidates so
// uncommon or newer container signatures are not filtered out prematurely.
func IsVideoCandidate(path string) bool {
	if hasVideoExtension(filepath.Ext(path)) {
		return true
	}
	return IsVideo(path)
}

// IsVideo detects video content by inspecting the initial bytes and matching
// known container signatures.
func IsVideo(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()

	// filetype recommends at least 261 bytes. Read enough MPEG-TS packets to
	// recognize transport streams by content even when the extension is incorrect
	// (for example, a .mp4 file containing MPEG-TS data).
	header := make([]byte, 4*204)
	n, err := f.Read(header)
	if n == 0 && err != nil {
		return false
	}
	buf := header[:n]
	if isMPEGTransportStreamHeader(buf) {
		return true
	}
	if hasVideoExtension(ext) && isISOBMFFHeader(buf) {
		return true
	}
	if isRealMediaExtension(ext) && isRealMediaHeader(buf) {
		return true
	}
	kind, err := filetype.Match(buf)
	if err != nil {
		return false
	}
	if kind == filetype.Unknown {
		return false
	}
	// Accept any MIME with top-level type "video"
	return strings.HasPrefix(kind.MIME.Value, "video/") || kind.MIME.Type == "video"
}

func isMPEGTransportStreamHeader(buf []byte) bool {
	const packetsToCheck = 4
	layouts := []struct {
		packetSize int
		syncOffset int
	}{
		{packetSize: 188, syncOffset: 0},
		{packetSize: 192, syncOffset: 4},
		{packetSize: 192, syncOffset: 0},
		{packetSize: 204, syncOffset: 0},
	}
	for _, layout := range layouts {
		required := layout.syncOffset + (packetsToCheck-1)*layout.packetSize + 1
		if len(buf) < required {
			continue
		}
		matched := true
		for packet := 0; packet < packetsToCheck; packet++ {
			if buf[layout.syncOffset+packet*layout.packetSize] != 0x47 {
				matched = false
				break
			}
		}
		if matched {
			return true
		}
	}
	return false
}

func isISOBMFFHeader(buf []byte) bool {
	if len(buf) < 12 || !bytes.Equal(buf[4:8], []byte("ftyp")) {
		return false
	}
	boxSize := binary.BigEndian.Uint32(buf[:4])
	return boxSize == 1 || boxSize >= 16
}

func hasVideoExtension(ext string) bool {
	switch strings.ToLower(strings.TrimSpace(ext)) {
	case ".3g2", ".3gp",
		".av1",
		".asf", ".avi",
		".divx",
		".dv",
		".f4v", ".flv",
		".264", ".265", ".h264", ".h265", ".hevc",
		".ivf",
		".m2ts", ".m2v", ".m4v", ".mkv", ".mov", ".mp4", ".mpe", ".mpeg", ".mpegts", ".mpg", ".mpv", ".mts", ".mxf",
		".nut",
		".ogg", ".ogm", ".ogv",
		".qt",
		".rm", ".rmvb",
		".ts",
		".vob",
		".webm", ".wmv",
		".xvid",
		".y4m", ".yuv":
		return true
	default:
		return false
	}
}

func isRealMediaExtension(ext string) bool {
	switch ext {
	case ".rmvb", ".rm":
		return true
	default:
		return false
	}
}

func isRealMediaHeader(buf []byte) bool {
	return bytes.HasPrefix(buf, []byte(".RMF"))
}

var (
	ffprobeOnce sync.Once
	ffprobePath string
	ffprobeErr  error
)

// ResolveFFprobePath resolves the ffprobe binary location.
func ResolveFFprobePath() (string, error) {
	ffprobeOnce.Do(func() {
		ffprobePath, ffprobeErr = findFFprobePath()
	})
	return ffprobePath, ffprobeErr
}

// ResolveFFmpegPath resolves the ffmpeg binary location.
func ResolveFFmpegPath() (string, error) {
	return findFFmpegPath()
}

func findFFprobePath() (string, error) {
	return findFFBinaryPath("FFPROBE_PATH", "ffprobe")
}

func findFFmpegPath() (string, error) {
	return findFFBinaryPath("FFMPEG_PATH", "ffmpeg")
}

// FFmpegToolRelativePath returns the persistent project-relative path used for
// FFmpeg downloaded from the frontend tools panel.
func FFmpegToolRelativePath() string {
	platformOS := runtime.GOOS
	if platformOS == "darwin" {
		platformOS = "macos"
	}
	platformArch := runtime.GOARCH
	if platformArch == "amd64" {
		platformArch = "x86_64"
	}

	binName := "ffmpeg"
	if runtime.GOOS == "windows" {
		binName += ".exe"
	}
	return filepath.Join("data", "tools", platformOS+"-"+platformArch, binName)
}

func findFFBinaryPath(envKey, name string) (string, error) {
	var candidates []string
	containerMode := runtimeconfig.ContainerMode()
	if env := strings.TrimSpace(os.Getenv(envKey)); env != "" &&
		shouldUseFFBinaryEnv(name, containerMode) {
		candidates = append(candidates, env)
	}

	binName := name
	if runtime.GOOS == "windows" {
		binName = name + ".exe"
	}

	if wd, err := os.Getwd(); err == nil {
		candidates = append(
			candidates,
			ffBinaryCandidatesForBase(wd, name, binName, runtime.GOOS, FFmpegToolRelativePath())...,
		)
	}
	if execPath, err := os.Executable(); err == nil {
		execDir := filepath.Dir(execPath)
		candidates = append(
			candidates,
			ffBinaryCandidatesForBase(execDir, name, binName, runtime.GOOS, FFmpegToolRelativePath())...,
		)
	}
	candidates = append(candidates, binName)

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if resolved, err := exec.LookPath(candidate); err == nil {
			return resolved, nil
		}
	}
	if name == "ffmpeg" {
		if containerMode {
			return "", fmt.Errorf("%s not found; set %s or place binary at %s", name, envKey, filepath.ToSlash(FFmpegToolRelativePath()))
		}
		return "", fmt.Errorf("%s not found; place binary at %s", name, filepath.ToSlash(FFmpegToolRelativePath()))
	}
	return "", fmt.Errorf("%s not found; set %s or place binary at internal/bin/%s", name, envKey, binName)
}

func shouldUseFFBinaryEnv(name string, containerMode bool) bool {
	return name != "ffmpeg" || containerMode
}

func ffBinaryCandidatesForBase(baseDir string, name string, binName string, goos string, ffmpegToolPath string) []string {
	bundledPath := filepath.Join(baseDir, "internal", "bin", binName)
	if name != "ffmpeg" {
		return []string{bundledPath}
	}

	downloadedPath := filepath.Join(baseDir, ffmpegToolPath)
	if goos == "darwin" {
		return []string{bundledPath, downloadedPath}
	}
	return []string{downloadedPath, bundledPath}
}

// ProbeVideo extracts codec/resolution/fps/duration using ffprobe.
func ProbeVideo(path string) (*VideoMetadata, error) {
	return ProbeVideoContext(context.Background(), path)
}

// ProbeVideoContext extracts codec/resolution/fps/duration using ffprobe.
func ProbeVideoContext(ctx context.Context, path string) (*VideoMetadata, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("empty path")
	}
	ffprobe, err := ResolveFFprobePath()
	if err != nil {
		return nil, err
	}
	// -v quiet -print_format json -show_streams -select_streams v:0
	cmd := exec.CommandContext(ctx, ffprobe,
		"-v", "error",
		"-print_format", "json",
		"-show_entries", "stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,sample_rate,channels,bit_rate",
		"-show_entries", "format=duration,size,bit_rate,format_name",
		path,
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		errMsg := strings.TrimSpace(stderr.String())
		if errMsg != "" {
			return nil, fmt.Errorf("ffprobe: %w: %s", err, errMsg)
		}
		return nil, fmt.Errorf("ffprobe: %w", err)
	}
	meta, err := parseFFprobeOutput(out, path)
	if err != nil {
		return nil, err
	}
	// 浏览器直接播放依赖 CFR（恒定帧率）帧时序：非 CFR 源（如重编码时
	// 时间基取整不当的 MP4）会被 Chrome 的 CFR 渲染器周期性丢帧，导致
	// 观感卡顿。仅对浏览器可直放的 MP4 家族探测帧时序均匀性。
	if isDirectPlayableContainer(meta.Container) {
		meta.ConstantFrameRate = probeConstantFrameRate(path)
	} else {
		// 非 MP4 家族无法直放，必然走转码通道；转码会重建 CFR 时序。
		meta.ConstantFrameRate = true
	}
	return meta, nil
}

// isDirectPlayableContainer reports whether the container can be played
// directly by browsers without transcoding.
func isDirectPlayableContainer(container string) bool {
	switch container {
	case "mp4", "mov", "m4v", "3gp", "3g2":
		return true
	default:
		return false
	}
}

type ffprobeStream struct {
	CodecName    string `json:"codec_name"`
	CodecType    string `json:"codec_type"`
	PixFmt       string `json:"pix_fmt"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	AvgFrameRate string `json:"avg_frame_rate"`
	RFrameRate   string `json:"r_frame_rate"`
	Duration     string `json:"duration"`
	DurationTS   int64  `json:"duration_ts"`
	SampleRate   string `json:"sample_rate"`
	Channels     int    `json:"channels"`
	BitRate      string `json:"bit_rate"`
}
type ffprobeResult struct {
	Streams []ffprobeStream `json:"streams"`
	Format  struct {
		Duration   string `json:"duration"`
		Size       string `json:"size"`
		BitRate    string `json:"bit_rate"`
		FormatName string `json:"format_name"`
	} `json:"format"`
}

func parseFFprobeOutput(out []byte, path string) (*VideoMetadata, error) {
	var res ffprobeResult
	if err := json.Unmarshal(out, &res); err != nil {
		return nil, fmt.Errorf("parse ffprobe json: %w", err)
	}
	var video *ffprobeStream
	var audio *ffprobeStream
	for i := range res.Streams {
		s := res.Streams[i]
		switch strings.ToLower(strings.TrimSpace(s.CodecType)) {
		case "video":
			if video == nil {
				video = &s
			}
		case "audio":
			if audio == nil {
				audio = &s
			}
		}
	}
	if video == nil {
		return nil, errors.New("ffprobe: no video stream")
	}
	fps := parseRate(video.AvgFrameRate)
	if fps == 0 {
		fps = parseRate(video.RFrameRate)
	}
	duration := parseDurationSeconds(video.Duration, video.DurationTS, fps)
	if duration == 0 {
		duration = parseFloat(res.Format.Duration)
	}
	meta := &VideoMetadata{
		Codec:           strings.TrimSpace(video.CodecName),
		VideoCodec:      strings.TrimSpace(video.CodecName),
		FormatName:      normalizeFormatName(res.Format.FormatName),
		Container:       detectContainer(res.Format.FormatName, path),
		Width:           video.Width,
		Height:          video.Height,
		FPS:             fps,
		DurationSeconds: duration,
	}
	if audio != nil {
		meta.AudioCodec = strings.TrimSpace(audio.CodecName)
		if sr, err := strconv.Atoi(strings.TrimSpace(audio.SampleRate)); err == nil {
			meta.SampleRate = sr
		}
		meta.Channels = audio.Channels
		if meta.DurationSeconds == 0 {
			meta.DurationSeconds = parseDurationSeconds(audio.Duration, audio.DurationTS, 0)
		}
	}
	meta.FormatBitRate = parseInt64(res.Format.BitRate)
	meta.VideoBitRate = parseInt64(video.BitRate)
	if audio != nil {
		meta.AudioBitRate = parseInt64(audio.BitRate)
	}
	return meta, nil
}

func parseRate(rate string) float64 {
	rate = strings.TrimSpace(rate)
	if rate == "" || rate == "0/0" {
		return 0
	}
	if strings.Contains(rate, "/") {
		parts := strings.Split(rate, "/")
		if len(parts) == 2 {
			num, _ := strconv.ParseFloat(parts[0], 64)
			den, _ := strconv.ParseFloat(parts[1], 64)
			if num > 0 && den > 0 {
				return num / den
			}
		}
	}
	v, _ := strconv.ParseFloat(rate, 64)
	return v
}

func parseDurationSeconds(durationStr string, durationTS int64, fps float64) float64 {
	if durationStr != "" {
		if v, err := strconv.ParseFloat(durationStr, 64); err == nil && v > 0 {
			return v
		}
	}
	if durationTS > 0 && fps > 0 {
		return float64(durationTS) / fps
	}
	return 0
}

func parseFloat(raw string) float64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	v, _ := strconv.ParseFloat(raw, 64)
	return v
}

func parseInt64(raw string) int64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	v, _ := strconv.ParseInt(raw, 10, 64)
	return v
}

func normalizeFormatName(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	part := strings.Split(raw, ",")[0]
	return strings.ToLower(strings.TrimSpace(part))
}

func detectContainer(formatName, path string) string {
	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(path)))
	real := normalizeFormatName(formatName)

	// 优先采用 ffprobe 探测到的真实容器格式，防止扩展名与内容不符导致误判：
	// 例如把 MPEG-TS 流改名为 .mp4 后，若仅按扩展名判定为 mp4，浏览器 <video>
	// 会直接尝试播放 TS 数据而失败（本项目因此类文件只能走 HLS 转封装通道）。
	switch real {
	case "mov", "mp4", "m4a", "3gp", "3g2", "mj2":
		// MP4 家族（含 .mov/.m4v/.3gp 等），浏览器可直接播放
		return "mp4"
	case "matroska", "webm":
		// ffprobe 对 MKV 与 WebM 均报告 "matroska,webm"，用扩展名区分
		if ext == ".webm" {
			return "webm"
		}
		return "mkv"
	case "mpegts":
		// TS 传输流（含蓝光 M2TS），浏览器无法直接播放，需走 HLS 等转封装通道
		if ext == ".m2ts" || ext == ".mts" {
			return "m2ts"
		}
		return "ts"
	case "rm":
		if ext == ".rmvb" || ext == ".rm" {
			return "rmvb"
		}
		return "rm"
	case "asf":
		return "wmv"
	}
	if real != "" {
		// 其余情况以探测到的真实格式为准（如 avi/flv/mpeg 等），
		// 防止扩展名与内容不符（如 MKV 改名 .mp4）导致误判
		return real
	}

	// 探测失败时退回扩展名判断
	switch ext {
	case ".mp4", ".m4v":
		return "mp4"
	case ".mov":
		return "mov"
	case ".webm":
		return "webm"
	case ".mkv":
		return "mkv"
	case ".avi":
		return "avi"
	case ".wmv":
		return "wmv"
	case ".flv":
		return "flv"
	case ".rmvb", ".rm":
		return "rmvb"
	case ".ts":
		return "ts"
	case ".m2ts", ".mts":
		return "m2ts"
	case ".mpg", ".mpeg":
		return "mpeg"
	}
	return ""
}
