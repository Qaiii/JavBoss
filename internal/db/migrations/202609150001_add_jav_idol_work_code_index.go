package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext(
		"202609150001_add_jav_idol_work_code_index.go",
		addJavIdolWorkCodeIndex,
		irreversibleMigration,
	)
}

func addJavIdolWorkCodeIndex(ctx context.Context, tx *sql.Tx) error {
	return execStatements(ctx, tx,
		`CREATE INDEX IF NOT EXISTS idx_jav_idol_work_code ON jav_idol_work(code)`,
	)
}
