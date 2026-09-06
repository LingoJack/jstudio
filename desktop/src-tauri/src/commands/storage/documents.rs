//! Document metadata + body (SQLite). Document-private assets stay on disk.

use rusqlite::OptionalExtension;
use serde_json::Value;
use std::fs;

use super::paths::{doc_dir, doc_path, documents_dir};

/// Read all document metadata from the database, ordered by `updated_at` DESC.
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

/// Upsert document metadata from the sidebar index.
///
/// IMPORTANT: this is a metadata-only UPSERT — it deliberately does **not**
/// touch the `body` column, and it does **not** delete rows that are absent
/// from `entries`. Two reasons:
///
///   1. The `body` column holds the document content; clearing it here (the
///      old `DELETE FROM documents` + re-INSERT did exactly that) would wipe
///      every document's text on the next index save.
///   2. The frontend's frequent `scheduleIndexSave` only passes the *active*
///      document list (trashed docs excluded), so deleting "missing" rows
///      would destroy trashed documents. Deletion is the sole responsibility
///      of `delete_document`.
pub fn write_index(entries: Value) -> Result<(), String> {
    let arr = entries
        .as_array()
        .ok_or("write_index: expected JSON array")?;

    let mut conn = crate::db::db()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin index tx: {e}"))?;

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
            "INSERT INTO documents \
             (id, title, emoji, folder_id, is_favorite, created_at, updated_at, trashed_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
             ON CONFLICT(id) DO UPDATE SET \
               title = excluded.title, \
               emoji = excluded.emoji, \
               folder_id = excluded.folder_id, \
               is_favorite = excluded.is_favorite, \
               created_at = excluded.created_at, \
               updated_at = excluded.updated_at, \
               trashed_at = excluded.trashed_at",
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
        .map_err(|e| format!("failed to upsert document {id}: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("failed to commit index tx: {e}"))
}

/// Read a single document by id.
///
/// Resolution order:
///   1. `documents.body` in SQLite (the canonical store).
///   2. Legacy filesystem fallback — `documents/{doc_id}/document.json` then
///      `documents/{doc_id}.json` — for content not yet migrated. When found
///      this way, the body is backfilled into the database so subsequent
///      reads hit the fast path.
pub fn read_document(doc_id: String) -> Result<Value, String> {
    // ── 1. Database body ──
    {
        let conn = crate::db::db()?;
        let body: Option<String> = conn
            .query_row(
                "SELECT body FROM documents WHERE id = ?1",
                rusqlite::params![doc_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|e| format!("failed to read document body {doc_id}: {e}"))?
            .flatten();

        if let Some(s) = body
            && !s.trim().is_empty()
        {
            return serde_json::from_str(&s)
                .map_err(|e| format!("failed to parse document {doc_id}: {e}"));
        }
    }

    // ── 2. Legacy filesystem fallback ──
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
    let parsed: Value = serde_json::from_str(&data)
        .map_err(|e| format!("failed to parse document {doc_id}: {e}"))?;

    // Backfill into the DB so the next read hits the fast path.
    if let Ok(conn) = crate::db::db() {
        let _ = conn.execute(
            "UPDATE documents SET body = ?2 WHERE id = ?1 AND (body IS NULL OR body = '')",
            rusqlite::params![doc_id, data],
        );
    }

    Ok(parsed)
}

/// Persist a single document's full content into `documents.body`.
///
/// Uses an UPSERT so a brand-new document (created via `createDocument`,
/// which calls this before `write_index`) inserts a complete row, while an
/// existing document only has its content-related columns refreshed.
///
/// The `ON CONFLICT` branch updates `body` plus `title` / `emoji` /
/// `updated_at` — because block edits go through here only (they bump
/// `updatedAt` but do NOT trigger an index save), so the sidebar's
/// `ORDER BY updated_at DESC` would otherwise go stale. It deliberately
/// leaves `folder_id` / `is_favorite` / `trashed_at` / `created_at` alone,
/// since those are owned by `write_index`.
///
/// **Backup**: before overwriting `body`, the previous body is snapshotted
/// to `.backups/` (see [`super::backups::backup_before_write`]). The
/// `AppHandle` is auto-injected by Tauri and used to emit an abnormal-shrink
/// event when the new content is suspiciously smaller than the old.
pub fn write_document(
    doc_id: String,
    doc: Value,
    events: &dyn crate::events::EventSink,
) -> Result<(), String> {
    // Snapshot the current body before overwriting (write-before-overwrite
    // safety net). Also detects abnormal shrink and emits an event.
    super::backups::backup_before_write(&doc_id, &doc, events);

    let body = serde_json::to_string(&doc).map_err(|e| e.to_string())?;
    let title = doc["title"].as_str().unwrap_or("");
    let emoji = doc["emoji"].as_str().unwrap_or("");
    let created_at = doc["createdAt"].as_str().unwrap_or("");
    let updated_at = doc["updatedAt"].as_str().unwrap_or("");

    let conn = crate::db::db()?;
    conn.execute(
        "INSERT INTO documents (id, title, emoji, created_at, updated_at, body) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(id) DO UPDATE SET \
           body = excluded.body, \
           title = excluded.title, \
           emoji = excluded.emoji, \
           updated_at = excluded.updated_at",
        rusqlite::params![doc_id, title, emoji, created_at, updated_at, body],
    )
    .map_err(|e| format!("failed to write document {doc_id}: {e}"))?;

    Ok(())
}

/// Delete a document: its metadata + body row, its on-disk folder (assets),
/// any legacy flat file, and record a tombstone so orphan-recovery never
/// resurrects it.
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

    // Remove the metadata + body row, then record a tombstone so
    // reconcile_orphan_documents won't bring this document back on next
    // startup if a leftover folder/file reappears.
    let conn = crate::db::db()?;
    let _ = conn.execute(
        "DELETE FROM documents WHERE id = ?1",
        rusqlite::params![doc_id],
    );
    // Drop any recycle-bin records for this document — its `.trash/` folder
    // was just removed along with the document folder above.
    let _ = conn.execute(
        "DELETE FROM trashed_assets WHERE doc_id = ?1",
        rusqlite::params![doc_id],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO deleted_documents (id) VALUES (?1)",
        rusqlite::params![doc_id],
    );

    Ok(())
}
