package db

import (
	"context"
	"database/sql"
	"io"
	"io/fs"
	"time"

	"github.com/pressly/goose/v3"
	_ "javboss/internal/db/migrations"
)

const migrationDir = "."

type sqlExecer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func init() {
	goose.SetLogger(goose.NopLogger())
	goose.SetBaseFS(emptyMigrationFS{})
	if err := goose.SetDialect("sqlite3"); err != nil {
		panic(err)
	}
}

func runMigrations(ctx context.Context, db *sql.DB) error {
	// Allow missing migrations: this repo is a fork whose migration history can
	// interleave with upstream. A database migrated by an older fork build may
	// already sit at a version newer than a later-merged upstream migration
	// (e.g. 202608050001_add_jav_favorite_rating vs 202608080001_add_jav_idol_works).
	// WithAllowMissing applies those older-but-missing migrations in order and
	// skips already-applied ones, so both fresh and pre-existing databases
	// upgrade cleanly instead of aborting at startup.
	return goose.UpContext(ctx, db, migrationDir, goose.WithAllowMissing())
}

func execDB(ctx context.Context, execer sqlExecer, stmt string, args ...any) error {
	_, err := execer.ExecContext(ctx, stmt, args...)
	return err
}

type emptyMigrationFS struct{}

func (emptyMigrationFS) Open(name string) (fs.File, error) {
	if name == "." {
		return emptyMigrationDir{}, nil
	}
	return nil, fs.ErrNotExist
}

type emptyMigrationDir struct{}

func (emptyMigrationDir) Stat() (fs.FileInfo, error) {
	return emptyMigrationDirInfo{}, nil
}

func (emptyMigrationDir) Read([]byte) (int, error) {
	return 0, io.EOF
}

func (emptyMigrationDir) Close() error {
	return nil
}

func (emptyMigrationDir) ReadDir(n int) ([]fs.DirEntry, error) {
	if n > 0 {
		return nil, io.EOF
	}
	return []fs.DirEntry{}, nil
}

type emptyMigrationDirInfo struct{}

func (emptyMigrationDirInfo) Name() string {
	return "."
}

func (emptyMigrationDirInfo) Size() int64 {
	return 0
}

func (emptyMigrationDirInfo) Mode() fs.FileMode {
	return fs.ModeDir | 0o555
}

func (emptyMigrationDirInfo) ModTime() time.Time {
	return time.Time{}
}

func (emptyMigrationDirInfo) IsDir() bool {
	return true
}

func (emptyMigrationDirInfo) Sys() any {
	return nil
}
