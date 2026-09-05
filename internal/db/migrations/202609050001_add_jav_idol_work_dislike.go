package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext(
		"202609050001_add_jav_idol_work_dislike.go",
		addJavIdolWorkDislike,
		irreversibleMigration,
	)
}

func addJavIdolWorkDislike(ctx context.Context, tx *sql.Tx) error {
	return execStatements(ctx, tx,
		`CREATE TABLE IF NOT EXISTS "jav_idol_work_dislike" (
			jav_idol_id integer,
			code text,
			created_at datetime,
			PRIMARY KEY (jav_idol_id, code),
			CONSTRAINT fk_jav_idol_work_dislike_jav_idol FOREIGN KEY (jav_idol_id) REFERENCES jav_idol(id) ON UPDATE CASCADE ON DELETE CASCADE
		)`,
	)
}
