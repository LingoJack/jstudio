//! Document-private binary assets (filesystem).
//!
//! Path convention: `documents/{doc_id}/assets/{file_name}`

use rusqlite::OptionalExtension;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use super::paths::{doc_assets_dir, doc_trash_dir, studio_dir};

/// Save a binary asset into a document's own assets folder.
/// Path: `documents/{doc_id}/assets/{file_name}`
///
/// If a file with the same name already exists, a numeric suffix is appended
/// (e.g. `photo.png` → `photo-1.png` → `photo-2.png`) until a free name is found.
/// Returns the **final** file name used.
pub fn save_doc_asset(doc_id: String, file_name: String, data: Vec<u8>) -> Result<String, String> {
    let dir = doc_assets_dir(&doc_id);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create assets dir: {e}"))?;

    let final_name = resolve_unique_name(&dir, &file_name);
    let path = dir.join(&final_name);
    fs::write(&path, &data).map_err(|e| format!("failed to save doc asset: {e}"))?;
    Ok(final_name)
}

/// Delete a single asset from a document's assets folder.
pub fn delete_doc_asset(doc_id: String, file_name: String) -> Result<(), String> {
    let path = doc_assets_dir(&doc_id).join(&file_name);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("failed to delete doc asset {file_name}: {e}"))?;
    }
    Ok(())
}

/// List all assets in a document's assets folder with metadata.
pub fn list_doc_assets(doc_id: String) -> Result<Vec<Value>, String> {
    let dir = doc_assets_dir(&doc_id);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read = fs::read_dir(&dir).map_err(|e| format!("failed to list doc assets: {e}"))?;

    for entry in read.flatten() {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let size_bytes = meta.len();
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let (name, ext) = match file_name.rsplit_once('.') {
            Some((n, e)) => (n.to_string(), e.to_lowercase()),
            None => (file_name.clone(), String::new()),
        };

        let mime = guess_mime(&ext);

        entries.push(serde_json::json!({
            "fileName": file_name,
            "name": name,
            "type": mime,
            "size": format_file_size(size_bytes),
            "sizeBytes": size_bytes,
            "createdAt": modified,
        }));
    }

    entries.sort_by(|a, b| {
        let a_t = a.get("createdAt").and_then(|v| v.as_u64()).unwrap_or(0);
        let b_t = b.get("createdAt").and_then(|v| v.as_u64()).unwrap_or(0);
        b_t.cmp(&a_t)
    });

    Ok(entries)
}

/// One-time cleanup: remove the legacy global `~/.jdata/studio/assets/` directory.
pub fn clean_global_assets() -> Result<(), String> {
    let dir = studio_dir().join("assets");
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("failed to clean global assets dir: {e}"))?;
    }
    Ok(())
}

// ────────────────────────────────────────────────
// Asset recycle bin (per-document `.trash/`)
// ────────────────────────────────────────────────

/// Move a single asset from a document's `assets/` folder into its `.trash/`
/// folder and record it in the `trashed_assets` table.
///
/// Used by the frontend asset garbage-collector when a block referencing the
/// asset is removed: instead of permanently deleting the file, it is parked
/// in the recycle bin so the user can restore or permanently delete it later.
///
/// No-op success when the source file doesn't exist (already gone).
pub fn trash_doc_asset(doc_id: String, file_name: String) -> Result<(), String> {
    let src = doc_assets_dir(&doc_id).join(&file_name);
    if !src.exists() {
        return Ok(());
    }

    let size_bytes = src.metadata().map(|m| m.len()).unwrap_or(0);
    let ext = match file_name.rsplit_once('.') {
        Some((_, e)) => e.to_lowercase(),
        None => String::new(),
    };
    let mime = guess_mime(&ext).to_string();

    let trash_dir = doc_trash_dir(&doc_id);
    fs::create_dir_all(&trash_dir).map_err(|e| format!("failed to create trash dir: {e}"))?;

    // Pick a free name inside `.trash/` (a same-named asset may already have
    // been trashed before). We keep the original name separately for restore.
    let trash_name = resolve_unique_name(&trash_dir, &file_name);
    let dest = trash_dir.join(&trash_name);
    fs::rename(&src, &dest).map_err(|e| format!("failed to move asset to trash: {e}"))?;

    let conn = crate::db::db()?;
    conn.execute(
        "INSERT INTO trashed_assets \
         (doc_id, trash_name, original_name, mime, size_bytes, trashed_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        rusqlite::params![doc_id, trash_name, file_name, mime, size_bytes as i64],
    )
    .map_err(|e| format!("failed to record trashed asset: {e}"))?;

    Ok(())
}

