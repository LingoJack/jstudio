//! One-time migration from legacy JSON files to SQLite.
//!
//! Imports `index.json`, `folders.json`, and `settings.json` into their
//! corresponding database tables. Each file is only imported when the target
//! table is still empty (idempotent). After a successful import the original
//! file is renamed to `*.json.bak` for manual-recovery backup.

use rusqlite::Connection;
use serde_json::Value;
use std::fs;

use crate::commands::storage::paths::studio_dir;

fn index_path() -> std::path::PathBuf {
    studio_dir().join("index.json")
}

fn settings_path() -> std::path::PathBuf {
    studio_dir().join("settings.json")
}

fn folders_path() -> std::path::PathBuf {
    studio_dir().join("folders.json")
}

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
pub fn migrate_from_json(conn: &mut Connection) {
    // ── index.json → documents ──
    let idx = index_path();
    if idx.exists()
        && table_is_empty(conn, "documents")
        && let Ok(data) = fs::read_to_string(&idx)
        && let Ok(arr) = serde_json::from_str::<Value>(&data)
        && let Some(entries) = arr.as_array()
    {
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

    // ── folders.json → folders ──
    let fpath = folders_path();
    if fpath.exists()
        && table_is_empty(conn, "folders")
        && let Ok(data) = fs::read_to_string(&fpath)
        && let Ok(arr) = serde_json::from_str::<Value>(&data)
        && let Some(entries) = arr.as_array()
    {
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

    // ── settings.json → settings ──
    let spath = settings_path();
    if spath.exists()
        && table_is_empty(conn, "settings")
        && let Ok(data) = fs::read_to_string(&spath)
        && let Ok(obj) = serde_json::from_str::<Value>(&data)
        && let Some(map) = obj.as_object()
    {
        let tx = conn
            .transaction()
            .unwrap_or_else(|e| panic!("migration tx (settings): {e}"));
        for (key, val) in map {
            let value_str = serde_json::to_string(val).unwrap_or_else(|_| "null".into());
            let _ = tx.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                rusqlite::params![key, value_str],
            );
        }
        let _ = tx.commit();
        let _ = fs::rename(&spath, spath.with_extension("json.bak"));
    }
}
