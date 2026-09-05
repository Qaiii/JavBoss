package migrations

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestAddJavIdolPoster(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE "jav_idol" (
			id integer PRIMARY KEY AUTOINCREMENT,
			name text,
			cover_jav_id integer,
			cover_crop_left real NOT NULL DEFAULT 0.53
		)
	`); err != nil {
		t.Fatalf("create jav_idol table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO jav_idol (name) VALUES ('Poster Idol')`); err != nil {
		t.Fatalf("seed idol: %v", err)
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin migration: %v", err)
	}
	if err := addJavIdolPoster(context.Background(), tx); err != nil {
		_ = tx.Rollback()
		t.Fatalf("add poster_images column: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit migration: %v", err)
	}

	var raw string
	if err := db.QueryRow(`SELECT poster_images FROM jav_idol WHERE id = 1`).Scan(&raw); err != nil {
		t.Fatalf("read poster_images: %v", err)
	}
	if raw != "[]" {
		t.Fatalf("legacy poster_images = %q, want []", raw)
	}

	tx2, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin second migration: %v", err)
	}
	if err := addJavIdolPoster(context.Background(), tx2); err != nil {
		_ = tx2.Rollback()
		t.Fatalf("re-run add poster_images column: %v", err)
	}
	if err := tx2.Commit(); err != nil {
		t.Fatalf("commit second migration: %v", err)
	}
}
