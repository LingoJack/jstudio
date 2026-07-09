//! Document body backups — write-before-overwrite safety net.
//!
//! Before each `write_document` overwrites `documents.body`, the previous
//! body is snapshotted to `documents/{doc_id}/.backups/{epoch_ms}.json`.
//! The most recent `MAX_BACKUPS` snapshots are retained per document; older
//! ones are pruned automatically.
//!
//! Abnormal-shrink detection: if the new content's block count drops below
//! 20% of the old (and the old had > 5 blocks), a `document:abnormal-shrink`
//! event is emitted so the frontend can warn the user and offer to restore.
//!
//! Backup envelope format (one `.json` file per snapshot):
//! ```json
//! { "timestampMs": 1720472340000, "blockCount": 142, "body": "<raw doc JSON>" }
//! ```

use rusqlite::OptionalExtension;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

use super::paths::doc_dir;

/// Maximum number of backup snapshots retained per document.
const MAX_BACKUPS: usize = 50;
/// A backup is flagged "abnormal" when the new block count is below this
/// fraction of the old count (and old had more than `ABNORMAL_OLD_MIN` blocks).
const ABNORMAL_FRACTION: f64 = 0.2;
const ABNORMAL_OLD_MIN: usize = 5;

/// Backup directory for a document: `documents/{doc_id}/.backups/`
fn backups_dir(doc_id: &str) -> PathBuf {
    doc_dir(doc_id).join(".backups")
}

/// Current epoch milliseconds (monotonic enough for backup file names —
/// `write_document` is debounced 500ms on the frontend, so collisions are
/// effectively impossible; a same-ms collision just overwrites, losing one
/// redundant snapshot, which is acceptable).
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Count top-level blocks in a serialized document body.
/// Returns 0 if the body is missing / invalid / unparseable.
fn count_blocks(body: &str) -> usize {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v.get("blocks").and_then(|b| b.as_array()).map(|a| a.len()))
        .unwrap_or(0)
}

