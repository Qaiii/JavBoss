package migrations

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestMoveJavTitleZHToZhTitleCopiesAndDropsLegacyColumn(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE jav (
			id integer PRIMARY KEY,
			title_zh text,
			zh_title text NOT NULL DEFAULT ''
		);
		INSERT INTO jav (id, title_zh, zh_title) VALUES
			(1, '已有中文', ''),
			(2, '旧中文', '新中文'),
			(3, '', '');
	`); err != nil {
		t.Fatal(err)
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := moveJavTitleZHToZhTitle(context.Background(), tx); err != nil {
		t.Fatal(err)
	}
	if err := moveJavTitleZHToZhTitle(context.Background(), tx); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}

	var first, second, third string
	if err := db.QueryRow(`SELECT zh_title FROM jav WHERE id = 1`).Scan(&first); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT zh_title FROM jav WHERE id = 2`).Scan(&second); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT zh_title FROM jav WHERE id = 3`).Scan(&third); err != nil {
		t.Fatal(err)
	}
	if first != "已有中文" || second != "新中文" || third != "" {
		t.Fatalf("zh_title = %q, %q, %q", first, second, third)
	}
	var name string
	err = db.QueryRow(`SELECT name FROM pragma_table_info('jav') WHERE name = 'title_zh'`).Scan(&name)
	if err != sql.ErrNoRows {
		t.Fatalf("title_zh lookup = %v, name %q", err, name)
	}
}
