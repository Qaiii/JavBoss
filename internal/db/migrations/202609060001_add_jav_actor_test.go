package migrations

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestAddJavActor(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE "jav" (
			id integer PRIMARY KEY AUTOINCREMENT,
			code text
		)
	`); err != nil {
		t.Fatalf("create jav table: %v", err)
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin migration: %v", err)
	}
	if err := addJavActor(context.Background(), tx); err != nil {
		_ = tx.Rollback()
		t.Fatalf("add jav actor tables: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit migration: %v", err)
	}

	if _, err := db.Exec(`INSERT INTO jav_actor (name) VALUES ('藍井優太')`); err != nil {
		t.Fatalf("insert actor: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO jav (code) VALUES ('SSIS-001')`); err != nil {
		t.Fatalf("insert jav: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO jav_actor_map (jav_id, jav_actor_id) VALUES (1, 1)`); err != nil {
		t.Fatalf("insert actor map: %v", err)
	}

	tx2, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin second migration: %v", err)
	}
	if err := addJavActor(context.Background(), tx2); err != nil {
		_ = tx2.Rollback()
		t.Fatalf("re-run add jav actor tables: %v", err)
	}
	if err := tx2.Commit(); err != nil {
		t.Fatalf("commit second migration: %v", err)
	}

	var name string
	if err := db.QueryRow(`SELECT name FROM jav_actor WHERE id = 1`).Scan(&name); err != nil {
		t.Fatalf("read actor: %v", err)
	}
	if name != "藍井優太" {
		t.Fatalf("actor name = %q, want 藍井優太", name)
	}
}
