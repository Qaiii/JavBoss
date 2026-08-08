package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext("202608080001_add_jav_idol_works.go", addJavIdolWorks, irreversibleMigration)
}

func addJavIdolWorks(ctx context.Context, tx *sql.Tx) error {
	return execStatements(ctx, tx,
		`CREATE TABLE IF NOT EXISTS "jav_idol_track" (
			jav_idol_id integer PRIMARY KEY,
			javdb_url text,
			last_scraped_at datetime,
			works_count integer NOT NULL DEFAULT 0,
			last_error text,
			created_at datetime,
			updated_at datetime,
			CONSTRAINT fk_jav_idol_track_jav_idol FOREIGN KEY (jav_idol_id) REFERENCES jav_idol(id) ON UPDATE CASCADE ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_jav_idol_track_last_scraped_at ON jav_idol_track(last_scraped_at)`,
		`CREATE TABLE IF NOT EXISTS "jav_idol_work" (
			id integer PRIMARY KEY AUTOINCREMENT,
			jav_idol_id integer NOT NULL,
			code text NOT NULL,
			title text,
			cover_url text,
			release_unix integer NOT NULL DEFAULT 0,
			duration_min integer NOT NULL DEFAULT 0,
			source_url text,
			created_at datetime,
			updated_at datetime,
			CONSTRAINT fk_jav_idol_work_jav_idol FOREIGN KEY (jav_idol_id) REFERENCES jav_idol(id) ON UPDATE CASCADE ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_jav_idol_work_jav_idol_id_code ON jav_idol_work(jav_idol_id, code)`,
	)
}