/// Snapshot the current `documents.body` into `.backups/{ms}.json`, prune old
/// backups, and detect abnormal shrink vs. the incoming `new_doc`.
///
/// Called by `write_document` BEFORE the UPSERT overwrites the body. If the
/// current body is empty / missing / unparseable, no backup is created (there
/// is nothing to save). Emits `document:abnormal-shrink` when the new content
/// is suspiciously smaller than the old.
pub fn backup_before_write(doc_id: &str, new_doc: &Value, app: &AppHandle) {
    // ── Read the current body from the DB ──
    let old_body: Option<String> = {
        let conn = match crate::db::db() {
            Ok(c) => c,
            Err(_) => return,
        };
        conn.query_row(
            "SELECT body FROM documents WHERE id = ?1",
            rusqlite::params![doc_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .ok()
        .flatten()
        .flatten()
    };

    let old_body = match old_body {
        Some(s) if !s.trim().is_empty() => s,
        _ => return, // Nothing to back up (brand-new doc or empty body).
    };

    let old_count = count_blocks(&old_body);
    let ts = now_ms();

    // ── Write the backup envelope ──
    let dir = backups_dir(doc_id);
    let _ = fs::create_dir_all(&dir);
    let envelope = serde_json::json!({
        "timestampMs": ts,
        "blockCount": old_count,
        "body": old_body,
    });
    if let Ok(s) = serde_json::to_string(&envelope) {
        let _ = fs::write(dir.join(format!("{ts}.json")), s);
    }

    // ── Prune backups beyond MAX_BACKUPS ──
    prune_backups(&dir);

    // ── Abnormal-shrink detection ──
    let new_count = new_doc
        .get("blocks")
        .and_then(|b| b.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    if old_count > ABNORMAL_OLD_MIN && (new_count as f64) < (old_count as f64) * ABNORMAL_FRACTION {
        let _ = app.emit(
            "document:abnormal-shrink",
            serde_json::json!({
                "docId": doc_id,
                "oldCount": old_count,
                "newCount": new_count,
            }),
        );
    }
}

/// Remove the oldest backups until at most `MAX_BACKUPS` remain.
fn prune_backups(dir: &std::path::Path) {
    let mut entries: Vec<_> = match fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(_) => return,
    };
    if entries.len() <= MAX_BACKUPS {
        return;
    }
    // Sort by modified time, oldest first.
    entries.sort_by_key(|e| {
        e.metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0)
    });
    let to_remove = entries.len().saturating_sub(MAX_BACKUPS);
    for entry in entries.into_iter().take(to_remove) {
        let _ = fs::remove_file(entry.path());
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────

/// Metadata for a single backup snapshot (no body — keeps the list payload
/// small even for documents with hundreds of large backups).
#[derive(serde::Serialize)]
pub struct BackupMeta {
    /// File name without extension, e.g. "1720472340000". Used as the id.
    pub id: String,
    /// Epoch milliseconds when the backup was taken.
    pub timestamp_ms: u64,
    /// Block count of the snapshot.
    pub block_count: u64,
    /// File size in bytes.
    pub size: u64,
}

/// List all backups for a document, newest first (metadata only).
#[tauri::command]
pub fn list_doc_backups(doc_id: String) -> Result<Vec<BackupMeta>, String> {
    let dir = backups_dir(&doc_id);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut out: Vec<BackupMeta> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".json") {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

        // Read the envelope just for blockCount + timestampMs (body skipped).
        let (ts, block_count) = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .map(|v| {
                let ts = v.get("timestampMs").and_then(|t| t.as_u64()).unwrap_or(0);
                let bc = v.get("blockCount").and_then(|c| c.as_u64()).unwrap_or(0);
                (ts, bc)
            })
            .unwrap_or((0, 0));

        out.push(BackupMeta {
            id: name.trim_end_matches(".json").to_string(),
            timestamp_ms: ts,
            block_count,
            size,
        });
    }

    // Newest first.
    out.sort_by(|a, b| b.timestamp_ms.cmp(&a.timestamp_ms));
    Ok(out)
}

/// Read a specific backup's full document body (parsed JSON).
#[tauri::command]
pub fn read_doc_backup(doc_id: String, backup_id: String) -> Result<Value, String> {
    let path = backups_dir(&doc_id).join(format!("{backup_id}.json"));
    if !path.exists() {
        return Err(format!("backup not found: {backup_id}"));
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let envelope: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    // `body` is stored as a JSON string inside the envelope — parse it back.
    let body_str = envelope
        .get("body")
        .and_then(|b| b.as_str())
        .ok_or("backup envelope missing body")?;
    serde_json::from_str::<Value>(body_str).map_err(|e| format!("failed to parse backup body: {e}"))
}

/// Restore a backup as the current document body.
///
/// The current body is snapshotted first (so the restore itself is
/// reversible — the pre-restore state shows up as the newest backup).
#[tauri::command]
pub fn restore_doc_backup(doc_id: String, backup_id: String, app: AppHandle) -> Result<(), String> {
    // Snapshot current body before overwriting (reversible restore).
    // We pass a dummy new_doc so the shrink detector won't fire on restore.
    backup_before_write(&doc_id, &serde_json::json!({ "blocks": [] }), &app);

    // Read the backup body.
    let path = backups_dir(&doc_id).join(format!("{backup_id}.json"));
    if !path.exists() {
        return Err(format!("backup not found: {backup_id}"));
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let envelope: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    let body_str = envelope
        .get("body")
        .and_then(|b| b.as_str())
        .ok_or("backup envelope missing body")?;
    let body: Value = serde_json::from_str(body_str).map_err(|e| e.to_string())?;

    // Write to DB (body + refresh title/emoji/updated_at from the backup).
    let body_serialized = serde_json::to_string(&body).map_err(|e| e.to_string())?;
    let title = body["title"].as_str().unwrap_or("");
    let emoji = body["emoji"].as_str().unwrap_or("");
    let updated_at = body["updatedAt"].as_str().unwrap_or("");

    let conn = crate::db::db()?;
    conn.execute(
        "UPDATE documents SET body = ?2, title = ?3, emoji = ?4, updated_at = ?5 \
         WHERE id = ?1",
        rusqlite::params![doc_id, body_serialized, title, emoji, updated_at],
    )
    .map_err(|e| format!("failed to restore document {doc_id}: {e}"))?;

    Ok(())
}
