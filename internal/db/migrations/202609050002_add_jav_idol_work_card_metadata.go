package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext(
		"202609050002_add_jav_idol_work_card_metadata.go",
		addJavIdolWorkCardMetadata,
		irreversibleMigration,
	)
}

func addJavIdolWorkCardMetadata(ctx context.Context, tx *sql.Tx) error {
	if err := addColumnIfMissing(ctx, tx, "jav_idol_work", "studio_name", "text"); err != nil {
		return err
	}
	if err := addColumnIfMissing(ctx, tx, "jav_idol_work", "series_name", "text"); err != nil {
		return err
	}
	if err := addColumnIfMissing(ctx, tx, "jav_idol_work", "tags", `text NOT NULL DEFAULT "[]"`); err != nil {
		return err
	}
	return nil
}
