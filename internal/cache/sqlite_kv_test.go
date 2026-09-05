package cache

import (
	"path/filepath"
	"testing"
	"time"
)

func TestSQLiteKVGetSetAndExpire(t *testing.T) {
	store, err := OpenSQLiteKV(filepath.Join(t.TempDir(), "jav_cache.db"))
	if err != nil {
		t.Fatalf("open sqlite kv: %v", err)
	}
	defer store.Close()

	now := time.Unix(1710000000, 0)
	if err := store.Set("v1:jav:javbus:lookup_jav:ABC-001", []byte(`{"v":1}`), now.Add(time.Hour)); err != nil {
		t.Fatalf("set kv: %v", err)
	}
	got, ok, err := store.Get("v1:jav:javbus:lookup_jav:ABC-001", now)
	if err != nil {
		t.Fatalf("get kv: %v", err)
	}
	if !ok || string(got) != `{"v":1}` {
		t.Fatalf("unexpected get: ok=%t value=%s", ok, string(got))
	}
	var valueType string
	if err := store.db.QueryRow(`SELECT typeof(value) FROM kv WHERE key = ?`, "v1:jav:javbus:lookup_jav:ABC-001").Scan(&valueType); err != nil {
		t.Fatalf("load value type: %v", err)
	}
	if valueType != "text" {
		t.Fatalf("unexpected value type: got %q want text", valueType)
	}
	_, ok, err = store.Get("v1:jav:javbus:lookup_jav:ABC-001", now.Add(2*time.Hour))
	if err != nil {
		t.Fatalf("get expired kv: %v", err)
	}
	if ok {
		t.Fatal("expected expired key to miss")
	}
}

func TestSQLiteKVCountAndDeleteExpired(t *testing.T) {
	store, err := OpenSQLiteKV(filepath.Join(t.TempDir(), "jav_cache.db"))
	if err != nil {
		t.Fatalf("open sqlite kv: %v", err)
	}
	defer store.Close()

	now := time.Unix(1710000000, 0)
	if err := store.Set("live", []byte("1"), now.Add(time.Hour)); err != nil {
		t.Fatalf("set live: %v", err)
	}
	if err := store.Set("stale", []byte("2"), now.Add(-time.Minute)); err != nil {
		t.Fatalf("set stale: %v", err)
	}
	count, err := store.CountExpired(now)
	if err != nil {
		t.Fatalf("count expired: %v", err)
	}
	if count != 1 {
		t.Fatalf("expired count = %d, want 1", count)
	}
	deleted, err := store.DeleteExpiredCount(now)
	if err != nil {
		t.Fatalf("delete expired: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("deleted = %d, want 1", deleted)
	}
	if _, ok, err := store.Get("live", now); err != nil || !ok {
		t.Fatalf("live key missing: ok=%t err=%v", ok, err)
	}
}
