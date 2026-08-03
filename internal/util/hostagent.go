package util

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"javboss/internal/common/logging"
	"javboss/internal/runtimeconfig"
)

// hostAgentTimeout bounds how long a single agent call may take. Opening a
// file on the host is normally instant, but the host might be unreachable.
const hostAgentTimeout = 5 * time.Second

var (
	// ErrHostAgentUnavailable is returned when no host agent is configured.
	ErrHostAgentUnavailable = errors.New("host agent not configured")

	hostAgentHTTPClient = &http.Client{
		Timeout: hostAgentTimeout,
		Transport: &http.Transport{
			Proxy: nil, // never route agent traffic through a proxy
		},
	}
)

// MapContainerPathToHost converts a container-side path to the host path that
// the host agent should open. Explicit mappings from JAVBOSS_HOST_AGENT_PATH_MAP
// (entries "containerPrefix=hostPrefix" separated by ';') are applied first;
// otherwise the JAVBOSS_HOST_AGENT_PATH_PREFIX (default /host) is stripped.
func MapContainerPathToHost(p string) string {
	raw := strings.TrimSpace(p)
	if raw == "" {
		return raw
	}
	for _, entry := range strings.Split(runtimeconfig.HostAgentPathMap(), ";") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		containerPrefix, hostPrefix, ok := strings.Cut(entry, "=")
		if !ok {
			continue
		}
		containerPrefix = strings.TrimRight(strings.TrimSpace(containerPrefix), "/")
		hostPrefix = strings.TrimSpace(hostPrefix)
		if containerPrefix == "" || hostPrefix == "" {
			continue
		}
		if raw == containerPrefix {
			return hostPrefix
		}
		if strings.HasPrefix(raw, containerPrefix+"/") {
			rest := raw[len(containerPrefix):]
			if strings.Contains(hostPrefix, "\\") {
				rest = filepath.FromSlash(rest)
			}
			return hostPrefix + rest
		}
	}
	prefix := runtimeconfig.HostAgentPathPrefix()
	if prefix == "" {
		return raw
	}
	if raw == prefix {
		return "/"
	}
	if strings.HasPrefix(raw, prefix+"/") {
		return raw[len(prefix):]
	}
	return raw
}

// openViaHostAgent asks the host-side agent to open the file with the host's
// default application. It reports handled=false when no agent is configured,
// so callers can fall back to opening the file locally.
func openViaHostAgent(containerPath string) (bool, error) {
	return callHostAgent("open", containerPath)
}

// revealViaHostAgent asks the host-side agent to reveal the file in its
// containing folder on the host.
func revealViaHostAgent(containerPath string) (bool, error) {
	return callHostAgent("reveal", containerPath)
}

func callHostAgent(action, containerPath string) (bool, error) {
	baseURL := runtimeconfig.HostAgentURL()
	if baseURL == "" {
		return false, ErrHostAgentUnavailable
	}
	base, err := url.Parse(baseURL)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return true, fmt.Errorf("invalid host agent URL %q: %w", baseURL, err)
	}
	hostPath := MapContainerPathToHost(containerPath)
	body, err := json.Marshal(map[string]string{"path": hostPath})
	if err != nil {
		return true, fmt.Errorf("encode host agent request: %w", err)
	}
	endpoint := *base
	endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/api/" + action
	req, err := http.NewRequest(http.MethodPost, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return true, fmt.Errorf("build host agent request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token := runtimeconfig.HostAgentToken(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	logging.Info("host agent %s: container path %q -> host path %q", action, containerPath, hostPath)
	resp, err := hostAgentHTTPClient.Do(req)
	if err != nil {
		return true, fmt.Errorf("host agent %s: %w", action, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusOK {
		detail := strings.TrimSpace(string(respBody))
		if detail == "" {
			detail = resp.Status
		}
		return true, fmt.Errorf("host agent %s failed: %s", action, detail)
	}
	return true, nil
}
