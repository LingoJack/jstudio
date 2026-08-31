package store

import (
	"context"
	"fmt"
)

// migrations[i] upgrades the schema from version i to version i+1. The
// current schema version is tracked by PRAGMA user_version. Statements are
// intentionally written without IF NOT EXISTS: the runner guarantees each
// version applies exactly once, and an accidental double-apply must fail
// loudly instead of silently skipping.
var migrations = []string{
	// v1: user accounts.
	`CREATE TABLE users (
		id            TEXT PRIMARY KEY,
		username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
		password_hash TEXT NOT NULL,
		created_at    TEXT NOT NULL,
		updated_at    TEXT NOT NULL
	);`,
}

// Migrate applies all pending migrations sequentially, each in a single
// transaction together with the user_version bump.
func (s *Store) Migrate(ctx context.Context) error {
	var version int
	if err := s.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("read user_version: %w", err)
	}
	for i := version; i < len(migrations); i++ {
		if err := s.applyMigration(ctx, i); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) applyMigration(ctx context.Context, index int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration %d: %w", index+1, err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, migrations[index]); err != nil {
		return fmt.Errorf("apply migration %d: %w", index+1, err)
	}
	if _, err := tx.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", index+1)); err != nil {
		return fmt.Errorf("set user_version to %d: %w", index+1, err)
	}
	return tx.Commit()
}
