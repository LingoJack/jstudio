// Package storage abstracts the S3-compatible object storage (MinIO) behind
// a small interface so tests can run without a live MinIO server.
package storage

import (
	"context"
	"errors"
	"io"
)

// ErrObjectNotFound is returned by Get when the object does not exist.
var ErrObjectNotFound = errors.New("object not found")

// ObjectStorage is the object storage contract used by the API layer.
type ObjectStorage interface {
	// Put stores the object read from r. size is the exact byte count.
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error
	// Get opens the object for streaming; the caller must Close it.
	// A missing object yields ErrObjectNotFound.
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	// Delete removes the object. S3 semantics: deleting a missing object
	// is not an error.
	Delete(ctx context.Context, key string) error
	// EnsureBucket creates the bucket if it does not exist yet.
	EnsureBucket(ctx context.Context) error
}
