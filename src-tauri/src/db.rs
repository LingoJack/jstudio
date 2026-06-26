//! SQLite database layer.
//!
//! Provides a single global [`Connection`] guarded by a [`Mutex`], plus a
//! one-time migration that imports legacy JSON files (`index.json`,
//! `folders.json`, `settings.json`) into the database.
//!
//! The database lives at `~/.jdata/studio/studio.db`. WAL journal mode is
//! enabled for better read concurrency (the main window and preview windows
//! may both read).

use rusqlite::Connection;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

// ────────────────────────────────────────────────
// Path helpers (mirror commands/storage.rs)
// ────────────────────────────────────────────────

fn studio_dir() -> PathBuf {
    let home = dirs::home_dir().expect("cannot determine home directory");
    home.join(".jdata").join("studio")
}

fn db_path() -> PathBuf {
    studio_dir().join("studio.db")
}

fn index_path() -> PathBuf {
    studio_dir().join("index.json")
}

fn settings_path() -> PathBuf {
    studio_dir().join("settings.json")
}

fn folders_path() -> PathBuf {
    studio_dir().join("folders.json")
}

// ────────────────────────────────────────────────
// Global connection
// ────────────────────────────────────────────────

/// Global database connection, lazily opened on first access.
///
/// Opening also triggers [`init_db`] (DDL + migration) so that by the time
/// any command touches the database the schema is guaranteed to exist.
static DB: LazyLock<Mutex<Connection>> = LazyLock::new(|| {
    let conn = open_and_init();
    Mutex::new(conn)
});

/// Open the database connection, configure pragmas, create tables, and run
/// the one-time JSON migration.
fn open_and_init() -> Connection {
    // Ensure parent directory exists.
    let _ = fs::create_dir_all(studio_dir());

    let path = db_path();
    let mut conn = Connection::open(&path)
        .unwrap_or_else(|e| panic!("failed to open studio.db at {}: {e}", path.display()));

    // Enable WAL for better read concurrency.
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    // Normal synchronous level — good balance of safety and speed under WAL.
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    // Foreign keys ON so that folder deletion cascades etc. work.
    let _ = conn.pragma_update(None, "foreign_keys", "ON");

    // Create tables.
    create_tables(&conn);

    // One-time migration from legacy JSON files.
    migrate_from_json(&mut conn);

    conn
}

// ────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────

/// Acquire the global database connection lock.
///
/// All database access in the codebase goes through this function, which
/// serializes access through the `Mutex`.
pub fn db() -> Result<std::sync::MutexGuard<'static, Connection>, String> {
    DB.lock().map_err(|e| format!("db lock poisoned: {e}"))
}

/// Explicitly trigger initialisation.  Safe to call multiple times — the
/// `LazyLock` guarantees the connection is opened only once.
pub fn init_db() -> Result<(), String> {
    // Touch the global to force lazy init.
    let _guard = db()?;
    Ok(())
}

// ────────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────────

fn create_tables(conn: &Connection) {
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
            updated_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
        CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);

        -- Folder tree (replaces folders.json)
        CREATE TABLE IF NOT EXISTS folders (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            parent_id  TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            collapsed  INTEGER NOT NULL DEFAULT 0
        );

        -- Application settings (replaces settings.json)
        -- Each row is one key; value is JSON-encoded (string, number, array, object…).
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
    .unwrap_or_else(|e| panic!("failed to create studio.db tables: {e}"));
}

// ────────────────────────────────────────────────
// One-time JSON → SQLite migration
// ────────────────────────────────────────────────

/// Check whether a table has zero rows.
fn table_is_empty(conn: &Connection, table: &str) -> bool {
    let count: i64 = conn
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap_or(0);
    count == 0
}

