package db

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"javboss/internal/common"
	"javboss/internal/models"

	"gorm.io/gorm"
)

var errUnusedScrapedDataPreview = errors.New("unused scraped data preview rollback")

// UnusedScrapedDataCounts reports scraped metadata that no API list or detail
// field still references. Video files and video rows are never included.
type UnusedScrapedDataCounts struct {
	Javs        int `json:"javs"`
	ScrapedTags int `json:"scraped_tags"`
	Idols       int `json:"idols"`
	Studios     int `json:"studios"`
	Series      int `json:"series"`
}

func orphanJavQuery(tx *gorm.DB) *gorm.DB {
	return tx.Model(&models.Jav{}).
		Where("NOT EXISTS (SELECT 1 FROM video_location WHERE video_location.jav_id = jav.id)")
}

func unusedScrapedTagQuery(tx *gorm.DB) *gorm.DB {
	return tx.Model(&models.JavTag{}).
		Where("COALESCE(is_user, 0) = 0").
		Where("NOT EXISTS (SELECT 1 FROM jav_tag_map WHERE jav_tag_map.jav_tag_id = jav_tag.id)")
}

func unusedIdolQuery(tx *gorm.DB) *gorm.DB {
	return tx.Model(&models.JavIdol{}).
		Where("NOT EXISTS (SELECT 1 FROM jav_idol_map WHERE jav_idol_map.jav_idol_id = jav_idol.id)").
		Where("NOT EXISTS (SELECT 1 FROM jav_idol_track WHERE jav_idol_track.jav_idol_id = jav_idol.id)").
		Where("NOT EXISTS (SELECT 1 FROM jav_idol_work WHERE jav_idol_work.jav_idol_id = jav_idol.id)").
		Where("NOT EXISTS (SELECT 1 FROM jav_favorite_map WHERE jav_favorite_map.entity_type = ? AND jav_favorite_map.entity_id = jav_idol.id)", JavFavoriteEntityIdol)
}

func unusedStudioQuery(tx *gorm.DB) *gorm.DB {
	return tx.Model(&models.JavStudio{}).
		Where("NOT EXISTS (SELECT 1 FROM jav WHERE jav.studio_id = jav_studio.id)").
		Where("NOT EXISTS (SELECT 1 FROM jav_series WHERE jav_series.studio_id = jav_studio.id)").
		Where("NOT EXISTS (SELECT 1 FROM jav_favorite_map WHERE jav_favorite_map.entity_type = ? AND jav_favorite_map.entity_id = jav_studio.id)", JavFavoriteEntityStudio)
}

func unusedSeriesQuery(tx *gorm.DB) *gorm.DB {
	return tx.Model(&models.JavSeries{}).
		Where("NOT EXISTS (SELECT 1 FROM jav WHERE jav.series_id = jav_series.id OR jav.series_en_id = jav_series.id)").
		Where("NOT EXISTS (SELECT 1 FROM jav_favorite_map WHERE jav_favorite_map.entity_type = ? AND jav_favorite_map.entity_id = jav_series.id)", JavFavoriteEntitySeries)
}

// CountUnusedScrapedData reports how many scraped records a cleanup would
// remove, including metadata that only becomes unused after orphan JAV rows
// are deleted. The database is left unchanged.
func CountUnusedScrapedData(ctx context.Context) (UnusedScrapedDataCounts, error) {
	if common.DB == nil {
		return UnusedScrapedDataCounts{}, fmt.Errorf("count unused scraped data: nil db")
	}

	var counts UnusedScrapedDataCounts
	err := common.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		deleted, err := deleteUnusedScrapedDataTx(tx)
		if err != nil {
			return err
		}
		counts = deleted
		return errUnusedScrapedDataPreview
	})
	if errors.Is(err, errUnusedScrapedDataPreview) {
		return counts, nil
	}
	if err != nil {
		return UnusedScrapedDataCounts{}, err
	}
	return counts, nil
}

// DeleteUnusedScrapedData removes scraped metadata that is not referenced by
// any video location or other still-used API entity. It never deletes videos,
// video locations, directories, or user-created tags.
func DeleteUnusedScrapedData(ctx context.Context) (UnusedScrapedDataCounts, error) {
	if common.DB == nil {
		return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused scraped data: nil db")
	}

	var counts UnusedScrapedDataCounts
	err := common.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		deleted, err := deleteUnusedScrapedDataTx(tx)
		if err != nil {
			return err
		}
		counts = deleted
		return nil
	})
	if err != nil {
		return UnusedScrapedDataCounts{}, err
	}
	return counts, nil
}

