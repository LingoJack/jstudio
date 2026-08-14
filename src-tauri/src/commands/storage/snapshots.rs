//! Editor in-memory snapshots — crash-recovery side-channel.
//!
//! Periodically dumps the live TipTap editor JSON (per-section
//! `editor.getJSON()`) directly to disk, BYPASSING the Block[] serialization.
//! If a serialization bug corrupts `documents.body`, the raw editor JSON
//! survives on disk for manual recovery.
//!
//! Rotated: the last `SNAPSHOT_ROTATION_KEEP` snapshots are kept as
//! `editor.{n}.json` (0 = newest). This gives a window of clean history —
//! if a corruption-causing edit is snapshotted, older snapshots may still
//! hold the pre-corruption state.
//!
//! Atomic write: write to `editor.0.json.tmp` then `fs::rename`, so a crash
//! mid-write cannot corrupt the newest snapshot.

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use super::paths::doc_dir;

/// Number of rotated snapshot files to retain per document.
const SNAPSHOT_ROTATION_KEEP: usize = 3;

/// Snapshot directory for a document: `documents/{doc_id}/.snapshots/`
fn snapshots_dir(doc_id: &str) -> PathBuf {
    doc_dir(doc_id).join(".snapshots")
}

/// Current epoch milliseconds.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Write a new editor snapshot, rotating old ones.
///
/// Payload shape: `{ "timestampMs": u64, "docId": String, "sections": [<JSONContent>] }`
/// where each section is a per-section `editor.getJSON()` result stored
/// verbatim (no Block[] conversion).
#[tauri::command]
pub fn save_doc_snapshot(doc_id: String, sections: Value, _app: AppHandle) -> Result<(), String> {
    let dir = snapshots_dir(&doc_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // ── Rotate: shift editor.{n} -> editor.{n+1} for n in [KEEP-2 .. 0] ──
    // Oldest (editor.{KEEP-1}) is dropped by the rename overwrite.
    for n in (0..SNAPSHOT_ROTATION_KEEP.saturating_sub(1)).rev() {
        let from = dir.join(format!("editor.{n}.json"));
        let to = dir.join(format!("editor.{}.json", n + 1));
        let _ = fs::rename(&from, &to);
    }

    // ── Atomic write to editor.0.json (tmp + rename) ──
    let envelope = serde_json::json!({
        "timestampMs": now_ms(),
        "docId": doc_id,
        "sections": sections,
    });
    let serialized = serde_json::to_string(&envelope).map_err(|e| e.to_string())?;
    let final_path = dir.join("editor.0.json");
    let tmp_path = dir.join("editor.0.json.tmp");
    fs::write(&tmp_path, &serialized).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())?;

    Ok(())
}

/// Read the newest snapshot (editor.0.json), or `null` if none exists.
///
/// The frontend converts the raw TipTap JSON back to Block[] via the CURRENT
/// (fixed) adapter for preview + restore. See `BackupRestoreDialog`.
#[tauri::command]
pub fn read_doc_snapshot(doc_id: String) -> Result<Value, String> {
    let path = snapshots_dir(&doc_id).join("editor.0.json");
    if !path.exists() {
        return Ok(Value::Null);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}
