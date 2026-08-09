package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"javboss/internal/common"
	"javboss/internal/models"
)

// DefaultJavIdolRefreshDays is the interval (in days) between automatic
// refreshes of a tracked idol's works when no config override is present.
const DefaultJavIdolRefreshDays = 7

// GetJavIdolBasic returns the core name fields of an idol regardless of
// whether she has any visible works, for background works scraping.
func GetJavIdolBasic(ctx context.Context, idolID int64) (*models.JavIdol, error) {
	var idol models.JavIdol
	if err := common.DB.WithContext(ctx).Where("id = ?", idolID).First(&idol).Error; err != nil {
		return nil, fmt.Errorf("get jav idol basic: %w", err)
	}
	return &idol, nil
}

// FindJavIdolsByNames returns the ids of library idols matching any of the
// given names, either by exact name or by alias. Names that match nothing are
// ignored (no idols are created).
func FindJavIdolsByNames(ctx context.Context, names []string) ([]int64, error) {
	clean := make([]string, 0, len(names))
	seen := make(map[string]struct{}, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		clean = append(clean, name)
	}
	if len(clean) == 0 {
		return []int64{}, nil
	}

	var direct []int64
	if err := common.DB.WithContext(ctx).
		Model(&models.JavIdol{}).
		Where("name IN ?", clean).
		Pluck("id", &direct).Error; err != nil {
		return nil, fmt.Errorf("find jav idols by names: %w", err)
	}

	var viaAlias []int64
	if err := common.DB.WithContext(ctx).
		Model(&models.JavIdolAlias{}).
		Where("alias IN ?", clean).
		Pluck("jav_idol_id", &viaAlias).Error; err != nil {
		return nil, fmt.Errorf("find jav idols by alias: %w", err)
	}

	ids := make([]int64, 0, len(direct)+len(viaAlias))
	unique := make(map[int64]struct{}, len(direct)+len(viaAlias))
	for _, id := range append(direct, viaAlias...) {
		if id <= 0 {
			continue
		}
		if _, ok := unique[id]; ok {
			continue
		}
		unique[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids, nil
}

// JavIdolWorksSummary is one paginated row of an idol's scraped works with a
// transient in-library flag resolved at read time.
type JavIdolWorksSummary struct {
	Code        string `json:"code"`
	Title       string `json:"title"`
	CoverURL    string `json:"cover_url"`
	ReleaseUnix int64  `json:"release_unix"`
	DurationMin int    `json:"duration_min"`
	SourceURL   string `json:"source_url"`
	InLibrary   bool   `json:"in_library"`
}

// JavIdolTrackState describes the tracking/scrape state of one idol.
type JavIdolTrackState struct {
	Tracked       bool       `json:"tracked"`
	JavdbURL      string     `json:"javdb_url"`
	LastScrapedAt *time.Time `json:"last_scraped_at"`
	WorksCount    int        `json:"works_count"`
	LastError     string     `json:"last_error"`
}

// JavIdolRefreshDays returns the configured refresh interval in days, falling
// back to DefaultJavIdolRefreshDays when the config key is absent or invalid.
func JavIdolRefreshDays(ctx context.Context) int {
	cfg, err := ListConfig(ctx)
	if err != nil {
		return DefaultJavIdolRefreshDays
	}
	return ParsePositiveIntConfig(cfg["jav_idol_refresh_days"], DefaultJavIdolRefreshDays)
}

// ParsePositiveIntConfig parses an integer config value, returning fallback
// when the value is missing or not a positive integer.
func ParsePositiveIntConfig(raw string, fallback int) int {
	value := 0
	if _, err := fmt.Sscanf(strings.TrimSpace(raw), "%d", &value); err != nil || value <= 0 {
		return fallback
	}
	return value
}

// GetJavIdolTrack returns the track state of an idol, with Tracked=false when
// the idol is not in the track table.
func GetJavIdolTrack(ctx context.Context, idolID int64) (JavIdolTrackState, error) {
	var track models.JavIdolTrack
	err := common.DB.WithContext(ctx).Where("jav_idol_id = ?", idolID).First(&track).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return JavIdolTrackState{}, nil
	}
	if err != nil {
		return JavIdolTrackState{}, fmt.Errorf("get jav idol track: %w", err)
	}
	return JavIdolTrackState{
		Tracked:       true,
		JavdbURL:      track.JavdbURL,
		LastScrapedAt: track.LastScrapedAt,
		WorksCount:    track.WorksCount,
		LastError:     track.LastError,
	}, nil
}

// UpsertJavIdolTrack inserts or updates the track row for an idol. The row is
// created when absent; otherwise only the provided fields plus updated_at are
// refreshed. created_at is never overwritten.
func UpsertJavIdolTrack(ctx context.Context, idolID int64, fields map[string]any) error {
	now := time.Now()
	record := map[string]any{"jav_idol_id": idolID, "created_at": now, "updated_at": now}
	for key, value := range fields {
		record[key] = value
	}

	updateColumns := make([]string, 0, len(record))
	for key := range record {
		if key == "jav_idol_id" || key == "created_at" {
			continue
		}
		updateColumns = append(updateColumns, key)
	}
	updateColumns = append(updateColumns, "updated_at")

	return common.DB.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "jav_idol_id"}},
			DoUpdates: clause.AssignmentColumns(updateColumns),
		}).
		Model(&models.JavIdolTrack{}).
		Create(record).Error
}

