package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext(
		"202609030001_repair_directory_auto_scan_columns.go",
		repairDirectoryAutoScanColumns,
		irreversibleMigration,
	)
}

// repairDirectoryAutoScanColumns ensures the directory auto-scan columns exist.
// Some databases were migrated by an older build whose 202608030001 migration
// was recorded as applied without actually adding the columns, so a later
// image never re-added them and scan-settings updates failed with
// "no such column". addColumnIfMissing makes this a no-op on healthy databases.
func repairDirectoryAutoScanColumns(ctx context.Context, tx *sql.Tx) error {
	if err := addColumnIfMissing(
		ctx,
		tx,
		"directory",
		"auto_scan_enabled",
		`numeric NOT NULL DEFAULT 1`,
	); err != nil {
		return err
	}
	return addColumnIfMissing(
		ctx,
		tx,
		"directory",
		"auto_scan_interval_minutes",
		`integer NOT NULL DEFAULT 1`,
	)
}
