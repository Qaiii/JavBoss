package cache

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// SQLiteKV is a small persistent key-value store backed by a standalone SQLite file.
type SQLiteKV struct {
	db *sql.DB
}

// OpenSQLiteKV opens or creates a standalone SQLite key-value cache database.
func OpenSQLiteKV(path string) (*SQLiteKV, error) {
	path = filepath.Clean(path)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create cache directory: %w", err)
	}
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite kv: %w", err)
	}
	db.SetMaxOpenConns(1)
	closeOnErr := true
	defer func() {
		if closeOnErr {
			_ = db.Close()
		}
	}()
	if err := initSQLiteKV(db); err != nil {
		return nil, err
	}
	closeOnErr = false
	return &SQLiteKV{db: db}, nil
}

func initSQLiteKV(db *sql.DB) error {
	statements := []string{
		`PRAGMA journal_mode=WAL`,
		`PRAGMA busy_timeout=5000`,
		`CREATE TABLE IF NOT EXISTS kv (
			key text PRIMARY KEY,
			value text NOT NULL,
			expires_at integer NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_kv_expires_at ON kv(expires_at)`,
	}
	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("init sqlite kv: %w", err)
		}
	}
	return nil
}

// Close closes the underlying database handle.
func (s *SQLiteKV) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// Get loads a non-expired value by key.
func (s *SQLiteKV) Get(key string, now time.Time) ([]byte, bool, error) {
	if s == nil || s.db == nil {
		return nil, false, nil
	}
	nowUnix := now.Unix()
	var (
		value     string
		expiresAt int64
	)
	err := s.db.QueryRow(`SELECT value, expires_at FROM kv WHERE key = ?`, key).Scan(&value, &expiresAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("get kv: %w", err)
	}
	if expiresAt <= nowUnix {
		_, _ = s.db.Exec(`DELETE FROM kv WHERE key = ?`, key)
		return nil, false, nil
	}
	return []byte(value), true, nil
}

// Set stores a value until expiresAt. Existing values are replaced.
func (s *SQLiteKV) Set(key string, value []byte, expiresAt time.Time) error {
	if s == nil || s.db == nil {
		return nil
	}
	_, err := s.db.Exec(
		`INSERT INTO kv (key, value, expires_at)
		 VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
		key,
		string(value),
		expiresAt.Unix(),
	)
	if err != nil {
		return fmt.Errorf("set kv: %w", err)
	}
	return nil
}

// CountExpired returns how many values have already expired.
func (s *SQLiteKV) CountExpired(now time.Time) (int, error) {
	if s == nil || s.db == nil {
		return 0, nil
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM kv WHERE expires_at <= ?`, now.Unix()).Scan(&n); err != nil {
		return 0, fmt.Errorf("count expired kv: %w", err)
	}
	return n, nil
}

// DeleteExpired removes expired values.
func (s *SQLiteKV) DeleteExpired(now time.Time) error {
	_, err := s.DeleteExpiredCount(now)
	return err
}

// DeleteExpiredCount removes expired values and returns how many were deleted.
func (s *SQLiteKV) DeleteExpiredCount(now time.Time) (int, error) {
	if s == nil || s.db == nil {
		return 0, nil
	}
	result, err := s.db.Exec(`DELETE FROM kv WHERE expires_at <= ?`, now.Unix())
	if err != nil {
		return 0, fmt.Errorf("delete expired kv: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("expired kv rows affected: %w", err)
	}
	return int(n), nil
}

// StartCleaner periodically removes expired values until ctx is done.
func (s *SQLiteKV) StartCleaner(ctx context.Context, interval time.Duration) {
	if s == nil || s.db == nil || interval <= 0 {
		return
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			_ = s.DeleteExpired(time.Now())
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
