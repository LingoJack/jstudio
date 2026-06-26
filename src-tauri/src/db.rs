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

fn documents_dir() -> PathBuf {
    studio_dir().join("documents")
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

    // Recover documents that exist on disk but were never registered in the
    // index (orphans). See [`reconcile_orphan_documents`].
    reconcile_orphan_documents(&mut conn);

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

// ────────────────────────────────────────────────
// Orphan document recovery
// ────────────────────────────────────────────────

/// Extract the first piece of real text content from a document's `blocks`
/// array. Returns an empty string if the document has no textual content.
///
/// A block's text lives either in a plain `content` string, or in a
/// `content` array of `{ text, annotations }` rich-text spans (the editor's
/// native format), or in `properties.text`.
fn block_text_preview(blocks: &Value) -> String {
    let Some(arr) = blocks.as_array() else {
        return String::new();
    };
    for b in arr {
        // content: "..."
        if let Some(s) = b["content"].as_str() {
            if !s.trim().is_empty() {
                return s.trim().to_string();
            }
        }
        // content: [{ text: "..." }, ...]
        if let Some(spans) = b["content"].as_array() {
            let joined: String = spans
                .iter()
                .filter_map(|sp| sp["text"].as_str())
                .collect::<String>();
            if !joined.trim().is_empty() {
                return joined.trim().to_string();
            }
        }
        // properties.text: "..."
        if let Some(s) = b["properties"]["text"].as_str() {
            if !s.trim().is_empty() {
                return s.trim().to_string();
            }
        }
    }
    String::new()
}

/// Scan the `documents/` directory for documents that exist on disk but are
/// not present in the `documents` table, and register the meaningful ones.
///
/// This is the root-cause fix for documents that were "lost" during the
/// JSON → SQLite migration: the migration only imported entries listed in
/// `index.json`, but the filesystem can contain document folders that were
/// never indexed (e.g. created then never saved into the index). Their
/// `document.json` files survive untouched — they simply have no entry point
/// in the UI.
///
/// We deliberately **skip completely blank documents** (no title *and* no
/// textual block content), so empty throwaway drafts don't clutter the
/// sidebar. Documents with a title or any real content are recovered, with
/// metadata read from their own `document.json`.
fn reconcile_orphan_documents(conn: &mut Connection) {
    let docs_dir = documents_dir();
    let Ok(read) = fs::read_dir(&docs_dir) else {
        return;
    };

    // Sort directory entries by id so iteration is deterministic. Document ids
    // embed a creation timestamp (`doc-<ms>`), so ascending id order means the
    // *earliest* of any duplicate pair is the one that gets recovered.
    let mut dir_entries: Vec<PathBuf> = read.flatten().map(|e| e.path()).collect();
    dir_entries.sort();

    // Collect orphan rows first so we don't hold the read_dir iterator across
    // the transaction.
    let mut orphans: Vec<(String, String, String, String, String)> = Vec::new();
    // Fingerprints of orphan bodies already queued, so two orphans with
    // byte-identical content (e.g. an accidental duplicate save) only recover
    // once.
    let mut seen_bodies: std::collections::HashSet<String> = std::collections::HashSet::new();

    for path in dir_entries {
        if !path.is_dir() {
            continue;
        }
        let doc_id = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if doc_id.is_empty() {
            continue;
        }

        // Already registered? Skip.
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM documents WHERE id = ?1",
                rusqlite::params![doc_id],
                |_| Ok(()),
            )
            .is_ok();
        if exists {
            continue;
        }

        // Read the document body.
        let doc_json = path.join("document.json");
        let Ok(data) = fs::read_to_string(&doc_json) else {
            continue;
        };
        let Ok(doc) = serde_json::from_str::<Value>(&data) else {
            continue;
        };

        let title = doc["title"].as_str().unwrap_or("").trim().to_string();
        let preview = block_text_preview(&doc["blocks"]);

        // Skip completely blank documents (no title and no content).
        if title.is_empty() && preview.is_empty() {
            continue;
        }

        // Deduplicate by body content: skip if an identical blocks payload was
        // already queued for recovery.
        let fingerprint = serde_json::to_string(&doc["blocks"]).unwrap_or_default();
        if !fingerprint.is_empty() && !seen_bodies.insert(fingerprint) {
            continue;
        }

        let emoji = doc["emoji"].as_str().unwrap_or("").to_string();
        let created_at = doc["createdAt"].as_str().unwrap_or("").to_string();
        let updated_at = doc["updatedAt"].as_str().unwrap_or("").to_string();

        orphans.push((doc_id, title, emoji, created_at, updated_at));
    }

    if orphans.is_empty() {
        return;
    }

    let tx = conn
        .transaction()
        .unwrap_or_else(|e| panic!("orphan recovery tx: {e}"));
    for (id, title, emoji, created_at, updated_at) in &orphans {
        let _ = tx.execute(
            "INSERT OR IGNORE INTO documents \
             (id, title, emoji, folder_id, is_favorite, created_at, updated_at) \
             VALUES (?1, ?2, ?3, NULL, 0, ?4, ?5)",
            rusqlite::params![id, title, emoji, created_at, updated_at],
        );
    }
    let _ = tx.commit();
}
