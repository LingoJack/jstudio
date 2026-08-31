package store_test

import (
	"context"
	"testing"

	"github.com/LingoJack/jstudio/backend/internal/store"
	"github.com/LingoJack/jstudio/backend/internal/testsupport"
)

// TestSchemaIdempotent re-applies schema.sql to an initialized database: all
// statements use IF NOT EXISTS, so the operator can safely re-run the file.
func TestSchemaIdempotent(t *testing.T) {
	st := testsupport.NewStore(t)
	ddl, err := testsupport.SchemaDDL()
	if err != nil {
		t.Fatalf("read schema: %v", err)
	}
	if err := st.ApplySchemaDDL(context.Background(), ddl); err != nil {
		t.Fatalf("re-apply schema: %v", err)
	}
	if err := st.CheckSchema(context.Background()); err != nil {
		t.Fatalf("check schema: %v", err)
	}
}

// TestCheckSchemaDetectsMissingTables connects to an empty database and
// expects CheckSchema to fail with the operator-facing message.
func TestCheckSchemaDetectsMissingTables(t *testing.T) {
	st, cleanup := testsupport.NewEmptyStore(t)
	defer cleanup()
	if err := st.CheckSchema(context.Background()); err == nil {
		t.Fatal("check schema on empty database: expected error")
	}
}

func TestCreateAndGetUser(t *testing.T) {
	st := testsupport.NewStore(t)
	ctx := context.Background()

	created, err := st.CreateUser(ctx, "user-1", "Jack", "hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if created.CreatedAt == "" || created.UpdatedAt == "" {
		t.Fatalf("timestamps not set: %+v", created)
	}

	// Case-insensitive lookup (utf8mb4_0900_ai_ci collation).
	got, err := st.GetUserByUsername(ctx, "jack")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if got.ID != "user-1" || got.Username != "Jack" {
		t.Fatalf("unexpected user: %+v", got)
	}

	if _, err := st.CreateUser(ctx, "user-2", "JACK", "hash2"); err != store.ErrUsernameTaken {
		t.Fatalf("duplicate username: got %v, want ErrUsernameTaken", err)
	}

	if _, err := st.GetUserByUsername(ctx, "ghost"); err != store.ErrNotFound {
		t.Fatalf("unknown user: got %v, want ErrNotFound", err)
	}
}
