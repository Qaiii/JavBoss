package subtitle

import (
	"bytes"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/saintfish/chardet"
	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/encoding/traditionalchinese"
	textunicode "golang.org/x/text/encoding/unicode"
)

var (
	utf8BOM    = []byte{0xEF, 0xBB, 0xBF}
	utf16LEBOM = []byte{0xFF, 0xFE}
	utf16BEBOM = []byte{0xFE, 0xFF}

	textDetector = chardet.NewTextDetector()
)

// DecodeToUTF8 converts subtitle bytes to a UTF-8 string. UTF-8 (with or
// without BOM) is kept; UTF-16 and common East-Asian encodings used by JAV
// .srt files (GBK/GB18030, Big5, Shift-JIS, EUC-KR) are transcoded.
func DecodeToUTF8(data []byte) string {
	return string(DecodeToUTF8Bytes(data))
}

// DecodeToUTF8Bytes is the byte form of DecodeToUTF8. The result never
// includes a UTF-8 BOM.
func DecodeToUTF8Bytes(data []byte) []byte {
	if len(data) == 0 {
		return data
	}
	if decoded, ok := decodeByBOM(data); ok {
		return decoded
	}
	if decoded, ok := decodeUTF16Heuristic(data); ok {
		return decoded
	}
	if utf8.Valid(data) {
		return data
	}
	if decoded, ok := decodeBestLegacy(data); ok {
		return decoded
	}
	// Last resort: interpret as UTF-8 with replacement so callers still get a string.
	return bytes.ToValidUTF8(data, []byte("\uFFFD"))
}

func decodeByBOM(data []byte) ([]byte, bool) {
	switch {
	case bytes.HasPrefix(data, utf8BOM):
		rest := data[len(utf8BOM):]
		if utf8.Valid(rest) {
			return rest, true
		}
		return bytes.ToValidUTF8(rest, []byte("\uFFFD")), true
	case bytes.HasPrefix(data, utf16LEBOM):
		out, err := decodeUTF16(data[len(utf16LEBOM):], textunicode.LittleEndian)
		return out, err == nil
	case bytes.HasPrefix(data, utf16BEBOM):
		out, err := decodeUTF16(data[len(utf16BEBOM):], textunicode.BigEndian)
		return out, err == nil
	}
	return nil, false
}

func decodeUTF16(data []byte, endian textunicode.Endianness) ([]byte, error) {
	dec := textunicode.UTF16(endian, textunicode.IgnoreBOM).NewDecoder()
	return dec.Bytes(data)
}

// decodeUTF16Heuristic catches Windows-exported UTF-16 files that omit a BOM.
func decodeUTF16Heuristic(data []byte) ([]byte, bool) {
	if len(data) < 4 || len(data)%2 != 0 {
		return nil, false
	}
	var evenNul, oddNul int
	for i := 0; i+1 < len(data); i += 2 {
		if data[i] == 0 {
			evenNul++
		}
		if data[i+1] == 0 {
			oddNul++
		}
	}
	pairs := len(data) / 2
	// Real UTF-16 LE English/CJK text has NULs on the high byte (odd index).
	if oddNul*100/pairs >= 30 {
		out, err := decodeUTF16(data, textunicode.LittleEndian)
		if err == nil && utf8.Valid(out) && !bytes.ContainsRune(out, '\uFFFD') {
			return out, true
		}
	}
	if evenNul*100/pairs >= 30 {
		out, err := decodeUTF16(data, textunicode.BigEndian)
		if err == nil && utf8.Valid(out) && !bytes.ContainsRune(out, '\uFFFD') {
			return out, true
		}
	}
	return nil, false
}

func decodeDetectedCharset(data []byte) string {
	result, err := textDetector.DetectBest(data)
	if err != nil || result == nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(result.Charset))
}

func charsetMatches(detected, candidate string) bool {
	switch candidate {
	case "gb18030", "gbk":
		return detected == "gb-18030" || detected == "gb18030" || detected == "gbk" || detected == "gb2312"
	case "big5":
		return detected == "big5"
	case "shiftjis":
		return detected == "shift_jis" || detected == "shift-jis" || detected == "sjis"
	case "eucjp":
		return detected == "euc-jp"
	case "euckr":
		return detected == "euc-kr"
	default:
		return false
	}
}

