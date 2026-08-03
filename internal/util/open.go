package util

import (
	"fmt"
	"javboss/internal/common/logging"
	"os/exec"
)

// OpenFile opens a file with the system default application. When running
// inside a container with a host agent configured, the request is forwarded
// to the agent so the file opens on the host machine.
func OpenFile(path string) error {
	if handled, err := openViaHostAgent(path); handled {
		if err != nil {
			return fmt.Errorf("open file via host agent: %w", err)
		}
		return nil
	}
	if handled, err := openFileDirect(path); handled {
		if err != nil {
			return fmt.Errorf("open file: %w", err)
		}
		return nil
	}
	cmd, err := buildOpenCommand(path, false)
	if err != nil {
		return err
	}
	if err := startCommand(cmd, "open file"); err != nil {
		return fmt.Errorf("open file: %w", err)
	}
	return nil
}

// RevealFile opens the containing folder and highlights the file when supported.
// When running inside a container with a host agent configured, the request is
// forwarded to the agent so the folder opens on the host machine.
func RevealFile(path string) error {
	if handled, err := revealViaHostAgent(path); handled {
		if err != nil {
			return fmt.Errorf("reveal file via host agent: %w", err)
		}
		return nil
	}
	cmd, err := buildOpenCommand(path, true)
	if err != nil {
		return err
	}
	if err := startCommand(cmd, "reveal file"); err != nil {
		return fmt.Errorf("reveal file: %w", err)
	}
	return nil
}

func startCommand(cmd *exec.Cmd, label string) error {
	logging.Info("%s command: %v", label, cmd.Args)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() {
		if err := cmd.Wait(); err != nil {
			logging.Error("%s command exited with error: %v", label, err)
		}
	}()
	return nil
}
