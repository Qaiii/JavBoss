package server

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	dbpkg "javboss/internal/db"
)

func queryInt(c *gin.Context, key string, def int) int {
	value := c.Query(key)
	if value == "" {
		return def
	}
	if v, err := strconv.Atoi(value); err == nil {
		return v
	}
	return def
}

func queryFloat(c *gin.Context, key string, def float64) float64 {
	value := c.Query(key)
	if value == "" {
		return def
	}
	if v, err := strconv.ParseFloat(value, 64); err == nil {
		return v
	}
	return def
}

func queryBool(c *gin.Context, key string, def bool) bool {
	value := strings.TrimSpace(strings.ToLower(c.Query(key)))
	if value == "" {
		return def
	}
	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}

// parseClosedSubdirectories parses a "closed_subdirs" query value with the format
// "<directoryId>:<subdirName>,<directoryId>:<subdirName>,...". Names are split on the
// first colon so colons inside a name are preserved.
func parseClosedSubdirectories(s string) []dbpkg.ClosedSubdirectory {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]dbpkg.ClosedSubdirectory, 0, len(parts))
	for _, part := range parts {
		clean := strings.TrimSpace(part)
		if clean == "" {
			continue
		}
		idx := strings.IndexByte(clean, ':')
		if idx <= 0 {
			continue
		}
		id, err := strconv.ParseInt(strings.TrimSpace(clean[:idx]), 10, 64)
		if err != nil || id <= 0 {
			continue
		}
		name := strings.TrimSpace(clean[idx+1:])
		// Name is a relative path (slash-separated) for multi-level subdirectories.
		if name == "" || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") || strings.HasSuffix(name, "/") || strings.Contains(name, "//") {
			continue
		}
		out = append(out, dbpkg.ClosedSubdirectory{DirectoryID: id, Name: name})
	}
	return out
}

// parseDirectorySubpaths parses a "directory_subpaths" query value with the format
// "<directoryId>:<relativePath>,<directoryId>:<relativePath>,...". The relative path
// is slash-separated and must not start/end with a slash or contain backslashes.
func parseDirectorySubpaths(s string) []dbpkg.DirectorySubpath {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]dbpkg.DirectorySubpath, 0, len(parts))
	for _, part := range parts {
		clean := strings.TrimSpace(part)
		if clean == "" {
			continue
		}
		idx := strings.IndexByte(clean, ':')
		if idx <= 0 {
			continue
		}
		id, err := strconv.ParseInt(strings.TrimSpace(clean[:idx]), 10, 64)
		if err != nil || id <= 0 {
			continue
		}
		path := strings.TrimSpace(clean[idx+1:])
		if path == "" || strings.Contains(path, "\\") || strings.HasPrefix(path, "/") || strings.HasSuffix(path, "/") || strings.Contains(path, "//") {
			continue
		}
		out = append(out, dbpkg.DirectorySubpath{DirectoryID: id, Path: path})
	}
	return out
}

func parseTagQuery(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		clean := strings.TrimSpace(part)
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		result = append(result, clean)
	}
	return result
}

func parseCSV(s string) []string {
	parts := strings.Split(s, ",")
	var out []string
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func parseInt64CSV(s string) []int64 {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]int64, 0, len(parts))
	seen := make(map[int64]struct{}, len(parts))
	for _, part := range parts {
		clean := strings.TrimSpace(part)
		if clean == "" {
			continue
		}
		value, err := strconv.ParseInt(clean, 10, 64)
		if err != nil || value <= 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}
