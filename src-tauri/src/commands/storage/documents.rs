//! Document metadata (SQLite) + document body (filesystem).

use serde_json::Value;
use std::fs;

use super::paths::{doc_dir, doc_path, documents_dir};

/// Read all document metadata from the database, ordered by `updated_at` DESC.
#[tauri::command]
pub fn read_index() -> Result<Value, String> {
    let conn = crate::db::db()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, emoji, folder_id, is_favorite, created_at, updated_at, \
             trashed_at \
             FROM documents ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("failed to prepare index query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let emoji: String = row.get(2)?;
            let folder_id: Option<String> = row.get(3)?;
            let is_favorite: i64 = row.get(4)?;
            let created_at: String = row.get(5)?;
            let updated_at: String = row.get(6)?;
            let trashed_at: Option<String> = row.get(7)?;

            let mut obj = serde_json::json!({
                "id": id,
                "title": title,
                "emoji": emoji,
                "createdAt": created_at,
                "updatedAt": updated_at,
                "isFavorite": is_favorite != 0,
            });
            // Always emit `folderId` / `trashedAt` explicitly (null when absent).
            // Skipping the key yields `undefined` on the JS side, which violates
            // the `DocumentMeta` contract (`folderId: string | null`) and would
            // break any future strict-equality check.
            obj["folderId"] = match folder_id {
                Some(fid) => Value::String(fid),
                None => Value::Null,
            };
            obj["trashedAt"] = match trashed_at {
                Some(ta) => Value::String(ta),
                None => Value::Null,
            };
            Ok(obj)
        })
        .map_err(|e| format!("failed to query index: {e}"))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("index row error: {e}"))?);
    }
    Ok(Value::Array(entries))
}

/// Replace the entire document metadata index in a single transaction.
#[tauri::command]
pub fn write_index(entries: Value) -> Result<(), String> {
    let arr = entries
        .as_array()
        .ok_or("write_index: expected JSON array")?;

    let mut conn = crate::db::db()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin index tx: {e}"))?;

    tx.execute("DELETE FROM documents", [])
        .map_err(|e| format!("failed to clear documents: {e}"))?;

    for entry in arr {
        let id = entry["id"].as_str().ok_or("write_index: missing id")?;
        let title = entry["title"].as_str().unwrap_or("");
        let emoji = entry["emoji"].as_str().unwrap_or("");
        let folder_id = entry["folderId"].as_str();
        let is_favorite = if entry["isFavorite"].as_bool() == Some(true) {
            1
        } else {
            0
        };
        let created_at = entry["createdAt"].as_str().unwrap_or("");
        let updated_at = entry["updatedAt"].as_str().unwrap_or("");
        let trashed_at = entry["trashedAt"].as_str();

        tx.execute(
            "INSERT OR REPLACE INTO documents \
             (id, title, emoji, folder_id, is_favorite, created_at, updated_at, trashed_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                id,
                title,
                emoji,
                folder_id,
                is_favorite,
                created_at,
                updated_at,
                trashed_at
            ],
        )
        .map_err(|e| format!("failed to insert document {id}: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("failed to commit index tx: {e}"))
}

/// Read a single document by id.
/// Tries `documents/{doc_id}/document.json` first (new layout),
/// falls back to `documents/{doc_id}.json` (legacy layout).
#[tauri::command]
pub fn read_document(doc_id: String) -> Result<Value, String> {
    let new_path = doc_path(&doc_id);
    let legacy_path = documents_dir().join(format!("{doc_id}.json"));

    let path = if new_path.exists() {
        new_path
    } else if legacy_path.exists() {
        legacy_path
    } else {
        return Err(format!("document not found: {doc_id}"));
    };

    let data =
        fs::read_to_string(&path).map_err(|e| format!("failed to read document {doc_id}: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("failed to parse document {doc_id}: {e}"))
}

/// Write a single document to `documents/{doc_id}/document.json`.
#[tauri::command]
pub fn write_document(doc_id: String, doc: Value) -> Result<(), String> {
    let dir = doc_dir(&doc_id);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create doc dir: {e}"))?;

    let path = doc_path(&doc_id);
    let json = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("failed to write document {doc_id}: {e}"))
}

/// Delete a document folder and all its assets, and record a tombstone so the
/// orphan-recovery routine never resurrects it.
#[tauri::command]
pub fn delete_document(doc_id: String) -> Result<(), String> {
    let dir = doc_dir(&doc_id);
    if dir.exists() {
        fs::remove_dir_all(&dir)
            .map_err(|e| format!("failed to delete document dir {doc_id}: {e}"))?;
    }

    // Also clean up legacy flat file if it exists.
    let legacy = documents_dir().join(format!("{doc_id}.json"));
    if legacy.exists() {
        let _ = fs::remove_file(&legacy);
    }

    // Record a tombstone so reconcile_orphan_documents won't bring this
    // document back on next startup if the folder deletion partially failed
    // or if the user manually copied the folder back.
    let conn = crate::db::db()?;
    let _ = conn.execute(
        "INSERT OR IGNORE INTO deleted_documents (id) VALUES (?1)",
        rusqlite::params![doc_id],
    );

    Ok(())
}
