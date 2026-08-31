package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// defaultRegion must be passed explicitly when creating a bucket: some
// S3-compatible implementations reject region-less requests.
const defaultRegion = "us-east-1"

// EnsureBucket retries because MinIO may start after the backend under
// podman-compose, which does not reliably honor healthcheck ordering.
const (
	bucketRetryAttempts = 30
	bucketRetryInterval = 2 * time.Second
)

// MinioStorage is the ObjectStorage implementation backed by MinIO (or any
// S3-compatible endpoint).
type MinioStorage struct {
	client *minio.Client
	bucket string
}

// NewMinioStorage builds the client; no network traffic happens here.
func NewMinioStorage(endpoint, accessKey, secretKey, bucket string, useSSL bool) (*MinioStorage, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}
	return &MinioStorage{client: client, bucket: bucket}, nil
}

func (m *MinioStorage) EnsureBucket(ctx context.Context) error {
	logger := slog.Default()
	var lastErr error
	for attempt := 1; attempt <= bucketRetryAttempts; attempt++ {
		exists, err := m.client.BucketExists(ctx, m.bucket)
		if err == nil {
			if exists {
				return nil
			}
			err = m.client.MakeBucket(ctx, m.bucket, minio.MakeBucketOptions{Region: defaultRegion})
			if err == nil {
				logger.Info("bucket created", "bucket", m.bucket)
				return nil
			}
			// A concurrent startup may have created it in between.
			var resp minio.ErrorResponse
			if errors.As(err, &resp) && resp.Code == "BucketAlreadyOwnedByYou" {
				return nil
			}
		}
		lastErr = err
		logger.Warn("waiting for object storage", "bucket", m.bucket, "attempt", attempt, "error", lastErr)
		select {
		case <-ctx.Done():
			return fmt.Errorf("ensure bucket %q canceled: %w", m.bucket, ctx.Err())
		case <-time.After(bucketRetryInterval):
		}
	}
	return fmt.Errorf("ensure bucket %q after %d attempts: %w", m.bucket, bucketRetryAttempts, lastErr)
}

func (m *MinioStorage) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	_, err := m.client.PutObject(ctx, m.bucket, key, r, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("put object %s: %w", key, err)
	}
	return nil
}

func (m *MinioStorage) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	obj, err := m.client.GetObject(ctx, m.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("get object %s: %w", key, err)
	}
	// minio-go GetObject is lazy: Stat forces the first request so a missing
	// object surfaces here instead of mid-stream in the handler.
	if _, err := obj.Stat(); err != nil {
		obj.Close()
		var resp minio.ErrorResponse
		if errors.As(err, &resp) && resp.Code == "NoSuchKey" {
			return nil, ErrObjectNotFound
		}
		return nil, fmt.Errorf("stat object %s: %w", key, err)
	}
	return obj, nil
}

func (m *MinioStorage) Delete(ctx context.Context, key string) error {
	if err := m.client.RemoveObject(ctx, m.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("remove object %s: %w", key, err)
	}
	return nil
}