/// Migrate legacy JSON files into the database.
///
/// Each source file is only imported when the target table is still empty
/// (idempotent). After a successful import the original file is renamed to
/// `*.json.bak` so it serves as a manual-recovery backup.
fn migrate_from_json(conn: &mut Connection) {
    // ── index.json → documents ──
    let idx = index_path();
    if idx.exists() && table_is_empty(conn, "documents") {
        if let Ok(data) = fs::read_to_string(&idx) {
            if let Ok(arr) = serde_json::from_str::<Value>(&data) {
                if let Some(entries) = arr.as_array() {
                    let tx = conn
                        .transaction()
                        .unwrap_or_else(|e| panic!("migration tx (documents): {e}"));
                    for entry in entries {
                        let id = entry["id"].as_str().unwrap_or("").to_string();
                        if id.is_empty() {
                            continue;
                        }
                        let title = entry["title"].as_str().unwrap_or("").to_string();
                        let emoji = entry["emoji"].as_str().unwrap_or("").to_string();
                        let folder_id = entry["folderId"].as_str().map(|s| s.to_string());
                        let is_favorite = if entry["isFavorite"].as_bool() == Some(true) {
                            1
                        } else {
                            0
                        };
                        let created_at = entry["createdAt"].as_str().unwrap_or("").to_string();
                        let updated_at = entry["updatedAt"].as_str().unwrap_or("").to_string();

                        let _ = tx.execute(
                            "INSERT OR REPLACE INTO documents \
                             (id, title, emoji, folder_id, is_favorite, created_at, updated_at) \
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                            rusqlite::params![
                                id,
                                title,
                                emoji,
                                folder_id,
                                is_favorite,
                                created_at,
                                updated_at
                            ],
                        );
                    }
                    let _ = tx.commit();
                    // Rename to backup.
                    let _ = fs::rename(&idx, idx.with_extension("json.bak"));
                }
            }
        }
    }

    // ── folders.json → folders ──
    let fpath = folders_path();
    if fpath.exists() && table_is_empty(conn, "folders") {
        if let Ok(data) = fs::read_to_string(&fpath) {
            if let Ok(arr) = serde_json::from_str::<Value>(&data) {
                if let Some(entries) = arr.as_array() {
                    let tx = conn
                        .transaction()
                        .unwrap_or_else(|e| panic!("migration tx (folders): {e}"));
                    for entry in entries {
                        let id = entry["id"].as_str().unwrap_or("").to_string();
                        if id.is_empty() {
                            continue;
                        }
                        let name = entry["name"].as_str().unwrap_or("").to_string();
                        let parent_id = entry["parentId"].as_str().map(|s| s.to_string());
                        let sort_order = entry["sortOrder"].as_i64().unwrap_or(0);
                        let collapsed = if entry["collapsed"].as_bool() == Some(true) {
                            1
                        } else {
                            0
                        };

                        let _ = tx.execute(
                            "INSERT OR REPLACE INTO folders \
                             (id, name, parent_id, sort_order, collapsed) \
                             VALUES (?1, ?2, ?3, ?4, ?5)",
                            rusqlite::params![id, name, parent_id, sort_order, collapsed],
                        );
                    }
                    let _ = tx.commit();
                    let _ = fs::rename(&fpath, fpath.with_extension("json.bak"));
                }
            }
        }
    }

    // ── settings.json → settings ──
    let spath = settings_path();
    if spath.exists() && table_is_empty(conn, "settings") {
        if let Ok(data) = fs::read_to_string(&spath) {
            if let Ok(obj) = serde_json::from_str::<Value>(&data) {
                if let Some(map) = obj.as_object() {
                    let tx = conn
                        .transaction()
                        .unwrap_or_else(|e| panic!("migration tx (settings): {e}"));
                    for (key, val) in map {
                        let value_str =
                            serde_json::to_string(val).unwrap_or_else(|_| "null".into());
                        let _ = tx.execute(
                            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                            rusqlite::params![key, value_str],
                        );
                    }
                    let _ = tx.commit();
                    let _ = fs::rename(&spath, spath.with_extension("json.bak"));
                }
            }
        }
    }
}
