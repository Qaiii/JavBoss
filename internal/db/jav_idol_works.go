package db

import (
	"context"
	"errors"
	"fmt"
	"sort"
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

// DefaultJavIdolRetryMinutes is how long to wait after a failed works scrape
// before the idol is retried automatically. It is deliberately much shorter
// than the full refresh interval so transient failures (e.g. a provider 403 or
// a flaky network) self-heal quickly instead of waiting for the next full
// refresh window.
const DefaultJavIdolRetryMinutes = 30

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
	Source      int    `json:"source"`
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
	// LastAttemptAt is the time of the most recent scrape attempt (success or
	// failure), taken from the track row's updated_at. It lets callers throttle
	// automatic retries after a failure.
	LastAttemptAt *time.Time `json:"last_attempt_at"`
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

// JavIdolRetryMinutes returns the configured retry delay in minutes after a
// failed works scrape, falling back to DefaultJavIdolRetryMinutes when the
// config key is absent or invalid.
func JavIdolRetryMinutes(ctx context.Context) int {
	cfg, err := ListConfig(ctx)
	if err != nil {
		return DefaultJavIdolRetryMinutes
	}
	return ParsePositiveIntConfig(cfg["jav_idol_retry_minutes"], DefaultJavIdolRetryMinutes)
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
		LastAttemptAt: &track.UpdatedAt,
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
//   - idols whose last attempt failed and happened before `retrySince` — the
//     short retry window, so a failed scrape is retried after the retry delay
//     instead of waiting for the full refresh interval;
//   - idols whose last successful scrape is older than `since`.
//
// `retrySince` is typically now - retryDelay (minutes), and `since` is
// typically now - refreshInterval (days).
func ListIdolsNeedingWorksScrape(ctx context.Context, retrySince, since time.Time) ([]int64, error) {
	var ids []int64
	err := common.DB.WithContext(ctx).
		Table("jav_idol ji").
		Select("ji.id").
		Joins("LEFT JOIN jav_idol_track jit ON jit.jav_idol_id = ji.id").
		Where(`jit.jav_idol_id IS NULL
			OR (jit.last_scraped_at IS NULL AND (jit.updated_at IS NULL OR jit.updated_at < ?))
			OR (jit.last_scraped_at IS NOT NULL AND jit.last_error = '' AND jit.last_scraped_at < ?)`, retrySince, since).
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
			Source:      work.Source,
			SourceURL:   work.SourceURL,
			InLibrary:   work.Code != "" && inLibrary[strings.ToUpper(strings.TrimSpace(work.Code))] != nil,
		})
	}
	return items, total, nil
}

// javExternalEpoch is the "time origin" used when sorting unimported idol
// works by added time (加入时间). Unix epoch keeps them stably at the oldest end.
var javExternalEpoch = time.Unix(0, 0).UTC()

func canIncludeExternalIdolWorks(idolIDs []int64, tagIDs []int64, filters JavSearchFilters) bool {
	if !filters.IncludeExternal || len(idolIDs) != 1 || idolIDs[0] <= 0 {
		return false
	}
	if len(tagIDs) > 0 || filters.SeriesID > 0 || filters.SoloOnly || filters.FavoriteGroupID > 0 {
		return false
	}
	if filters.StudioID >= 0 {
		return false
	}
	if filters.FavoriteRatingMin != nil || filters.FavoriteRatingMax != nil {
		return false
	}
	return true
}

