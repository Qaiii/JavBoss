package migrations

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestAddJavTitleZH(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE "jav" (
			id integer PRIMARY KEY AUTOINCREMENT,
			code text,
			title text,
			favorite_rating real NOT NULL DEFAULT 0
		)
	`); err != nil {
		t.Fatalf("create jav table: %v", err)
	}
	if _, err := db.Exec(`
		CREATE TABLE "jav_idol_work" (
			id integer PRIMARY KEY AUTOINCREMENT,
			jav_idol_id integer NOT NULL,
			code text NOT NULL,
			title text,
			tags text NOT NULL DEFAULT "[]"
		)
	`); err != nil {
		t.Fatalf("create jav_idol_work table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO jav (code, title) VALUES ('IPX-001', '中年オヤジ')`); err != nil {
		t.Fatalf("seed jav: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO jav_idol_work (jav_idol_id, code, title) VALUES (1, 'IPX-001', '中年オヤジ')`,
	); err != nil {
		t.Fatalf("seed work: %v", err)
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin migration: %v", err)
	}
	if err := addJavTitleZH(context.Background(), tx); err != nil {
		_ = tx.Rollback()
		t.Fatalf("add title_zh columns: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit migration: %v", err)
	}

	var javTitle, workTitle string
	if err := db.QueryRow(`SELECT COALESCE(title_zh, '') FROM jav WHERE id = 1`).Scan(&javTitle); err != nil {
		t.Fatalf("read jav title_zh: %v", err)
	}
	if err := db.QueryRow(`SELECT COALESCE(title_zh, '') FROM jav_idol_work WHERE id = 1`).Scan(&workTitle); err != nil {
		t.Fatalf("read work title_zh: %v", err)
	}
	if javTitle != "" || workTitle != "" {
		t.Fatalf("legacy title_zh = jav %q work %q, want empty", javTitle, workTitle)
	}

	tx2, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin second migration: %v", err)
	}
	if err := addJavTitleZH(context.Background(), tx2); err != nil {
		_ = tx2.Rollback()
		t.Fatalf("re-run add title_zh columns: %v", err)
	}
	if err := tx2.Commit(); err != nil {
		t.Fatalf("commit second migration: %v", err)
	}
}
