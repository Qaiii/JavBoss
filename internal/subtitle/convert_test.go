package subtitle

import (
	"strings"
	"testing"
)

func TestSRTToVTT(t *testing.T) {
	input := `1
00:00:01,000 --> 00:00:03,500
第一行字幕
Second line

2
00:00:05,123 --> 00:00:08,999
第三行
`
	vtt, err := VTT(input)
	if err != nil {
		t.Fatalf("VTT: %v", err)
	}
	if !strings.HasPrefix(vtt, "WEBVTT\n") {
		t.Fatalf("missing WEBVTT header: %q", vtt[:20])
	}
	if !strings.Contains(vtt, "00:00:01.000 --> 00:00:03.500") {
		t.Fatalf("first cue time not converted: %q", vtt)
	}
	if !strings.Contains(vtt, "00:00:05.123 --> 00:00:08.999") {
		t.Fatalf("second cue time not converted: %q", vtt)
	}
	if strings.Contains(vtt, ",") {
		t.Fatalf("SRT comma separator leaked into VTT: %q", vtt)
	}
}

func TestVTTToSRT(t *testing.T) {
	input := `WEBVTT

00:00:01.000 --> 00:00:03.500 align:start position:10%
第一行

00:00:05.123 --> 00:00:08.999
第二行
`
	srt, err := SRT(input)
	if err != nil {
		t.Fatalf("SRT: %v", err)
	}
	if !strings.HasPrefix(srt, "1\n00:00:01,000 --> 00:00:03,500\n") {
		t.Fatalf("first cue wrong: %q", srt)
	}
	if !strings.Contains(srt, "00:00:05,123 --> 00:00:08,999") {
		t.Fatalf("second cue wrong: %q", srt)
	}
	if strings.Contains(srt, "align:start") {
		t.Fatalf("VTT cue settings leaked into SRT: %q", srt)
	}
}

func TestVTTShortTimeFormats(t *testing.T) {
	input := `WEBVTT

0:01.000 --> 0:03.500
short form
`
	vtt, err := VTT(input)
	if err != nil {
		t.Fatalf("VTT: %v", err)
	}
	if !strings.Contains(vtt, "00:00:01.000 --> 00:00:03.500") {
		t.Fatalf("short cue time not normalized: %q", vtt)
	}
}

func TestSRTRoundTrip(t *testing.T) {
	input := `1
00:00:01,000 --> 00:00:03,500
hello

2
00:00:05,000 --> 00:00:07,000
world
`
	first, err := VTT(input)
	if err != nil {
		t.Fatalf("VTT: %v", err)
	}
	second, err := SRT(first)
	if err != nil {
		t.Fatalf("SRT: %v", err)
	}
	want := `1
00:00:01,000 --> 00:00:03,500
hello

2
00:00:05,000 --> 00:00:07,000
world
`
	if second != want {
		t.Fatalf("round trip mismatch:\n got: %q\nwant: %q", second, want)
	}
}

func TestSRTWithoutNumbers(t *testing.T) {
	// Some srt files omit the numeric ids entirely.
	input := `00:00:01,000 --> 00:00:03,500
no id here

00:00:05,000 --> 00:00:07,000
still works
`
	srt, err := SRT(input)
	if err != nil {
		t.Fatalf("SRT: %v", err)
	}
	if !strings.HasPrefix(srt, "1\n00:00:01,000 --> 00:00:03,500\nno id here\n") {
		t.Fatalf("cues not renumbered: %q", srt)
	}
}

func TestParseCuesDropsNote(t *testing.T) {
	input := `WEBVTT

NOTE this is a comment

00:00:01.000 --> 00:00:03.500
visible text
`
	vtt, err := VTT(input)
	if err != nil {
		t.Fatalf("VTT: %v", err)
	}
	if strings.Contains(vtt, "comment") {
		t.Fatalf("NOTE block leaked into output: %q", vtt)
	}
	if !strings.Contains(vtt, "visible text") {
		t.Fatalf("cue payload dropped: %q", vtt)
	}
}
