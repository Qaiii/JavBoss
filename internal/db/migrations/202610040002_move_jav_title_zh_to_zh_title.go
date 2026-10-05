package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext("202610040002_move_jav_title_zh_to_zh_title.go", moveJavTitleZHToZhTitle, irreversibleMigration)
}

// moveJavTitleZHToZhTitle copies the fork's jav.title_zh values into upstream's
// zh_title column and drops title_zh so the table matches the Jav model.
func moveJavTitleZHToZhTitle(ctx context.Context, tx *sql.Tx) error {
	hasOld, err := columnExists(ctx, tx, "jav", "title_zh")
	if err != nil || !hasOld {
		return err
	}
	if err := addColumnIfMissing(ctx, tx, "jav", "zh_title", `text NOT NULL DEFAULT ""`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE jav
		SET zh_title = title_zh
		WHERE TRIM(COALESCE(zh_title, '')) = ''
		  AND TRIM(COALESCE(title_zh, '')) <> ''
	`); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `ALTER TABLE jav DROP COLUMN title_zh`)
	return err
}
