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
	// v2: documents and their snapshot history. All document data is scoped
	// by (user_id, doc_id): doc ids come from clients and only have to be
	// unique per user. latest_revision = 0 means assets were uploaded but no
	// snapshot was saved yet. deleted_at is the tombstone (NULL = alive);
	// a tombstoned document is revived by appending a new snapshot.
	`CREATE TABLE documents (
		user_id         TEXT NOT NULL REFERENCES users(id),
		doc_id          TEXT NOT NULL,
		latest_revision INTEGER NOT NULL DEFAULT 0,
		deleted_at      TEXT,
		created_at      TEXT NOT NULL,
		updated_at      TEXT NOT NULL,
		PRIMARY KEY (user_id, doc_id)
	);
	CREATE INDEX idx_documents_user_updated ON documents(user_id, updated_at DESC);
	CREATE TABLE document_snapshots (
		user_id    TEXT NOT NULL,
		doc_id     TEXT NOT NULL,
		revision   INTEGER NOT NULL CHECK (revision > 0),
		title      TEXT NOT NULL DEFAULT '',
		body       TEXT NOT NULL,
		size_bytes INTEGER NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (user_id, doc_id, revision),
		FOREIGN KEY (user_id, doc_id) REFERENCES documents(user_id, doc_id)
	);
	CREATE INDEX idx_snapshots_doc_created ON document_snapshots(user_id, doc_id, created_at DESC);`,
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