func deleteUnusedScrapedDataTx(tx *gorm.DB) (UnusedScrapedDataCounts, error) {
	var counts UnusedScrapedDataCounts

	orphanIDs, err := pluckIDs(orphanJavQuery(tx))
	if err != nil {
		return UnusedScrapedDataCounts{}, fmt.Errorf("list unused javs: %w", err)
	}
	if len(orphanIDs) > 0 {
		if err := tx.Where("jav_id IN ?", orphanIDs).Delete(&models.JavTagMap{}).Error; err != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused jav tag maps: %w", err)
		}
		if err := tx.Where("jav_id IN ?", orphanIDs).Delete(&models.JavIdolMap{}).Error; err != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused jav idol maps: %w", err)
		}
		if err := tx.Where("entity_type = ? AND entity_id IN ?", JavFavoriteEntityJav, orphanIDs).
			Delete(&models.JavFavoriteMap{}).Error; err != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused jav favorite maps: %w", err)
		}
		if err := tx.Model(&models.JavIdol{}).
			Where("cover_jav_id IN ?", orphanIDs).
			Update("cover_jav_id", nil).Error; err != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("clear unused idol covers: %w", err)
		}
		result := tx.Where("id IN ?", orphanIDs).Delete(&models.Jav{})
		if result.Error != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused javs: %w", result.Error)
		}
		counts.Javs = int(result.RowsAffected)
	}

	idolIDs, err := pluckIDs(unusedIdolQuery(tx))
	if err != nil {
		return UnusedScrapedDataCounts{}, fmt.Errorf("list unused idols: %w", err)
	}
	if len(idolIDs) > 0 {
		if err := tx.Where("entity_type = ? AND entity_id IN ?", JavFavoriteEntityIdol, idolIDs).
			Delete(&models.JavFavoriteMap{}).Error; err != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused idol favorite maps: %w", err)
		}
		result := tx.Where("id IN ?", idolIDs).Delete(&models.JavIdol{})
		if result.Error != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused idols: %w", result.Error)
		}
		counts.Idols = int(result.RowsAffected)
	}

	seriesIDs, err := pluckIDs(unusedSeriesQuery(tx))
	if err != nil {
		return UnusedScrapedDataCounts{}, fmt.Errorf("list unused series: %w", err)
	}
	if len(seriesIDs) > 0 {
		if err := tx.Where("entity_type = ? AND entity_id IN ?", JavFavoriteEntitySeries, seriesIDs).
			Delete(&models.JavFavoriteMap{}).Error; err != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused series favorite maps: %w", err)
		}
		result := tx.Where("id IN ?", seriesIDs).Delete(&models.JavSeries{})
		if result.Error != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused series: %w", result.Error)
		}
		counts.Series = int(result.RowsAffected)
	}

	studioIDs, err := pluckIDs(unusedStudioQuery(tx))
	if err != nil {
		return UnusedScrapedDataCounts{}, fmt.Errorf("list unused studios: %w", err)
	}
	if len(studioIDs) > 0 {
		if err := tx.Where("entity_type = ? AND entity_id IN ?", JavFavoriteEntityStudio, studioIDs).
			Delete(&models.JavFavoriteMap{}).Error; err != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused studio favorite maps: %w", err)
		}
		result := tx.Where("id IN ?", studioIDs).Delete(&models.JavStudio{})
		if result.Error != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused studios: %w", result.Error)
		}
		counts.Studios = int(result.RowsAffected)
	}

	tagIDs, err := pluckIDs(unusedScrapedTagQuery(tx))
	if err != nil {
		return UnusedScrapedDataCounts{}, fmt.Errorf("list unused scraped tags: %w", err)
	}
	if len(tagIDs) > 0 {
		result := tx.Where("id IN ?", tagIDs).Delete(&models.JavTag{})
		if result.Error != nil {
			return UnusedScrapedDataCounts{}, fmt.Errorf("delete unused scraped tags: %w", result.Error)
		}
		counts.ScrapedTags = int(result.RowsAffected)
	}

	return counts, nil
}

func pluckIDs(query *gorm.DB) ([]int64, error) {
	var ids []int64
	if err := query.Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

// ListKeptCoverCodes returns lowercase JAV codes whose cover files must be kept
// because a library video or an idol-work listing still uses them.
func ListKeptCoverCodes(ctx context.Context) (map[string]struct{}, error) {
	if common.DB == nil {
		return nil, fmt.Errorf("list kept cover codes: nil db")
	}

	keep := make(map[string]struct{})
	var codes []string
	if err := common.DB.WithContext(ctx).
		Model(&models.Jav{}).
		Where("EXISTS (SELECT 1 FROM video_location WHERE video_location.jav_id = jav.id)").
		Where("COALESCE(code, '') <> ''").
		Pluck("code", &codes).Error; err != nil {
		return nil, fmt.Errorf("list library cover codes: %w", err)
	}
	addKeptCoverCodes(keep, codes)

	codes = codes[:0]
	if err := common.DB.WithContext(ctx).
		Model(&models.JavIdolWork{}).
		Where("COALESCE(code, '') <> ''").
		Distinct("code").
		Pluck("code", &codes).Error; err != nil {
		return nil, fmt.Errorf("list idol-work cover codes: %w", err)
	}
	addKeptCoverCodes(keep, codes)
	return keep, nil
}

func addKeptCoverCodes(keep map[string]struct{}, codes []string) {
	for _, code := range codes {
		normalized := strings.ToLower(strings.TrimSpace(code))
		if normalized == "" {
			continue
		}
		keep[normalized] = struct{}{}
	}
}
