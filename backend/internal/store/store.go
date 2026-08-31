// Package store provides the MySQL metadata storage for the backend. The
// schema itself is not managed here: the operator applies schema.sql
// manually and the backend only verifies it at startup (CheckSchema).
package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql" // registers the "mysql" driver
)

// Connection pool bounds. Unlike SQLite, MySQL handles concurrent writers;
// the revision counter stays consistent via SELECT ... FOR UPDATE inside
// AppendSnapshot transactions.
const (
	maxOpenConns    = 10
	maxIdleConns    = 10
	connMaxLifetime = 5 * time.Minute
)

// requiredTables must all exist after the operator applied schema.sql.
var requiredTables = []string{"users", "documents", "document_snapshots", "assets"}

// Store wraps the MySQL connection pool.
type Store struct {
	db *sql.DB
}

// Open connects using a go-sql-driver DSN and verifies connectivity.
func Open(dsn string) (*Store, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}
	db.SetMaxOpenConns(maxOpenConns)
	db.SetMaxIdleConns(maxIdleConns)
	db.SetConnMaxLifetime(connMaxLifetime)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping mysql: %w", err)
	}
	return &Store{db: db}, nil
}

// Close closes the underlying connection pool.
func (s *Store) Close() error {
	return s.db.Close()
}

// CheckSchema verifies that schema.sql has been applied to the connected
// database. It never mutates anything.
func (s *Store) CheckSchema(ctx context.Context) error {
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(requiredTables)), ",")
	query := fmt.Sprintf(
		"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (%s)",
		placeholders,
	)
	args := make([]any, len(requiredTables))
	for i, t := range requiredTables {
		args[i] = t
	}
	var count int
	if err := s.db.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return fmt.Errorf("query information_schema: %w", err)
	}
	if count != len(requiredTables) {
		return fmt.Errorf(
			"schema not initialized: found %d/%d required tables; apply schema.sql to the database first (see README)",
			count, len(requiredTables),
		)
	}
	return nil
}

// ApplySchemaDDL executes a schema.sql script (multi-statement). Production
// applies it out-of-band by the operator; this exists for the test harness,
// which provisions disposable databases from the same file.
func (s *Store) ApplySchemaDDL(ctx context.Context, ddl string) error {
	if _, err := s.db.ExecContext(ctx, ddl); err != nil {
		return fmt.Errorf("apply schema ddl: %w", err)
	}
	return nil
}