func searchJavIncludingExternal(ctx context.Context, idolIDs []int64, tagIDs []int64, search, prefix, sort string, limit, offset int, seed *int64, directoryIDs []int64, filters JavSearchFilters, closedSubdirs []ClosedSubdirectory, subpaths []DirectorySubpath) ([]models.Jav, int64, error) {
	if limit <= 0 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	if len(idolIDs) == 0 || idolIDs[0] <= 0 {
		return []models.Jav{}, 0, nil
	}

	var library []models.Jav
	if err := buildJavFilter(ctx, idolIDs, tagIDs, search, prefix, directoryIDs, filters, closedSubdirs, subpaths).
		Find(&library).Error; err != nil {
		return nil, 0, fmt.Errorf("list jav for external merge: %w", err)
	}
	switch strings.ToLower(strings.TrimSpace(sort)) {
	case "play_count", "play_count_desc", "play_count_asc":
		if err := attachJavPlayCountsForSort(ctx, library, directoryIDs, closedSubdirs, subpaths); err != nil {
			return nil, 0, err
		}
	}

	works, err := listUnimportedJavIdolWorks(ctx, idolIDs[0], search, prefix)
	if err != nil {
		return nil, 0, err
	}

	merged := make([]models.Jav, 0, len(library)+len(works))
	merged = append(merged, library...)
	inLibraryFalse := false
	for _, work := range works {
		merged = append(merged, javFromUnimportedIdolWork(work, &inLibraryFalse))
	}
	sortMergedJavItems(merged, sort, seed)

	total := int64(len(merged))
	if offset >= len(merged) {
		return []models.Jav{}, total, nil
	}
	end := offset + limit
	if end > len(merged) {
		end = len(merged)
	}
	page := merged[offset:end]
	if err := hydrateMergedJavPage(ctx, page, directoryIDs, closedSubdirs, subpaths); err != nil {
		return nil, 0, err
	}
	return page, total, nil
}

func attachJavPlayCountsForSort(ctx context.Context, items []models.Jav, directoryIDs []int64, closedSubdirs []ClosedSubdirectory, subpaths []DirectorySubpath) error {
	ids := make([]int64, 0, len(items))
	for _, item := range items {
		if item.ID > 0 {
			ids = append(ids, item.ID)
		}
	}
	if len(ids) == 0 {
		return nil
	}

	type row struct {
		JavID     int64 `gorm:"column:jav_id"`
		PlayCount int64 `gorm:"column:play_count"`
	}
	query := common.DB.WithContext(ctx).
		Table("video_location vl").
		Select("vl.jav_id AS jav_id, COALESCE(SUM(COALESCE(v.play_count, 0)), 0) AS play_count").
		Joins("JOIN directory d ON d.id = vl.directory_id").
		Joins("JOIN video v ON v.id = vl.video_id").
		Where("vl.jav_id IN ?", ids).
		Where(activeLocationWhereSQL("vl", "d")).
		Group("vl.jav_id")
	query = applyDirectoryFilter(query, "vl", directoryIDs)
	query = applyClosedSubdirectoryFilter(query, "vl", closedSubdirs)
	query = applyDirectorySubpathFilter(query, "vl", subpaths)

	var rows []row
	if err := query.Scan(&rows).Error; err != nil {
		return fmt.Errorf("load jav play counts: %w", err)
	}
	byID := make(map[int64]int64, len(rows))
	for _, item := range rows {
		byID[item.JavID] = item.PlayCount
	}
	for i := range items {
		if count := byID[items[i].ID]; count > 0 {
			items[i].Videos = []models.Video{{PlayCount: count}}
		}
	}
	return nil
}

func hydrateMergedJavPage(ctx context.Context, page []models.Jav, directoryIDs []int64, closedSubdirs []ClosedSubdirectory, subpaths []DirectorySubpath) error {
	ids := make([]int64, 0, len(page))
	for _, item := range page {
		if item.ID > 0 {
			ids = append(ids, item.ID)
		}
	}
	if len(ids) == 0 {
		return nil
	}

	var hydrated []models.Jav
	if err := common.DB.WithContext(ctx).
		Preload("Studio").
		Preload("Idols").
		Preload("Series").
		Where("id IN ?", ids).
		Find(&hydrated).Error; err != nil {
		return fmt.Errorf("hydrate merged jav page: %w", err)
	}
	if err := attachJavLocationVideos(ctx, hydrated, directoryIDs, closedSubdirs, subpaths); err != nil {
		return err
	}
	if err := attachVisibleJavTags(ctx, hydrated); err != nil {
		return err
	}
	if err := attachJavFavoriteCounts(ctx, hydrated); err != nil {
		return err
	}
	byID := make(map[int64]models.Jav, len(hydrated))
	for _, item := range hydrated {
		byID[item.ID] = item
	}
	for i, item := range page {
		if item.ID <= 0 {
			continue
		}
		if full, ok := byID[item.ID]; ok {
			page[i] = full
		}
	}
	return nil
}

