package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext(
		"202609050003_add_jav_title_zh.go",
		addJavTitleZH,
		irreversibleMigration,
	)
}

func addJavTitleZH(ctx context.Context, tx *sql.Tx) error {
	if err := addColumnIfMissing(ctx, tx, "jav", "title_zh", "text"); err != nil {
		return err
	}
	return addColumnIfMissing(ctx, tx, "jav_idol_work", "title_zh", "text")
}
