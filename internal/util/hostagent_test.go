package util

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestMapContainerPathToHostDefaultPrefix(t *testing.T) {
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_PREFIX", "")
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_MAP", "")

	cases := []struct {
		name string
		in   string
		want string
	}{
		{"strip /host", "/host/mnt/disk1/a.mp4", "/mnt/disk1/a.mp4"},
		{"strip /host root", "/host", "/"},
		{"strip /host root with slash", "/host/", "/"},
		{"no prefix unchanged", "/data/a.mp4", "/data/a.mp4"},
		{"empty", "", ""},
		{"windows style unchanged", `C:\media\a.mp4`, `C:\media\a.mp4`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := MapContainerPathToHost(tc.in); got != tc.want {
				t.Fatalf("MapContainerPathToHost(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestMapContainerPathToHostCustomPrefix(t *testing.T) {
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_PREFIX", "/mnt/host")
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_MAP", "")

	if got, want := MapContainerPathToHost("/mnt/host/media/a.mp4"), "/media/a.mp4"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
	if got, want := MapContainerPathToHost("/unrelated/a.mp4"), "/unrelated/a.mp4"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestMapContainerPathToHostExplicitMap(t *testing.T) {
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_MAP", `/host/d=D:\media;/host/e=E:\media`)
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_PREFIX", "/host")

	cases := []struct {
		name string
		in   string
		want string
	}{
		{"map d drive", "/host/d/a/b.mp4", `D:\media\a\b.mp4`},
		{"map e drive", "/host/e/x.mp4", `E:\media\x.mp4`},
		{"map root", "/host/d", `D:\media`},
		{"unmapped falls back to strip prefix", "/host/other/x.mp4", "/other/x.mp4"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := MapContainerPathToHost(tc.in); got != tc.want {
				t.Fatalf("MapContainerPathToHost(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestMapContainerPathToHostWindowsHostPrefix(t *testing.T) {
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_PREFIX", "")
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_MAP", `/host/d=D:\media`)
	got := MapContainerPathToHost("/host/d/a.mp4")
	want := filepath.FromSlash(`D:\media\a.mp4`)
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestCallHostAgent(t *testing.T) {
	t.Setenv("JAVBOSS_HOST_AGENT_URL", "")
	t.Setenv("JAVBOSS_HOST_AGENT_TOKEN", "")
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_PREFIX", "/host")

	var receivedPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Path string `json:"path"`
		}
		_ = json.Unmarshal(body, &req)
		receivedPath = req.Path
		if r.URL.Path != "/api/open" {
			http.Error(w, "unexpected path", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer server.Close()
	t.Setenv("JAVBOSS_HOST_AGENT_URL", server.URL)

	handled, err := openViaHostAgent("/host/mnt/a.mp4")
	if err != nil {
		t.Fatalf("openViaHostAgent: %v", err)
	}
	if !handled {
		t.Fatal("expected handled=true")
	}
	if want := "/mnt/a.mp4"; receivedPath != want {
		t.Fatalf("agent received path %q, want %q", receivedPath, want)
	}

	// Without an agent URL, handled=false and ErrHostAgentUnavailable is returned.
	t.Setenv("JAVBOSS_HOST_AGENT_URL", "")
	handled, err = openViaHostAgent("/host/mnt/a.mp4")
	if err != ErrHostAgentUnavailable {
		t.Fatalf("err = %v, want ErrHostAgentUnavailable", err)
	}
	if handled {
		t.Fatal("expected handled=false")
	}
}

func TestCallHostAgentToken(t *testing.T) {
	t.Setenv("JAVBOSS_HOST_AGENT_TOKEN", "secret")
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_PREFIX", "/host")

	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	t.Setenv("JAVBOSS_HOST_AGENT_URL", server.URL)

	if _, err := openViaHostAgent("/host/mnt/a.mp4"); err != nil {
		t.Fatalf("openViaHostAgent: %v", err)
	}
	if want := "Bearer secret"; gotAuth != want {
		t.Fatalf("Authorization = %q, want %q", gotAuth, want)
	}
}

func TestCallHostAgentError(t *testing.T) {
	t.Setenv("JAVBOSS_HOST_AGENT_TOKEN", "")
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_PREFIX", "/host")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer server.Close()
	t.Setenv("JAVBOSS_HOST_AGENT_URL", server.URL)

	handled, err := openViaHostAgent("/host/mnt/a.mp4")
	if !handled {
		t.Fatal("expected handled=true even on agent error")
	}
	if err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("err = %v, want error mentioning boom", err)
	}
}