func listUnimportedJavIdolWorks(ctx context.Context, idolID int64, search, prefix string) ([]models.JavIdolWork, error) {
	query := common.DB.WithContext(ctx).Model(&models.JavIdolWork{}).
		Where("jav_idol_id = ?", idolID).
		Where(`NOT EXISTS (
			SELECT 1 FROM jav WHERE UPPER(jav.code) = UPPER(jav_idol_work.code)
		)`).
		Where(`NOT EXISTS (
			SELECT 1 FROM jav_idol_work_dislike d
			WHERE d.jav_idol_id = jav_idol_work.jav_idol_id
				AND UPPER(d.code) = UPPER(jav_idol_work.code)
		)`)
	if search != "" {
		like := fmt.Sprintf("%%%s%%", search)
		query = query.Where("code LIKE ? OR title LIKE ?", like, like)
	}
	if prefix != "" {
		query = query.Where(javCodePrefixSQL("code")+" = ?", prefix)
	}

	var works []models.JavIdolWork
	if err := query.Find(&works).Error; err != nil {
		return nil, fmt.Errorf("list unimported jav idol works: %w", err)
	}
	return works, nil
}

func javFromUnimportedIdolWork(work models.JavIdolWork, inLibrary *bool) models.Jav {
	return models.Jav{
		Code:        work.Code,
		Title:       work.Title,
		ReleaseUnix: work.ReleaseUnix,
		DurationMin: work.DurationMin,
		CreatedAt:   javExternalEpoch,
		InLibrary:   inLibrary,
		CoverURL:    work.CoverURL,
		SourceURL:   work.SourceURL,
	}
}

// DislikeJavIdolWork records that this actress's work should be hidden when it
// is not in the library. Imported works keep showing even if disliked.
func DislikeJavIdolWork(ctx context.Context, idolID int64, code string) error {
	code = strings.ToUpper(strings.TrimSpace(code))
	if idolID <= 0 {
		return errors.New("idol id must be positive")
	}
	if code == "" {
		return errors.New("jav code is required")
	}
	if _, err := GetJavIdolBasic(ctx, idolID); err != nil {
		return err
	}
	record := models.JavIdolWorkDislike{
		JavIdolID: idolID,
		Code:      code,
		CreatedAt: time.Now(),
	}
	if err := common.DB.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&record).Error; err != nil {
		return fmt.Errorf("dislike jav idol work: %w", err)
	}
	return nil
}

