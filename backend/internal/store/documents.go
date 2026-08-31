package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// DocumentMeta is a documents row joined with its latest snapshot title.
type DocumentMeta struct {
	DocID          string
	Title          string
	LatestRevision int64
	CreatedAt      string
	UpdatedAt      string
}

// Snapshot is one saved document revision including the body payload.
type Snapshot struct {
	DocID     string
	Revision  int64
	Title     string
	Body      string
	SizeBytes int64
	CreatedAt string
}

// SnapshotMeta is the history-list projection without the body payload.
type SnapshotMeta struct {
	Revision  int64
	Title     string
	SizeBytes int64
	CreatedAt string
}

// AppendSnapshot atomically appends revision latest+1. Appending to a
// tombstoned document revives it (deleted_at = NULL) and the revision
// counter continues where it left off. The documents row is created on
// first save.
func (s *Store) AppendSnapshot(ctx context.Context, userID, docID, title, body string) (Snapshot, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Snapshot{}, fmt.Errorf("begin append snapshot: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC().Format(time.RFC3339)
	var latest int64
	err = tx.QueryRowContext(ctx, `
		SELECT latest_revision FROM documents WHERE user_id = ? AND doc_id = ?`,
		userID, docID).Scan(&latest)
	if errors.Is(err, sql.ErrNoRows) {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO documents (user_id, doc_id, latest_revision, deleted_at, created_at, updated_at)
			VALUES (?, ?, 0, NULL, ?, ?)`,
			userID, docID, now, now); err != nil {
			return Snapshot{}, fmt.Errorf("insert document: %w", err)
		}
	} else if err != nil {
		return Snapshot{}, fmt.Errorf("select document: %w", err)
	}

	snap := Snapshot{
		DocID:     docID,
		Revision:  latest + 1,
		Title:     title,
		Body:      body,
		SizeBytes: int64(len(body)),
		CreatedAt: now,
	}
	if _, err = tx.ExecContext(ctx, `
		UPDATE documents SET latest_revision = ?, deleted_at = NULL, updated_at = ?
		WHERE user_id = ? AND doc_id = ?`,
		snap.Revision, now, userID, docID); err != nil {
		return Snapshot{}, fmt.Errorf("bump latest_revision: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO document_snapshots (user_id, doc_id, revision, title, body, size_bytes, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		userID, docID, snap.Revision, snap.Title, snap.Body, snap.SizeBytes, snap.CreatedAt); err != nil {
		return Snapshot{}, fmt.Errorf("insert snapshot: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return Snapshot{}, fmt.Errorf("commit append snapshot: %w", err)
	}
	return snap, nil
}

// LatestSnapshot returns the newest snapshot of a live document. It returns
// ErrNotFound when the document is missing, tombstoned, or has no snapshots
// yet (latest_revision = 0, assets-only document).
func (s *Store) LatestSnapshot(ctx context.Context, userID, docID string) (Snapshot, error) {
	var snap Snapshot
	err := s.db.QueryRowContext(ctx, `
		SELECT s.doc_id, s.revision, s.title, s.body, s.size_bytes, s.created_at
		FROM documents d
		JOIN document_snapshots s
		  ON s.user_id = d.user_id AND s.doc_id = d.doc_id AND s.revision = d.latest_revision
		WHERE d.user_id = ? AND d.doc_id = ? AND d.deleted_at IS NULL`,
		userID, docID,
	).Scan(&snap.DocID, &snap.Revision, &snap.Title, &snap.Body, &snap.SizeBytes, &snap.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Snapshot{}, ErrNotFound
	}
	if err != nil {
		return Snapshot{}, fmt.Errorf("query latest snapshot: %w", err)
	}
	return snap, nil
}

// GetSnapshot returns one historical snapshot of a live document.
func (s *Store) GetSnapshot(ctx context.Context, userID, docID string, revision int64) (Snapshot, error) {
	var snap Snapshot
	err := s.db.QueryRowContext(ctx, `
		SELECT s.doc_id, s.revision, s.title, s.body, s.size_bytes, s.created_at
		FROM document_snapshots s
		JOIN documents d ON d.user_id = s.user_id AND d.doc_id = s.doc_id
		WHERE s.user_id = ? AND s.doc_id = ? AND s.revision = ? AND d.deleted_at IS NULL`,
		userID, docID, revision,
	).Scan(&snap.DocID, &snap.Revision, &snap.Title, &snap.Body, &snap.SizeBytes, &snap.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Snapshot{}, ErrNotFound
	}
	if err != nil {
		return Snapshot{}, fmt.Errorf("query snapshot: %w", err)
	}
	return snap, nil
}

// ListSnapshots returns up to limit snapshot metadata entries (newest first)
// and the total snapshot count of a live document.
func (s *Store) ListSnapshots(ctx context.Context, userID, docID string, limit int) ([]SnapshotMeta, int, error) {
	var exists int
	err := s.db.QueryRowContext(ctx, `
		SELECT 1 FROM documents WHERE user_id = ? AND doc_id = ? AND deleted_at IS NULL`,
		userID, docID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, 0, ErrNotFound
	}
	if err != nil {
		return nil, 0, fmt.Errorf("check document: %w", err)
	}

	var total int
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM document_snapshots WHERE user_id = ? AND doc_id = ?`,
		userID, docID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count snapshots: %w", err)
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT revision, title, size_bytes, created_at
		FROM document_snapshots WHERE user_id = ? AND doc_id = ?
		ORDER BY revision DESC LIMIT ?`,
		userID, docID, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("list snapshots: %w", err)
	}
	defer rows.Close()

	metas := make([]SnapshotMeta, 0)
	for rows.Next() {
		var m SnapshotMeta
		if err := rows.Scan(&m.Revision, &m.Title, &m.SizeBytes, &m.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan snapshot meta: %w", err)
		}
		metas = append(metas, m)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate snapshots: %w", err)
	}
	return metas, total, nil
}

// ListDocuments returns all live documents of a user, newest first. Documents
// with latest_revision = 0 (assets only) are included.
func (s *Store) ListDocuments(ctx context.Context, userID string) ([]DocumentMeta, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT d.doc_id, COALESCE(s.title, ''), d.latest_revision, d.created_at, d.updated_at
		FROM documents d
		LEFT JOIN document_snapshots s
		  ON s.user_id = d.user_id AND s.doc_id = d.doc_id AND s.revision = d.latest_revision
		WHERE d.user_id = ? AND d.deleted_at IS NULL
		ORDER BY d.updated_at DESC`,
		userID)
	if err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}
	defer rows.Close()

	docs := make([]DocumentMeta, 0)
	for rows.Next() {
		var d DocumentMeta
		if err := rows.Scan(&d.DocID, &d.Title, &d.LatestRevision, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan document meta: %w", err)
		}
		docs = append(docs, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate documents: %w", err)
	}
	return docs, nil
}

// TombstoneDocument marks a live document deleted. Repeated deletes of the
// same document return ErrNotFound.
func (s *Store) TombstoneDocument(ctx context.Context, userID, docID string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.ExecContext(ctx, `
		UPDATE documents SET deleted_at = ?, updated_at = ?
		WHERE user_id = ? AND doc_id = ? AND deleted_at IS NULL`,
		now, now, userID, docID)
	if err != nil {
		return fmt.Errorf("tombstone document: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("tombstone document rows: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
