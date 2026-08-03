// Command hostagent runs a tiny HTTP service on the host machine that opens
// files with the host's default applications. It is used by JavBoss instances
// running inside Docker containers: the container forwards "open with system
// player" and "reveal in folder" requests to this agent via
// host.docker.internal, and the agent executes them on the host.
//
// Configuration:
//
//	JAVBOSS_AGENT_HOST  listen address (default 0.0.0.0)
//	JAVBOSS_AGENT_PORT  listen port (default 17655)
//	JAVBOSS_AGENT_TOKEN shared bearer token; when empty, no auth is required
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"javboss/internal/common/logging"
	"javboss/internal/util"
)

const defaultPort = "17655"

type openRequest struct {
	Path string `json:"path"`
}

func main() {
	host := envOr("JAVBOSS_AGENT_HOST", "0.0.0.0")
	port := envOr("JAVBOSS_AGENT_PORT", defaultPort)
	token := strings.TrimSpace(os.Getenv("JAVBOSS_AGENT_TOKEN"))

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("POST /api/open", handleOpen)
	mux.HandleFunc("POST /api/reveal", handleReveal)

	handler := withAuth(token, mux)
	addr := net.JoinHostPort(host, port)
	server := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("javboss-host-agent listening on http://%s (auth: %v)", addr, token != "")
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("javboss-host-agent: %v", err)
	}
}

func envOr(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func withAuth(token string, next http.Handler) http.Handler {
	if token == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		expected := "Bearer " + token
		if !constantTimeEqual(auth, expected) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func constantTimeEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := 0; i < len(a); i++ {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleOpen(w http.ResponseWriter, r *http.Request) {
	handleFileAction(w, r, "open", util.OpenFile)
}

func handleReveal(w http.ResponseWriter, r *http.Request) {
	handleFileAction(w, r, "reveal", util.RevealFile)
}

func handleFileAction(w http.ResponseWriter, r *http.Request, action string, fn func(string) error) {
	req, err := decodeOpenRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := fn(req.Path); err != nil {
		logging.Error("host agent %s %q: %v", action, req.Path, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	logging.Info("host agent %s %q", action, req.Path)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func decodeOpenRequest(r *http.Request) (*openRequest, error) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 16*1024))
	if err != nil {
		return nil, fmt.Errorf("read request body: %w", err)
	}
	var req openRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return nil, fmt.Errorf("invalid JSON body: %w", err)
	}
	if strings.TrimSpace(req.Path) == "" {
		return nil, errors.New("path is required")
	}
	return &req, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
