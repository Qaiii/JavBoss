package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext(
		"202609050004_add_jav_idol_poster.go",
		addJavIdolPoster,
		irreversibleMigration,
	)
}

func addJavIdolPoster(ctx context.Context, tx *sql.Tx) error {
	return addColumnIfMissing(ctx, tx, "jav_idol", "poster_images", `text NOT NULL DEFAULT "[]"`)
}
