//! Database schema — table creation and incremental migrations.
//!
//! Creates all tables (`documents`, `folders`, `settings`, `deleted_documents`,
//! `trashed_assets`) with their indexes, and handles incremental schema
//! migrations for existing databases (adding columns that didn't exist in
//! earlier versions).

use rusqlite::Connection;

/// Create all tables and indexes. Idempotent (uses `IF NOT EXISTS`).
pub fn create_tables(conn: &Connection) {
    conn.execute_batch(
        r#"
        -- Document metadata (replaces index.json)
        CREATE TABLE IF NOT EXISTS documents (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT '',
            emoji       TEXT NOT NULL DEFAULT '',
            folder_id   TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            trashed_at  TEXT,
            body        TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
        CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);

        -- Folder tree (replaces folders.json)
        CREATE TABLE IF NOT EXISTS folders (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            parent_id  TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            collapsed  INTEGER NOT NULL DEFAULT 0,
            trashed_at TEXT
        );

        -- Application settings (replaces settings.json)
        -- Each row is one key; value is JSON-encoded (string, number, array, object…).
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Tombstones for permanently deleted documents (replaces index.json)
        -- When a document is deleted via delete_document, its id is recorded here.
        -- reconcile_orphan_documents checks this table to avoid resurrecting
        -- documents the user already deleted.
        CREATE TABLE IF NOT EXISTS deleted_documents (
            id        TEXT PRIMARY KEY,
            deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Trashed document-private assets (per-document recycle bin).
        -- When an asset is no longer referenced by its document, it is moved
        -- from `documents/{doc_id}/assets/` into `documents/{doc_id}/.trash/`
        -- and recorded here so the UI can list / restore / permanently delete
        -- it. `trash_name` is the file's name inside `.trash/`; `original_name`
        -- is the name to restore back into `assets/`.
        CREATE TABLE IF NOT EXISTS trashed_assets (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id        TEXT NOT NULL,
            trash_name    TEXT NOT NULL,
            original_name TEXT NOT NULL,
            mime          TEXT NOT NULL DEFAULT '',
            size_bytes    INTEGER NOT NULL DEFAULT 0,
            trashed_at    TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trashed_assets_doc ON trashed_assets(doc_id);
        "#,
    )
    .unwrap_or_else(|e| panic!("failed to create studio.db tables: {e}"));

    // ── Incremental schema migrations ──

    // Add `trashed_at` to documents if it doesn't exist.
    ensure_column(conn, "documents", "trashed_at", "TEXT");

    // Add `body` to documents if it doesn't exist.
    ensure_column(conn, "documents", "body", "TEXT");

    // Add `trashed_at` to folders if it doesn't exist.
    ensure_column(conn, "folders", "trashed_at", "TEXT");
}

/// Add a column to a table if it doesn't already exist.
fn ensure_column(conn: &Connection, table: &str, column: &str, col_type: &str) {
    let has_column: bool = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| {
                let name: String = row.get(1)?;
                Ok(name)
            })?;
            for row in rows {
                if row? == column {
                    return Ok(true);
                }
            }
            Ok(false)
        })
        .unwrap_or(false);

    if !has_column {
        let _ = conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {col_type}"),
            [],
        );
    }
}