func sortMergedJavItems(items []models.Jav, sortKey string, seed *int64) {
	lessCreatedDesc := func(i, j int) bool {
		a, b := items[i], items[j]
		if !a.CreatedAt.Equal(b.CreatedAt) {
			return a.CreatedAt.After(b.CreatedAt)
		}
		return javSortTieID(a) > javSortTieID(b)
	}
	lessCreatedAsc := func(i, j int) bool {
		a, b := items[i], items[j]
		if !a.CreatedAt.Equal(b.CreatedAt) {
			return a.CreatedAt.Before(b.CreatedAt)
		}
		return javSortTieID(a) < javSortTieID(b)
	}

	switch sortKey {
	case "code", "code_asc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := items[i].Code, items[j].Code
			if a != b {
				return a < b
			}
			return javSortTieID(items[i]) < javSortTieID(items[j])
		})
	case "code_desc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := items[i].Code, items[j].Code
			if a != b {
				return a > b
			}
			return javSortTieID(items[i]) > javSortTieID(items[j])
		})
	case "duration", "duration_desc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := items[i], items[j]
			if a.DurationMin != b.DurationMin {
				return a.DurationMin > b.DurationMin
			}
			return lessCreatedDesc(i, j)
		})
	case "duration_asc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := items[i], items[j]
			if a.DurationMin != b.DurationMin {
				return a.DurationMin < b.DurationMin
			}
			return lessCreatedAsc(i, j)
		})
	case "release", "release_desc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := items[i], items[j]
			aMissing, bMissing := a.ReleaseUnix == 0, b.ReleaseUnix == 0
			if aMissing != bMissing {
				return !aMissing && bMissing
			}
			if a.ReleaseUnix != b.ReleaseUnix {
				return a.ReleaseUnix > b.ReleaseUnix
			}
			if a.Code != b.Code {
				return a.Code < b.Code
			}
			return javSortTieID(a) < javSortTieID(b)
		})
	case "release_asc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := items[i], items[j]
			aMissing, bMissing := a.ReleaseUnix == 0, b.ReleaseUnix == 0
			if aMissing != bMissing {
				return !aMissing && bMissing
			}
			if a.ReleaseUnix != b.ReleaseUnix {
				return a.ReleaseUnix < b.ReleaseUnix
			}
			if a.Code != b.Code {
				return a.Code < b.Code
			}
			return javSortTieID(a) < javSortTieID(b)
		})
	case "play_count", "play_count_desc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := javPlayCount(items[i]), javPlayCount(items[j])
			if a != b {
				return a > b
			}
			return lessCreatedDesc(i, j)
		})
	case "play_count_asc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := javPlayCount(items[i]), javPlayCount(items[j])
			if a != b {
				return a < b
			}
			return lessCreatedAsc(i, j)
		})
	case "favorite_rating", "favorite_rating_desc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := items[i], items[j]
			if a.FavoriteRating != b.FavoriteRating {
				return a.FavoriteRating > b.FavoriteRating
			}
			return lessCreatedDesc(i, j)
		})
	case "favorite_rating_asc":
		sort.SliceStable(items, func(i, j int) bool {
			a, b := items[i], items[j]
			aZero, bZero := a.FavoriteRating == 0, b.FavoriteRating == 0
			if aZero != bZero {
				return !aZero && bZero
			}
			if a.FavoriteRating != b.FavoriteRating {
				return a.FavoriteRating < b.FavoriteRating
			}
			return lessCreatedDesc(i, j)
		})
	case "recent_asc":
		sort.SliceStable(items, lessCreatedAsc)
	case "random":
		if seed != nil && *seed > 0 {
			s := *seed
			sort.SliceStable(items, func(i, j int) bool {
				a, b := items[i], items[j]
				ra, rb := stableRandomRankSQL(javRandomRankID(a), s), stableRandomRankSQL(javRandomRankID(b), s)
				if ra != rb {
					return ra < rb
				}
				return javSortTieID(a) < javSortTieID(b)
			})
		} else {
			sort.SliceStable(items, func(i, j int) bool {
				return javSortTieID(items[i]) < javSortTieID(items[j])
			})
		}
	default:
		sort.SliceStable(items, lessCreatedDesc)
	}
}

func javPlayCount(item models.Jav) int64 {
	var total int64
	for _, video := range item.Videos {
		total += video.PlayCount
	}
	return total
}

func javSortTieID(item models.Jav) int64 {
	if item.ID > 0 {
		return item.ID
	}
	return javRandomRankID(item)
}

func javRandomRankID(item models.Jav) int64 {
	if item.ID > 0 {
		return item.ID
	}
	var h int64
	for _, c := range strings.ToUpper(strings.TrimSpace(item.Code)) {
		h = h*31 + int64(c)
	}
	if h == 0 {
		h = -1
	}
	return h
}