// MarkJavIdolTrackScraped records a completed scrape for an idol: the JavDB
// URL, the scrape time and the resulting works count, clearing any prior error.
func MarkJavIdolTrackScraped(ctx context.Context, idolID int64, javdbURL string, worksCount int, now time.Time) error {
	return UpsertJavIdolTrack(ctx, idolID, map[string]any{
		"javdb_url":       javdbURL,
		"last_scraped_at": now,
		"works_count":     worksCount,
		"last_error":      "",
	})
}

// MarkJavIdolTrackError records a failed scrape attempt on the track row.
func MarkJavIdolTrackError(ctx context.Context, idolID int64, scrapeErr error) error {
	message := ""
	if scrapeErr != nil {
		message = scrapeErr.Error()
	}
	return UpsertJavIdolTrack(ctx, idolID, map[string]any{"last_error": message})
}

// RemoveJavIdolTrack deletes the track row for an idol, stopping future
// refreshes. Stored works remain.
func RemoveJavIdolTrack(ctx context.Context, idolID int64) error {
	if err := common.DB.WithContext(ctx).Delete(&models.JavIdolTrack{}, "jav_idol_id = ?", idolID).Error; err != nil {
		return fmt.Errorf("remove jav idol track: %w", err)
	}
	return nil
}

// ListIdolsNeedingWorksScrape returns ids of idols that should be queued for a
// JavDB works scrape:
//   - idols never attempted at all (including ones imported by older versions
//     that predate the works queue);
//   - idols whose last attempt failed and happened before `since` (failed
//     attempts are retried, but not more often than the refresh interval);
//   - idols whose last successful scrape is older than `since`.
//
// `since` is typically now - refreshInterval.
func ListIdolsNeedingWorksScrape(ctx context.Context, since time.Time) ([]int64, error) {
	var ids []int64
	err := common.DB.WithContext(ctx).
		Table("jav_idol ji").
		Select("ji.id").
		Joins("LEFT JOIN jav_idol_track jit ON jit.jav_idol_id = ji.id").
		Where(`jit.jav_idol_id IS NULL
			OR (jit.last_scraped_at IS NULL AND (jit.updated_at IS NULL OR jit.updated_at < ?))
			OR jit.last_scraped_at < ?`, since, since).
		Order("ji.id ASC").
		Pluck("ji.id", &ids).Error
	if err != nil {
		return nil, fmt.Errorf("list idols needing works scrape: %w", err)
	}
	return ids, nil
}

// ReplaceJavIdolWorks stores a full scrape result for an idol: it deletes the
// previously stored works and inserts the new set in one transaction.
func ReplaceJavIdolWorks(ctx context.Context, idolID int64, works []models.JavIdolWork) error {
	return common.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("jav_idol_id = ?", idolID).Delete(&models.JavIdolWork{}).Error; err != nil {
			return fmt.Errorf("clear jav idol works: %w", err)
		}
		if len(works) > 0 {
			if err := tx.Create(&works).Error; err != nil {
				return fmt.Errorf("insert jav idol works: %w", err)
			}
		}
		return nil
	})
}

// ListJavIdolWorks returns one page of an idol's scraped works, ordered by
// release date descending (newest first). total is the full count.
func ListJavIdolWorks(ctx context.Context, idolID int64, limit, offset int) ([]JavIdolWorksSummary, int64, error) {
	if limit <= 0 {
		limit = 24
	}
	if offset < 0 {
		offset = 0
	}

	query := common.DB.WithContext(ctx).Model(&models.JavIdolWork{}).Where("jav_idol_id = ?", idolID)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count jav idol works: %w", err)
	}

	var works []models.JavIdolWork
	if err := query.Order("release_unix DESC, id DESC").Limit(limit).Offset(offset).Find(&works).Error; err != nil {
		return nil, 0, fmt.Errorf("list jav idol works: %w", err)
	}

	codes := make([]string, 0, len(works))
	for _, work := range works {
		codes = append(codes, work.Code)
	}
	inLibrary, err := GetJavsByCodes(ctx, codes)
	if err != nil {
		return nil, 0, err
	}

	items := make([]JavIdolWorksSummary, 0, len(works))
	for _, work := range works {
		items = append(items, JavIdolWorksSummary{
			Code:        work.Code,
			Title:       work.Title,
			CoverURL:    work.CoverURL,
			ReleaseUnix: work.ReleaseUnix,
			DurationMin: work.DurationMin,
			SourceURL:   work.SourceURL,
			InLibrary:   work.Code != "" && inLibrary[strings.ToUpper(strings.TrimSpace(work.Code))] != nil,
		})
	}
	return items, total, nil
}
