package migrations

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// TestRepairDirectoryAutoScanColumns simulates the broken state found on
// databases migrated by an older build: the 202608030001 migration was
// recorded as applied but the auto-scan columns were never added. The repair
// migration must add both columns and backfill existing rows with the defaults
// the model expects (enabled=1, interval=1).
func TestRepairDirectoryAutoScanColumns(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE directory (
			id integer PRIMARY KEY AUTOINCREMENT,
			path text,
			missing numeric,
			is_delete numeric,
			created_at datetime,
			updated_at datetime,
			last_scan_summary text NOT NULL DEFAULT "{}",
			"enabled" numeric NOT NULL DEFAULT 1
		)
	`); err != nil {
		t.Fatalf("create directory table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO directory (path, is_delete) VALUES ('/media/one', 0)`); err != nil {
		t.Fatalf("seed directory: %v", err)
	}

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin migration: %v", err)
	}
	if err := repairDirectoryAutoScanColumns(context.Background(), tx); err != nil {
		_ = tx.Rollback()
		t.Fatalf("repair auto scan columns: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit migration: %v", err)
	}

	var enabled bool
	var interval int
	if err := db.QueryRow(
		`SELECT auto_scan_enabled, auto_scan_interval_minutes FROM directory WHERE id = 1`,
	).Scan(&enabled, &interval); err != nil {
		t.Fatalf("read migrated directory: %v", err)
	}
	if !enabled {
		t.Fatal("existing directory should have auto_scan_enabled = 1 after repair")
	}
	if interval != 1 {
		t.Fatalf("auto_scan_interval_minutes = %d, want 1", interval)
	}
}
