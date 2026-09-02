package subtitle

import (
	"reflect"
	"testing"
)

func TestSubtitleDetailCandidates(t *testing.T) {
	cases := map[string][]string{
		"waaa-366-chinese-subtitle": {"waaa-366-chinese-subtitle", "waaa-366"},
		"waaa-366-uncensored-leak":  {"waaa-366-uncensored-leak", "waaa-366"},
		"ssis-480":                  {"ssis-480"},
		"ssis-480-subtitle":         {"ssis-480-subtitle", "ssis-480"},
		"abc-123-leak":              {"abc-123-leak", "abc-123"},
		"SSIS-480-CENSORED":         {"SSIS-480-CENSORED", "SSIS-480"},
		"":                          {""},
	}
	for input, want := range cases {
		got := subtitleDetailCandidates(input)
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("subtitleDetailCandidates(%q) = %v, want %v", input, got, want)
		}
	}
}

func TestSubtitleDetailCandidatesUnknownShapeUntouched(t *testing.T) {
	// 完全未知形状（无已知后缀）应原样返回，不截断
	input := "waaa-366-custom"
	got := subtitleDetailCandidates(input)
	if !reflect.DeepEqual(got, []string{input}) {
		t.Fatalf("unexpected candidates for %q: %v", input, got)
	}
}
