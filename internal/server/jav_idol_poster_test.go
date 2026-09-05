package server

import "testing"

func TestIsIdolPosterUploadName(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{name: "upload_0123456789abcdef.jpg", want: true},
		{name: "upload_0123456789abcdef.png", want: true},
		{name: "upload_0123456789abcdef.webp", want: true},
		{name: "upload_0123456789abcdef.jpeg", want: true},
		{name: "upload_0123456789ABCDE.jpg", want: false},
		{name: "upload_0123456789abcde.jpg", want: false},
		{name: "mpv_00-00-12.jpg", want: false},
		{name: "../upload_0123456789abcdef.jpg", want: false},
		{name: "upload_0123456789abcdef.gif", want: false},
	}
	for _, tt := range tests {
		if got := isIdolPosterUploadName(tt.name); got != tt.want {
			t.Fatalf("isIdolPosterUploadName(%q) = %v, want %v", tt.name, got, tt.want)
		}
	}
}
