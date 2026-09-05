package jav

import (
	"strings"
	"testing"
)

func TestCleanMissAVTitle(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		code string
		want string
	}{
		{
			name: "h1 with code prefix",
			raw:  "IPX-228 中年オヤジと制服美少女的汗液唾液濃厚深吻性交 岬奈奈美",
			code: "IPX-228",
			want: "中年オヤジと制服美少女的汗液唾液濃厚深吻性交 岬奈奈美",
		},
		{
			name: "og title with site suffix",
			raw:  "SSIS-001 新人NO.1STYLE 河北彩花 AV Debut | MissAV",
			code: "SSIS-001",
			want: "新人NO.1STYLE 河北彩花 AV Debut",
		},
		{
			name: "lowercase code prefix",
			raw:  "ipx-228 中文字幕标题",
			code: "IPX-228",
			want: "中文字幕标题",
		},
		{
			name: "english only",
			raw:  "IPX-228 Sweaty Kiss",
			code: "IPX-228",
			want: "",
		},
		{
			name: "empty",
			raw:  "",
			code: "IPX-228",
			want: "",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := cleanMissAVTitle(tc.raw, tc.code); got != tc.want {
				t.Fatalf("cleanMissAVTitle(%q, %q) = %q, want %q", tc.raw, tc.code, got, tc.want)
			}
		})
	}
}

func TestParseMissAVChineseTitle(t *testing.T) {
	html := `<!doctype html><html><head>
		<meta property="og:title" content="IPX-228 中年父亲与制服美少女 | MissAV">
		<title>IPX-228 中年父亲与制服美少女 | MissAV</title>
	</head><body>
		<h1 class="text-base lg:text-lg">IPX-228 中年父亲与制服美少女</h1>
	</body></html>`
	doc, err := parseHTMLDocument([]byte(html))
	if err != nil {
		t.Fatalf("parse html: %v", err)
	}
	got := parseMissAVChineseTitle(doc, "IPX-228")
	want := "中年父亲与制服美少女"
	if got != want {
		t.Fatalf("parseMissAVChineseTitle = %q, want %q", got, want)
	}
}

func TestMissAVTitleURLs(t *testing.T) {
	got := missAVTitleURLs("IPX-228")
	if len(got) < 2 {
		t.Fatalf("urls = %#v, want at least 2", got)
	}
	joined := strings.Join(got, " ")
	if !strings.Contains(joined, "https://missav.ws/IPX-228") {
		t.Fatalf("missing uppercase url in %#v", got)
	}
	if !strings.Contains(joined, "https://missav.ws/ipx-228") {
		t.Fatalf("missing lowercase url in %#v", got)
	}
}
