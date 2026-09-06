package jav

import (
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestAVDanyuSearchQueriesPrefersDMMContentID(t *testing.T) {
	got := avdanyuSearchQueries("SSIS-001")
	if len(got) < 2 {
		t.Fatalf("queries = %#v, want at least DMM id and original code", got)
	}
	if got[0] != "ssis00001" {
		t.Fatalf("first query = %q, want ssis00001", got[0])
	}
	if got[1] != "SSIS-001" {
		t.Fatalf("second query = %q, want SSIS-001", got[1])
	}
}

func TestDMMContentID(t *testing.T) {
	tests := []struct {
		code string
		want string
	}{
		{"SSIS-001", "ssis00001"},
		{"MIAE-311", "miae00311"},
		{"EKDV-818", "ekdv00818"},
		{"SSIS-001A", "ssis00001a"},
		{"259LUXU-1234", "259luxu01234"},
	}
	for _, test := range tests {
		if got := dmmContentID(test.code); got != test.want {
			t.Fatalf("dmmContentID(%q) = %q, want %q", test.code, got, test.want)
		}
	}
}

func TestJavCodesMatchDMMAndHyphenated(t *testing.T) {
	if !javCodesMatch("ssis00001", "SSIS-001") {
		t.Fatal("expected ssis00001 to match SSIS-001")
	}
	if !javCodesMatch("1ssis00001", "SSIS-001") {
		t.Fatal("expected prefixed DMM id to match SSIS-001")
	}
	if javCodesMatch("SSIS-002", "SSIS-001") {
		t.Fatal("did not expect SSIS-002 to match SSIS-001")
	}
}

func TestParseAVDanyuWikiMaleActorsByCode(t *testing.T) {
	doc := mustParseAVDanyuHTML(t, `
		<html><body>
			<article class="post">
				<div class="entry-content">
					<p>出演者： 三上悠亜</p>
					<p>出演男優： <a href="https://avdanyuwiki.com/tag/aoi/">藍井優太</a> , <a href="https://avdanyuwiki.com/tag/dai/">ダイ</a></p>
					<p>監督： パールライス坂上</p>
					<p>品番： ssis00001</p>
					<p>メーカー品番： SSIS-001</p>
				</div>
			</article>
			<article class="post">
				<div class="entry-content">
					<p>出演男優： 健太</p>
					<p>品番： ssis00002</p>
				</div>
			</article>
		</body></html>
	`)
	works := parseAVDanyuWikiWorks(doc)
	got := matchAVDanyuMaleActors(works, "SSIS-001")
	want := []string{"藍井優太", "ダイ"}
	if len(got) != len(want) {
		t.Fatalf("actors = %#v, want %#v", got, want)
	}
	for i, name := range want {
		if got[i] != name {
			t.Fatalf("actor[%d] = %q, want %q", i, got[i], name)
		}
	}
}

func TestParseAVDanyuWikiMaleActorsFromPlainText(t *testing.T) {
	doc := mustParseAVDanyuHTML(t, `
		<html><body>
			<article class="hentry">
				<p>出演AV男優 ： 平田司, 松山伸也, 結城結弦</p>
				<p>品番： miae00311</p>
			</article>
		</body></html>
	`)
	got := matchAVDanyuMaleActors(parseAVDanyuWikiWorks(doc), "MIAE-311")
	want := []string{"平田司", "松山伸也", "結城結弦"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("actors = %#v, want %#v", got, want)
	}
}

func TestParseAVDanyuWikiSkipsPlaceholderActors(t *testing.T) {
	doc := mustParseAVDanyuHTML(t, `
		<html><body>
			<article>
				<p>出演男優： —-</p>
				<p>品番： abp00999</p>
			</article>
		</body></html>
	`)
	got := matchAVDanyuMaleActors(parseAVDanyuWikiWorks(doc), "ABP-999")
	if len(got) != 0 {
		t.Fatalf("actors = %#v, want none", got)
	}
}

func mustParseAVDanyuHTML(t *testing.T, raw string) *html.Node {
	t.Helper()
	doc, err := parseHTMLDocument([]byte(raw))
	if err != nil {
		t.Fatalf("parse html: %v", err)
	}
	return doc
}