/// List every trashed asset across all documents, newest first.
pub fn list_trashed_assets() -> Result<Value, String> {
    let conn = crate::db::db()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, doc_id, trash_name, original_name, mime, size_bytes, trashed_at \
             FROM trashed_assets ORDER BY trashed_at DESC",
        )
        .map_err(|e| format!("failed to prepare trashed assets query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let doc_id: String = row.get(1)?;
            let trash_name: String = row.get(2)?;
            let original_name: String = row.get(3)?;
            let mime: String = row.get(4)?;
            let size_bytes: i64 = row.get(5)?;
            let trashed_at: String = row.get(6)?;
            Ok(serde_json::json!({
                "id": id,
                "docId": doc_id,
                "trashName": trash_name,
                "originalName": original_name,
                "type": mime,
                "sizeBytes": size_bytes,
                "trashedAt": trashed_at,
            }))
        })
        .map_err(|e| format!("failed to query trashed assets: {e}"))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("trashed asset row error: {e}"))?);
    }
    Ok(Value::Array(entries))
}

/// Restore a trashed asset back into its document's `assets/` folder.
///
/// The file is moved out of `.trash/` and the recycle-bin record is removed.
/// If the original name now collides in `assets/`, a numeric suffix is added.
pub fn restore_trashed_asset(id: i64) -> Result<(), String> {
    let conn = crate::db::db()?;
    let row: Option<(String, String, String)> = conn
        .query_row(
            "SELECT doc_id, trash_name, original_name FROM trashed_assets WHERE id = ?1",
            rusqlite::params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| format!("failed to read trashed asset {id}: {e}"))?;

    let Some((doc_id, trash_name, original_name)) = row else {
        return Ok(());
    };

    let src = doc_trash_dir(&doc_id).join(&trash_name);
    if src.exists() {
        let assets_dir = doc_assets_dir(&doc_id);
        fs::create_dir_all(&assets_dir).map_err(|e| format!("failed to create assets dir: {e}"))?;
        let final_name = resolve_unique_name(&assets_dir, &original_name);
        let dest = assets_dir.join(&final_name);
        fs::rename(&src, &dest).map_err(|e| format!("failed to restore asset: {e}"))?;
    }

    conn.execute(
        "DELETE FROM trashed_assets WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("failed to remove trashed asset record {id}: {e}"))?;

    Ok(())
}

/// Permanently delete a trashed asset (removes the `.trash/` file + record).
pub fn delete_trashed_asset(id: i64) -> Result<(), String> {
    let conn = crate::db::db()?;
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT doc_id, trash_name FROM trashed_assets WHERE id = ?1",
            rusqlite::params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("failed to read trashed asset {id}: {e}"))?;

    if let Some((doc_id, trash_name)) = row {
        let path = doc_trash_dir(&doc_id).join(&trash_name);
        if path.exists() {
            let _ = fs::remove_file(&path);
        }
    }

    conn.execute(
        "DELETE FROM trashed_assets WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| format!("failed to remove trashed asset record {id}: {e}"))?;

    Ok(())
}

// ---- helpers ----

/// Resolve a unique file name inside `dir`.
///
/// If `file_name` already exists, inserts a numeric suffix before the extension:
/// `photo.png` → `photo-1.png` → `photo-2.png` …
fn resolve_unique_name(dir: &PathBuf, file_name: &str) -> String {
    let target = dir.join(file_name);
    if !target.exists() {
        return file_name.to_string();
    }

    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((n, e)) => (n.to_string(), format!(".{e}")),
        None => (file_name.to_string(), String::new()),
    };

    for i in 1..u32::MAX {
        let candidate = format!("{stem}-{i}{ext}");
        if !dir.join(&candidate).exists() {
            return candidate;
        }
    }

    // Fallback — should never reach here.
    format!("{stem}-overflow{ext}")
}

fn guess_mime(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" | "mjs" => "text/javascript",
        "ts" => "text/typescript",
        "json" => "application/json",
        "txt" | "md" => "text/plain",
        _ => "application/octet-stream",
    }
}

fn format_file_size(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".into();
    }
    let units = ["B", "KB", "MB", "GB"];
    let i = (bytes as f64).log2() / 10.0;
    let i = i.floor() as usize;
    let i = i.min(units.len() - 1);
    let value = bytes as f64 / 1024_f64.powi(i as i32);
    format!(
        "{} {}",
        if i == 0 {
            value.round() as u64
        } else {
            (value * 10.0).round() as u64
        } as f64
            / if i == 0 { 1.0 } else { 10.0 },
        units[i]
    )
}
