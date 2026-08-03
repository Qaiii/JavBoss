package runtimeconfig

import (
	"os"
	"strings"
)

func envBool(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// ContainerMode reports whether JavBoss is running in a container-oriented mode.
func ContainerMode() bool {
	return envBool("JAVBOSS_CONTAINER") || envBool("JAVBOSS_DOCKER")
}

func DisableDirectoryPicker() bool {
	return ContainerMode() || envBool("JAVBOSS_DISABLE_DIRECTORY_PICKER")
}

// HostAgentURL returns the base URL of a host-side agent (e.g.
// http://host.docker.internal:17655) that opens files on the host machine.
// When set while running inside a container, desktop integration is kept
// enabled and file-open requests are forwarded to that agent.
func HostAgentURL() string {
	return strings.TrimSpace(os.Getenv("JAVBOSS_HOST_AGENT_URL"))
}

// HostAgentToken returns the shared token used to authenticate requests to
// the host-side agent. Empty means the agent does not require a token.
func HostAgentToken() string {
	return strings.TrimSpace(os.Getenv("JAVBOSS_HOST_AGENT_TOKEN"))
}

// HostAgentPathPrefix returns the container-side mount prefix that maps to
// the host filesystem root. The prefix is stripped from container paths
// before they are sent to the host agent. Defaults to /host.
func HostAgentPathPrefix() string {
	prefix := strings.TrimSpace(os.Getenv("JAVBOSS_HOST_AGENT_PATH_PREFIX"))
	if prefix == "" {
		return "/host"
	}
	return strings.TrimRight(prefix, "/")
}

// HostAgentPathMap returns explicit container-prefix to host-prefix mappings
// ("containerPrefix=hostPrefix" entries separated by ';'). These are applied
// before the generic HostAgentPathPrefix fallback.
func HostAgentPathMap() string {
	return strings.TrimSpace(os.Getenv("JAVBOSS_HOST_AGENT_PATH_MAP"))
}

// HostAgentConfigured reports whether a host-side agent is available to open
// files on the host machine.
func HostAgentConfigured() bool {
	return HostAgentURL() != ""
}

func DisableDesktopIntegration() bool {
	if envBool("JAVBOSS_DISABLE_DESKTOP_INTEGRATION") {
		return true
	}
	return ContainerMode() && !HostAgentConfigured()
}

func DisableMPVPlayback() bool {
	return ContainerMode() || envBool("JAVBOSS_DISABLE_MPV")
}

func UseFFmpegScreenshots() bool {
	return ContainerMode() || envBool("JAVBOSS_USE_FFMPEG_SCREENSHOTS")
}

func HostPathPrefixEnabled() bool {
	return envBool("JAVBOSS_HOST_PATH_PREFIX")
}

func ProxyHostGatewayEnabled() bool {
	return envBool("JAVBOSS_PROXY_HOST_GATEWAY")
}
