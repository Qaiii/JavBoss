package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext(
		"202609040001_add_jav_idol_work_source.go",
		addJavIdolWorkSource,
		irreversibleMigration,
	)
}

// addJavIdolWorkSource records which provider each idol work was scraped from.
// Idol works previously came exclusively from JavDB; once the background
// scraper may fall back to JavDatabase the column tells the UI and the next
// refresh which listing a row belongs to. Existing rows keep source=0
// (unknown/JavDB, indistinguishable by design).
func addJavIdolWorkSource(ctx context.Context, tx *sql.Tx) error {
	return addColumnIfMissing(
		ctx,
		tx,
		"jav_idol_work",
		"source",
		`integer NOT NULL DEFAULT 0`,
	)
}
