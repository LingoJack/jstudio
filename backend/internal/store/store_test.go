package store

import (
	"context"
	"path/filepath"
	"testing"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	st, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	if err := st.Migrate(context.Background()); err != nil {
		t.Fatalf("migrate store: %v", err)
	}
	return st
}

// TestMigrateIdempotent asserts that running Migrate on an already migrated
// database is a no-op (the version runner must not re-apply DDL, which would
// fail loudly since the statements lack IF NOT EXISTS).
func TestMigrateIdempotent(t *testing.T) {
	st := openTestStore(t)
	if err := st.Migrate(context.Background()); err != nil {
		t.Fatalf("re-migrate: %v", err)
	}
}

func TestCreateAndGetUser(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	created, err := st.CreateUser(ctx, "user-1", "Jack", "hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if created.CreatedAt == "" || created.UpdatedAt == "" {
		t.Fatalf("timestamps not set: %+v", created)
	}

	// Case-insensitive lookup (username column is COLLATE NOCASE).
	got, err := st.GetUserByUsername(ctx, "jack")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if got.ID != "user-1" || got.Username != "Jack" {
		t.Fatalf("unexpected user: %+v", got)
	}

	if _, err := st.CreateUser(ctx, "user-2", "JACK", "hash2"); err != ErrUsernameTaken {
		t.Fatalf("duplicate username: got %v, want ErrUsernameTaken", err)
	}

	if _, err := st.GetUserByUsername(ctx, "ghost"); err != ErrNotFound {
		t.Fatalf("unknown user: got %v, want ErrNotFound", err)
	}
}
