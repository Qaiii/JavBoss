package server

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestNextAvailablePath(t *testing.T) {
	dir := t.TempDir()

	// 目标不存在：直接用原名
	first := filepath.Join(dir, "SSIS-480.srt")
	got, err := nextAvailablePath(first)
	if err != nil {
		t.Fatalf("nextAvailablePath: %v", err)
	}
	if got != first {
		t.Fatalf("expected %q, got %q", first, got)
	}

	// 目标已存在：递增后缀，且绝不返回已存在的路径
	if err := os.WriteFile(first, []byte("existing"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	for i, want := range []string{
		"SSIS-480-2.srt",
		"SSIS-480-3.srt",
		"SSIS-480-4.srt",
	} {
		got, err := nextAvailablePath(first)
		if err != nil {
			t.Fatalf("nextAvailablePath: %v", err)
		}
		wantPath := filepath.Join(dir, want)
		if got != wantPath {
			t.Fatalf("round %d: expected %q, got %q", i, wantPath, got)
		}
		// 写入占位，模拟下一次保存
		if err := os.WriteFile(got, []byte("x"), 0o644); err != nil {
			t.Fatalf("write placeholder: %v", err)
		}
	}

	// 带扩展名的多级场景：目录名不影响
	subdir := filepath.Join(dir, "nested")
	if err := os.MkdirAll(subdir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	nested := filepath.Join(subdir, "ABC-123.vtt")
	got, err = nextAvailablePath(nested)
	if err != nil {
		t.Fatalf("nextAvailablePath nested: %v", err)
	}
	if got != nested {
		t.Fatalf("nested: expected %q, got %q", nested, got)
	}
}

func TestNextAvailablePathPreservesExistingContent(t *testing.T) {
	dir := t.TempDir()
	existing := filepath.Join(dir, "SSIS-480.srt")
	if err := os.WriteFile(existing, []byte("我的本地字幕"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := nextAvailablePath(existing)
	if err != nil {
		t.Fatalf("nextAvailablePath: %v", err)
	}
	if got == existing {
		t.Fatalf("must not return the existing path")
	}
	// 原有内容必须原封不动
	data, err := os.ReadFile(existing)
	if err != nil {
		t.Fatalf("read existing: %v", err)
	}
	if string(data) != "我的本地字幕" {
		t.Fatalf("existing file was modified: %q", string(data))
	}
}

func TestIsUnwritableError(t *testing.T) {
	if isUnwritableError(nil) {
		t.Fatal("nil should not be unwritable")
	}
	if !isUnwritableError(os.ErrPermission) {
		t.Fatal("os.ErrPermission")
	}
	if !isUnwritableError(errors.New("open x: read-only file system")) {
		t.Fatal("EROFS text")
	}
	if !isUnwritableError(errors.New("write subtitle: open x: erofs: mkdir y: permission denied")) {
		t.Fatal("wrapped EROFS")
	}
	if isUnwritableError(errors.New("no space left on device")) {
		t.Fatal("disk full is not classified as read-only")
	}
}

func TestSubtitleFileStem(t *testing.T) {
	cases := map[string]string{
		"SSIS-480":       "SSIS-480",
		`foo/bar`:        "bar",
		`bad:name*?.srt`: "bad_name__.srt",
		"   ":            "subtitle",
		".":              "subtitle",
	}
	for input, want := range cases {
		got := subtitleFileStem(input)
		if got != want {
			t.Fatalf("subtitleFileStem(%q) = %q, want %q", input, got, want)
		}
	}
}
