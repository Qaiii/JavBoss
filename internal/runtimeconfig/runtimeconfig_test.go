package runtimeconfig

import (
	"testing"
)

func TestDisableDesktopIntegrationWithHostAgent(t *testing.T) {
	t.Setenv("JAVBOSS_CONTAINER", "1")
	t.Setenv("JAVBOSS_DOCKER", "")
	t.Setenv("JAVBOSS_DISABLE_DESKTOP_INTEGRATION", "")

	// Container without agent: desktop integration disabled.
	t.Setenv("JAVBOSS_HOST_AGENT_URL", "")
	if !DisableDesktopIntegration() {
		t.Fatal("expected desktop integration disabled in container without host agent")
	}

	// Container with host agent: desktop integration stays enabled.
	t.Setenv("JAVBOSS_HOST_AGENT_URL", "http://host.docker.internal:17655")
	if DisableDesktopIntegration() {
		t.Fatal("expected desktop integration enabled when host agent is configured")
	}

	// Explicit disable flag still wins.
	t.Setenv("JAVBOSS_DISABLE_DESKTOP_INTEGRATION", "1")
	if !DisableDesktopIntegration() {
		t.Fatal("expected desktop integration disabled when explicitly disabled")
	}

	// Native (non-container) mode is unaffected.
	t.Setenv("JAVBOSS_CONTAINER", "")
	t.Setenv("JAVBOSS_DISABLE_DESKTOP_INTEGRATION", "")
	if DisableDesktopIntegration() {
		t.Fatal("expected desktop integration enabled in native mode")
	}
}

func TestHostAgentConfig(t *testing.T) {
	t.Setenv("JAVBOSS_HOST_AGENT_URL", " http://host.docker.internal:17655 ")
	if got := HostAgentURL(); got != "http://host.docker.internal:17655" {
		t.Fatalf("HostAgentURL = %q", got)
	}
	if !HostAgentConfigured() {
		t.Fatal("expected HostAgentConfigured true")
	}

	t.Setenv("JAVBOSS_HOST_AGENT_PATH_PREFIX", "/mnt/host/")
	if got := HostAgentPathPrefix(); got != "/mnt/host" {
		t.Fatalf("HostAgentPathPrefix = %q", got)
	}
	t.Setenv("JAVBOSS_HOST_AGENT_PATH_PREFIX", "")
	if got := HostAgentPathPrefix(); got != "/host" {
		t.Fatalf("default HostAgentPathPrefix = %q", got)
	}

	t.Setenv("JAVBOSS_HOST_AGENT_TOKEN", "  secret  ")
	if got := HostAgentToken(); got != "secret" {
		t.Fatalf("HostAgentToken = %q", got)
	}
}

func TestContainerMode(t *testing.T) {
	t.Setenv("JAVBOSS_CONTAINER", "")
	t.Setenv("JAVBOSS_DOCKER", "1")
	if !ContainerMode() {
		t.Fatal("expected JAVBOSS_DOCKER=1 to enable container mode")
	}
	t.Setenv("JAVBOSS_DOCKER", "")
	t.Setenv("JAVBOSS_CONTAINER", "0")
	if ContainerMode() {
		t.Fatal("expected JAVBOSS_CONTAINER=0 to disable container mode")
	}
}
