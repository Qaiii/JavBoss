package subtitle

import (
	"bytes"
	"strings"
	"testing"
	"unicode/utf8"

	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/encoding/traditionalchinese"
	"golang.org/x/text/encoding/unicode"
)

func TestDecodeToUTF8Identity(t *testing.T) {
	input := []byte("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n第一行字幕\n")
	got := DecodeToUTF8(input)
	if got != string(input) {
		t.Fatalf("utf-8 identity: got %q", got)
	}
}

func TestDecodeToUTF8StripsBOM(t *testing.T) {
	payload := "1\n00:00:01,000 --> 00:00:02,000\n你好\n"
	input := append(append([]byte{}, utf8BOM...), payload...)
	got := DecodeToUTF8(input)
	if got != payload {
		t.Fatalf("bom not stripped: %q", got)
	}
	if bytes.HasPrefix([]byte(got), utf8BOM) {
		t.Fatal("output still has utf-8 bom")
	}
}

func TestDecodeToUTF8FromGBK(t *testing.T) {
	want := "第一行字幕"
	gbk, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(want))
	if err != nil {
		t.Fatalf("encode gbk: %v", err)
	}
	if utf8.Valid(gbk) {
		t.Fatal("fixture unexpectedly valid utf-8")
	}
	got := DecodeToUTF8(gbk)
	if got != want {
		t.Fatalf("gbk decode: got %q want %q", got, want)
	}
}

func TestDecodeToUTF8FromBig5(t *testing.T) {
	want := "繁體字幕"
	big5, err := traditionalchinese.Big5.NewEncoder().Bytes([]byte(want))
	if err != nil {
		t.Fatalf("encode big5: %v", err)
	}
	got := DecodeToUTF8(big5)
	if got != want {
		t.Fatalf("big5 decode: got %q want %q", got, want)
	}
}

func TestDecodeToUTF8FromShiftJIS(t *testing.T) {
	want := "日本語の字幕"
	sjis, err := japanese.ShiftJIS.NewEncoder().Bytes([]byte(want))
	if err != nil {
		t.Fatalf("encode shiftjis: %v", err)
	}
	got := DecodeToUTF8(sjis)
	if got != want {
		t.Fatalf("shiftjis decode: got %q want %q", got, want)
	}
}

func TestDecodeToUTF8FromUTF16LEBOM(t *testing.T) {
	want := "1\n00:00:01,000 --> 00:00:02,000\n中文字幕\n"
	utf16, err := unicode.UTF16(unicode.LittleEndian, unicode.UseBOM).NewEncoder().Bytes([]byte(want))
	if err != nil {
		t.Fatalf("encode utf16: %v", err)
	}
	got := DecodeToUTF8(utf16)
	if got != want {
		t.Fatalf("utf16-le decode: got %q want %q", got, want)
	}
}

func TestDecodeToUTF8FromUTF16LENoBOM(t *testing.T) {
	want := "hello subtitle line"
	utf16, err := unicode.UTF16(unicode.LittleEndian, unicode.IgnoreBOM).NewEncoder().Bytes([]byte(want))
	if err != nil {
		t.Fatalf("encode utf16: %v", err)
	}
	got := DecodeToUTF8(utf16)
	if got != want {
		t.Fatalf("utf16-le nobom decode: got %q want %q", got, want)
	}
}

func TestDecodeToUTF8FromShiftJISHiragana(t *testing.T) {
	want := "これは字幕です"
	sjis, err := japanese.ShiftJIS.NewEncoder().Bytes([]byte(want))
	if err != nil {
		t.Fatalf("encode shiftjis: %v", err)
	}
	got := DecodeToUTF8(sjis)
	if got != want {
		t.Fatalf("shiftjis hiragana decode: got %q want %q", got, want)
	}
}

func TestDecodeToUTF8GBKThenSRTIsUTF8(t *testing.T) {
	src := "1\n00:00:01,000 --> 00:00:03,000\n第一行字幕\n"
	gbk, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(src))
	if err != nil {
		t.Fatalf("encode gbk: %v", err)
	}
	text := DecodeToUTF8(gbk)
	srt, err := SRT(text)
	if err != nil {
		t.Fatalf("SRT: %v", err)
	}
	if !utf8.ValidString(srt) {
		t.Fatal("converted srt is not utf-8")
	}
	if !strings.Contains(srt, "第一行字幕") {
		t.Fatalf("missing payload: %q", srt)
	}
}

func TestDecodeToUTF8Empty(t *testing.T) {
	if got := DecodeToUTF8(nil); got != "" {
		t.Fatalf("nil: %q", got)
	}
	if got := DecodeToUTF8([]byte{}); got != "" {
		t.Fatalf("empty: %q", got)
	}
}
