package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext("202608030001_add_video_format.go", addVideoFormat, irreversibleMigration)
}

func addVideoFormat(ctx context.Context, tx *sql.Tx) error {
	return addColumnIfMissing(ctx, tx, "video", "format", "text")
}
