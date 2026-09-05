package migrations

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestAddJavIdolWorkCardMetadata(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE "jav_idol_work" (
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
			source integer NOT NULL DEFAULT 0
		)
	`); err != nil {
		t.Fatalf("create jav_idol_work table: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO jav_idol_work (jav_idol_id, code, title) VALUES (1, 'IPX-001', 'Legacy Work')`,
	); err != nil {
		t.Fatalf("seed work: %v", err)
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin migration: %v", err)
	}
	if err := addJavIdolWorkCardMetadata(context.Background(), tx); err != nil {
		_ = tx.Rollback()
		t.Fatalf("add card metadata columns: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit migration: %v", err)
	}

	var studio, series, tags string
	if err := db.QueryRow(
		`SELECT COALESCE(studio_name, ''), COALESCE(series_name, ''), tags FROM jav_idol_work WHERE id = 1`,
	).Scan(&studio, &series, &tags); err != nil {
		t.Fatalf("read migrated work: %v", err)
	}
	if studio != "" || series != "" || tags != "[]" {
		t.Fatalf("legacy work metadata = studio %q series %q tags %q", studio, series, tags)
	}

	tx2, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin second migration: %v", err)
	}
	if err := addJavIdolWorkCardMetadata(context.Background(), tx2); err != nil {
		_ = tx2.Rollback()
		t.Fatalf("re-run add card metadata columns: %v", err)
	}
	if err := tx2.Commit(); err != nil {
		t.Fatalf("commit second migration: %v", err)
	}
}
