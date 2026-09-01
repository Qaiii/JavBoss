package subtitle

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// cue is one subtitle entry parsed from either srt or vtt.
type cue struct {
	start   int64 // milliseconds
	end     int64 // milliseconds
	payload []string
}

var (
	cueTimeLineRe = regexp.MustCompile(`^\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*(.*)$`)
	// VTT allows dropping the hours (MM:SS.mmm) in older files; mpv-emitted
	// subtitles and most downloads still carry hours, but keep this for safety.
	vttShortTimeRe = regexp.MustCompile(`^\s*(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2})[,.](\d{1,3})\s*(.*)$`)
)

func parseMilliseconds(h, m, s, ms string) (int64, error) {
	hh, err := strconv.Atoi(h)
	if err != nil {
		return 0, err
	}
	mm, err := strconv.Atoi(m)
	if err != nil {
		return 0, err
	}
	ss, err := strconv.Atoi(s)
	if err != nil {
		return 0, err
	}
	milli, err := strconv.Atoi(ms)
	if err != nil {
		return 0, err
	}
	if milli > 999 {
		milli = 999
	}
	return int64(hh)*3600000 + int64(mm)*60000 + int64(ss)*1000 + int64(milli), nil
}

func parseCueTimeLine(line string) (int64, int64, bool) {
	if m := cueTimeLineRe.FindStringSubmatch(line); m != nil {
		start, err1 := parseMilliseconds(m[1], m[2], m[3], m[4])
		end, err2 := parseMilliseconds(m[5], m[6], m[7], m[8])
		if err1 == nil && err2 == nil {
			return start, end, true
		}
	}
	if m := vttShortTimeRe.FindStringSubmatch(line); m != nil {
		start, err1 := parseMilliseconds("0", m[1], m[2], m[3])
		end, err2 := parseMilliseconds("0", m[4], m[5], m[6])
		if err1 == nil && err2 == nil {
			return start, end, true
		}
	}
	return 0, 0, false
}

func formatSRTTime(ms int64) string {
	hh := ms / 3600000
	mm := (ms % 3600000) / 60000
	ss := (ms % 60000) / 1000
	fff := ms % 1000
	return fmt.Sprintf("%02d:%02d:%02d,%03d", hh, mm, ss, fff)
}

func formatVTTTime(ms int64) string {
	hh := ms / 3600000
	mm := (ms % 3600000) / 60000
	ss := (ms % 60000) / 1000
	fff := ms % 1000
	return fmt.Sprintf("%02d:%02d:%02d.%03d", hh, mm, ss, fff)
}

// parseCues parses subtitle text (srt or vtt) into normalized cues. VTT NOTE
// blocks and styling directives are dropped.
func parseCues(text string) []cue {
	var cues []cue
	var current *cue
	flush := func() {
		if current != nil && len(current.payload) > 0 {
			cues = append(cues, *current)
		}
		current = nil
	}

	for _, rawLine := range strings.Split(text, "\n") {
		line := strings.TrimRight(rawLine, "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			flush()
			continue
		}
		// VTT header and NOTE blocks.
		if strings.EqualFold(trimmed, "WEBVTT") ||
			strings.HasPrefix(strings.ToUpper(trimmed), "WEBVTT ") ||
			strings.EqualFold(trimmed, "NOTE") ||
			strings.HasPrefix(trimmed, "NOTE ") {
			continue
		}
		// Cue identifiers (numbers in srt, arbitrary text in vtt) are dropped.
		if current == nil {
			if _, _, ok := parseCueTimeLine(line); ok {
				start, end, _ := parseCueTimeLine(line)
				current = &cue{start: start, end: end}
				continue
			}
			if isNumericIDLine(line) {
				continue
			}
			if strings.HasPrefix(trimmed, "STYLE") || strings.HasPrefix(trimmed, "REGION") {
				continue
			}
			// Tolerate stray text before a cue.
			continue
		}
		if _, _, ok := parseCueTimeLine(line); ok {
			flush()
			start, end, _ := parseCueTimeLine(line)
			current = &cue{start: start, end: end}
			continue
		}
		if isNumericIDLine(line) {
			continue
		}
		current.payload = append(current.payload, line)
	}
	flush()
	return cues
}

func isNumericIDLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return false
	}
	for _, r := range trimmed {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// SRT converts normalized subtitle text (srt or vtt) to SubRip (.srt) format.
func SRT(text string) (string, error) {
	cues := parseCues(text)
	if len(cues) == 0 {
		return "", fmt.Errorf("no subtitle cues found")
	}
	var b strings.Builder
	for i, cue := range cues {
		if cue.end <= cue.start {
			cue.end = cue.start + 1
		}
		fmt.Fprintf(&b, "%d\n%s --> %s\n", i+1, formatSRTTime(cue.start), formatSRTTime(cue.end))
		for _, line := range cue.payload {
			b.WriteString(line)
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}
	return strings.TrimSuffix(b.String(), "\n\n") + "\n", nil
}

// VTT converts normalized subtitle text (srt or vtt) to WebVTT format suitable
// for feeding directly to a browser <track> element.
func VTT(text string) (string, error) {
	cues := parseCues(text)
	if len(cues) == 0 {
		return "", fmt.Errorf("no subtitle cues found")
	}
	var b strings.Builder
	b.WriteString("WEBVTT\n\n")
	for _, cue := range cues {
		if cue.end <= cue.start {
			cue.end = cue.start + 1
		}
		fmt.Fprintf(&b, "%s --> %s\n", formatVTTTime(cue.start), formatVTTTime(cue.end))
		for _, line := range cue.payload {
			b.WriteString(line)
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}
	return b.String(), nil
}
