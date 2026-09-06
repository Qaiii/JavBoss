package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext("202609060001_add_jav_actor.go", addJavActor, irreversibleMigration)
}

func addJavActor(ctx context.Context, tx *sql.Tx) error {
	return execStatements(ctx, tx,
		`CREATE TABLE IF NOT EXISTS "jav_actor" (
			id integer PRIMARY KEY AUTOINCREMENT,
			name text,
			created_at datetime,
			updated_at datetime
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_jav_actor_name ON jav_actor(name)`,
		`CREATE TABLE IF NOT EXISTS "jav_actor_map" (
			jav_id integer,
			jav_actor_id integer,
			created_at datetime,
			PRIMARY KEY (jav_id, jav_actor_id),
			CONSTRAINT fk_jav_actor_map_jav FOREIGN KEY (jav_id) REFERENCES jav(id) ON UPDATE CASCADE ON DELETE CASCADE,
			CONSTRAINT fk_jav_actor_map_jav_actor FOREIGN KEY (jav_actor_id) REFERENCES jav_actor(id) ON UPDATE CASCADE ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_jav_actor_map_jav_actor_id_jav_id ON jav_actor_map(jav_actor_id, jav_id)`,
	)
}
