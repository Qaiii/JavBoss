package migrations

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// TestAddJavIdolWorkSource verifies the migration adds the source column and
// backfills existing rows with 0, and that re-running is a no-op.
func TestAddJavIdolWorkSource(t *testing.T) {
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
			updated_at datetime
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
	if err := addJavIdolWorkSource(context.Background(), tx); err != nil {
		_ = tx.Rollback()
		t.Fatalf("add source column: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit migration: %v", err)
	}

	var source int
	if err := db.QueryRow(
		`SELECT source FROM jav_idol_work WHERE id = 1`,
	).Scan(&source); err != nil {
		t.Fatalf("read migrated work: %v", err)
	}
	if source != 0 {
		t.Fatalf("existing work source = %d, want 0 (unknown)", source)
	}

	// New inserts default to 0.
	if _, err := db.Exec(
		`INSERT INTO jav_idol_work (jav_idol_id, code) VALUES (1, 'ABP-999')`,
	); err != nil {
		t.Fatalf("insert new work: %v", err)
	}
	var defaultSource int
	if err := db.QueryRow(
		`SELECT source FROM jav_idol_work WHERE code = 'ABP-999'`,
	).Scan(&defaultSource); err != nil {
		t.Fatalf("read default source: %v", err)
	}
	if defaultSource != 0 {
		t.Fatalf("new work source = %d, want 0", defaultSource)
	}

	// Re-running the migration must be a no-op (column already exists).
	tx2, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin second migration: %v", err)
	}
	if err := addJavIdolWorkSource(context.Background(), tx2); err != nil {
		_ = tx2.Rollback()
		t.Fatalf("re-run add source column: %v", err)
	}
	if err := tx2.Commit(); err != nil {
		t.Fatalf("commit second migration: %v", err)
	}
}
