// Package store provides the SQLite metadata storage for the backend.
package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite" // registers the "sqlite" driver (pure Go, no CGO)
)

// busyTimeoutMs is how long a writer waits for the SQLite lock (milliseconds).
const busyTimeoutMs = 5000

// maxOpenConns is deliberately 1: SQLite allows a single writer, so
// serializing all statements through one connection rules out SQLITE_BUSY
// from concurrent write transactions entirely.
const maxOpenConns = 1

// Store wraps the SQLite connection pool.
type Store struct {
	db *sql.DB
}

// Open opens (creating if needed) the database file at path and applies the
// connection pragmas via the DSN.
func Open(path string) (*Store, error) {
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}
	dsn := fmt.Sprintf(
		"file:%s?_pragma=busy_timeout(%d)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_txlock=immediate",
		path, busyTimeoutMs,
	)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(maxOpenConns)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return &Store{db: db}, nil
}

// Close closes the underlying connection pool.
func (s *Store) Close() error {
	return s.db.Close()
}
