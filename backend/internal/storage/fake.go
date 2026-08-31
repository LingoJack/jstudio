package storage

import (
	"bytes"
	"context"
	"io"
	"sync"
)

// MemStorage is an in-memory ObjectStorage for tests.
type MemStorage struct {
	mu      sync.RWMutex
	objects map[string]memObject
	bucket  bool
}

type memObject struct {
	data        []byte
	contentType string
}

// NewMemStorage returns an empty in-memory storage.
func NewMemStorage() *MemStorage {
	return &MemStorage{objects: make(map[string]memObject)}
}

func (m *MemStorage) Put(_ context.Context, key string, r io.Reader, _ int64, contentType string) error {
	data, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = memObject{data: data, contentType: contentType}
	return nil
}

func (m *MemStorage) Get(_ context.Context, key string) (io.ReadCloser, error) {
	m.mu.RLock()
	obj, ok := m.objects[key]
	m.mu.RUnlock()
	if !ok {
		return nil, ErrObjectNotFound
	}
	return io.NopCloser(bytes.NewReader(obj.data)), nil
}

func (m *MemStorage) Delete(_ context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, key)
	return nil
}

func (m *MemStorage) EnsureBucket(_ context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.bucket = true
	return nil
}