type legacyEncoding struct {
	name string
	enc  encoding.Encoding
}

var legacyEncodings = []legacyEncoding{
	{"gb18030", simplifiedchinese.GB18030},
	{"gbk", simplifiedchinese.GBK},
	{"big5", traditionalchinese.Big5},
	{"shiftjis", japanese.ShiftJIS},
	{"eucjp", japanese.EUCJP},
	{"euckr", korean.EUCKR},
}

func decodeBestLegacy(data []byte) ([]byte, bool) {
	detected := decodeDetectedCharset(data)
	bestScore := -1 << 30
	var best []byte
	for _, candidate := range legacyEncodings {
		if !validLegacyBytes(candidate.name, data) {
			continue
		}
		out, err := candidate.enc.NewDecoder().Bytes(data)
		if err != nil || len(out) == 0 || !utf8.Valid(out) || bytes.ContainsRune(out, '\uFFFD') {
			continue
		}
		score := scoreDecodedFor(candidate.name, out)
		if charsetMatches(detected, candidate.name) {
			score += 5
		}
		if score > bestScore {
			bestScore = score
			best = out
		}
	}
	if best == nil || bestScore < 0 {
		return nil, false
	}
	return best, true
}

func validLegacyBytes(name string, data []byte) bool {
	switch name {
	case "gb18030", "gbk":
		return validLeadTrail(data, isGBLead, isGBTrail)
	case "big5":
		return validLeadTrail(data, isBig5Lead, isBig5Trail)
	case "shiftjis":
		return validLeadTrail(data, isSJISLead, isSJISTrail)
	case "eucjp", "euckr":
		return validLeadTrail(data, isEUCLead, isEUCTrail)
	default:
		return true
	}
}

func validLeadTrail(data []byte, isLead, isTrail func(byte) bool) bool {
	for i := 0; i < len(data); {
		b := data[i]
		if b < 0x80 {
			i++
			continue
		}
		if i+1 >= len(data) || !isLead(b) || !isTrail(data[i+1]) {
			return false
		}
		i += 2
	}
	return true
}

func isGBLead(b byte) bool  { return b >= 0x81 && b <= 0xFE }
func isGBTrail(b byte) bool { return b >= 0x40 && b <= 0xFE && b != 0x7F }

func isBig5Lead(b byte) bool  { return b >= 0x81 && b <= 0xFE }
func isBig5Trail(b byte) bool { return (b >= 0x40 && b <= 0x7E) || (b >= 0xA1 && b <= 0xFE) }

func isSJISLead(b byte) bool  { return (b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xFC) }
func isSJISTrail(b byte) bool { return (b >= 0x40 && b <= 0x7E) || (b >= 0x80 && b <= 0xFC) }

func isEUCLead(b byte) bool  { return b >= 0xA1 && b <= 0xFE }
func isEUCTrail(b byte) bool { return b >= 0xA1 && b <= 0xFE }

func scoreDecodedFor(name string, data []byte) int {
	var han, hira, kana, hangul, half, repl, ctrl int
	for _, r := range string(data) {
		switch {
		case r == '\uFFFD':
			repl++
		case r != '\n' && r != '\r' && r != '\t' && unicode.IsControl(r):
			ctrl++
		case unicode.Is(unicode.Han, r):
			han++
		case unicode.Is(unicode.Hiragana, r):
			hira++
		case r >= 0x30A0 && r <= 0x30FF:
			kana++
		case unicode.Is(unicode.Hangul, r):
			hangul++
		case r >= 0xFF61 && r <= 0xFF9F:
			half++
		}
	}
	score := -repl*100 - ctrl*50
	switch name {
	case "gb18030", "gbk", "big5":
		return score + han*3 - hangul*6 - hira*6 - half*8
	case "shiftjis", "eucjp":
		return score + hira*8 + kana*6 + han*2 - hangul*6 - half*2
	case "euckr":
		if hangul == 0 || hangul < han {
			return -1 << 30
		}
		return score + hangul*8 + han
	default:
		return score
	}
}
