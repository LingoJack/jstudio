// Package testsupport provisions disposable MySQL schemas for tests. It is
// imported only from _test.go files and never linked into the binary.
//
// The admin DSN is taken from JS_TEST_MYSQL_DSN
// (e.g. "user:pass@tcp(host:3306)/", no database). Tests are skipped when it
// is unset so `go test ./...` still passes without a reachable MySQL.
package testsupport

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	gomysql "github.com/go-sql-driver/mysql"

	"github.com/LingoJack/jstudio/backend/internal/store"
)

// envTestDSN names the environment variable holding the admin DSN.
const envTestDSN = "JS_TEST_MYSQL_DSN"

// schemaPath is relative to the *consuming package's* directory (go test runs
// with the package dir as cwd); both internal/store and internal/api are two
// levels below backend/, so the same path serves both.
const schemaPath = "../../schema.sql"

// testDBNamePrefix marks every disposable database the harness creates.
const testDBNamePrefix = "jstudio_test_"

// NewStore opens a store on a freshly created, schema-initialized, disposable
// database and registers cleanup. Skips the test when the env DSN is unset.
func NewStore(t *testing.T) *store.Store {
	t.Helper()

	ddl, err := SchemaDDL()
	if err != nil {
		t.Fatalf("read schema: %v", err)
	}
	st, cleanup := newStoreOnFreshDB(t)
	t.Cleanup(cleanup)
	if err := st.ApplySchemaDDL(context.Background(), ddl); err != nil {
		t.Fatalf("apply schema: %v", err)
	}
	return st
}

// NewEmptyStore opens a store on a freshly created database WITHOUT applying
// the schema, plus a cleanup func for callers that prefer defer. Skips the
// test when the env DSN is unset.
func NewEmptyStore(t *testing.T) (*store.Store, func()) {
	t.Helper()
	return newStoreOnFreshDB(t)
}

// SchemaDDL reads the operator-facing schema.sql — the single source of truth
// shared by production (manual execution) and tests.
func SchemaDDL() (string, error) {
	b, err := os.ReadFile(schemaPath)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", schemaPath, err)
	}
	return string(b), nil
}

// newStoreOnFreshDB creates the disposable database and opens a store on it.
// Cleanup is NOT registered here; the caller registers or defers it.
func newStoreOnFreshDB(t *testing.T) (*store.Store, func()) {
	t.Helper()

	adminDSN := os.Getenv(envTestDSN)
	if adminDSN == "" {
		t.Skipf("%s not set; skipping MySQL-backed tests", envTestDSN)
	}
	admin, err := sql.Open("mysql", adminDSN)
	if err != nil {
		t.Fatalf("open admin connection: %v", err)
	}

	dbName := fmt.Sprintf("%s%d", testDBNamePrefix, time.Now().UnixNano())
	if _, err := admin.Exec("CREATE DATABASE " + dbName + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"); err != nil {
		admin.Close()
		t.Fatalf("create test database: %v", err)
	}

	st, err := store.Open(dsnForDatabase(adminDSN, dbName, true))
	if err != nil {
		admin.Exec("DROP DATABASE IF EXISTS " + dbName)
		admin.Close()
		t.Fatalf("open store: %v", err)
	}

	cleanup := func() {
		st.Close()
		admin.Exec("DROP DATABASE IF EXISTS " + dbName)
		admin.Close()
	}
	return st, cleanup
}

// dsnForDatabase clones the admin DSN with a database selected, optionally
// enabling multi-statement execution (needed for schema.sql).
func dsnForDatabase(adminDSN, dbName string, multiStatements bool) string {
	cfg, err := gomysql.ParseDSN(adminDSN)
	if err != nil {
		panic(fmt.Sprintf("parse admin dsn: %v", err))
	}
	cfg.DBName = dbName
	cfg.MultiStatements = multiStatements
	return cfg.FormatDSN()
}
