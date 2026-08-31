package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Asset is one binary resource (image etc.) attached to a document. The
// payload itself lives in object storage under ObjectKey.
type Asset struct {
	DocID       string
	FileName    string
	ContentType string
	SizeBytes   int64
	ObjectKey   string
	CreatedAt   string
	UpdatedAt   string
}

// UpsertAsset inserts or overwrites the metadata row for (user_id, doc_id,
// file_name) and creates/revives the documents row on demand. The caller
// must have uploaded the object to storage already: an orphan object is
// acceptable, an orphan row is not (downloads would 404).
func (s *Store) UpsertAsset(ctx context.Context, userID string, a Asset) (Asset, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Asset{}, fmt.Errorf("begin upsert asset: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC().Format(time.RFC3339)
	// Ensure the documents row exists and revive it if tombstoned. MySQL
	// row alias (AS new) requires 8.0.19+.
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO documents (user_id, doc_id, latest_revision, deleted_at, created_at, updated_at)
		VALUES (?, ?, 0, NULL, ?, ?) AS new
		ON DUPLICATE KEY UPDATE deleted_at = NULL, updated_at = new.updated_at`,
		userID, a.DocID, now, now); err != nil {
		return Asset{}, fmt.Errorf("ensure document: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO assets (user_id, doc_id, file_name, content_type, size_bytes, object_key, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?) AS new
		ON DUPLICATE KEY UPDATE
			content_type = new.content_type,
			size_bytes   = new.size_bytes,
			object_key   = new.object_key,
			updated_at   = new.updated_at`,
		userID, a.DocID, a.FileName, a.ContentType, a.SizeBytes, a.ObjectKey, now, now); err != nil {
		return Asset{}, fmt.Errorf("upsert asset: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return Asset{}, fmt.Errorf("commit upsert asset: %w", err)
	}
	return Asset{
		DocID:       a.DocID,
		FileName:    a.FileName,
		ContentType: a.ContentType,
		SizeBytes:   a.SizeBytes,
		ObjectKey:   a.ObjectKey,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

// GetAsset returns the metadata of one asset of a live document.
func (s *Store) GetAsset(ctx context.Context, userID, docID, fileName string) (Asset, error) {
	var a Asset
	err := s.db.QueryRowContext(ctx, `
		SELECT a.doc_id, a.file_name, a.content_type, a.size_bytes, a.object_key, a.created_at, a.updated_at
		FROM assets a
		JOIN documents d ON d.user_id = a.user_id AND d.doc_id = a.doc_id
		WHERE a.user_id = ? AND a.doc_id = ? AND a.file_name = ? AND d.deleted_at IS NULL`,
		userID, docID, fileName,
	).Scan(&a.DocID, &a.FileName, &a.ContentType, &a.SizeBytes, &a.ObjectKey, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	if err != nil {
		return Asset{}, fmt.Errorf("query asset: %w", err)
	}
	return a, nil
}

// ListAssets returns all assets of a live document ordered by file name.
func (s *Store) ListAssets(ctx context.Context, userID, docID string) ([]Asset, error) {
	var exists int
	err := s.db.QueryRowContext(ctx, `
		SELECT 1 FROM documents WHERE user_id = ? AND doc_id = ? AND deleted_at IS NULL`,
		userID, docID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("check document: %w", err)
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT doc_id, file_name, content_type, size_bytes, object_key, created_at, updated_at
		FROM assets WHERE user_id = ? AND doc_id = ?
		ORDER BY file_name`,
		userID, docID)
	if err != nil {
		return nil, fmt.Errorf("list assets: %w", err)
	}
	defer rows.Close()

	assets := make([]Asset, 0)
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.DocID, &a.FileName, &a.ContentType, &a.SizeBytes, &a.ObjectKey, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan asset: %w", err)
		}
		assets = append(assets, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate assets: %w", err)
	}
	return assets, nil
}

// DeleteAsset removes the metadata row of an asset of a live document.
// Callers then delete the object (best effort: an orphan object is fine).
func (s *Store) DeleteAsset(ctx context.Context, userID, docID, fileName string) error {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM assets
		WHERE user_id = ? AND doc_id = ? AND file_name = ?
		  AND EXISTS (SELECT 1 FROM documents d
		              WHERE d.user_id = assets.user_id AND d.doc_id = assets.doc_id
		                AND d.deleted_at IS NULL)`,
		userID, docID, fileName)
	if err != nil {
		return fmt.Errorf("delete asset: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete asset rows: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
