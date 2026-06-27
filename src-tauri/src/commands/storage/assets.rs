//! Document-private binary assets (filesystem).
//!
//! Path convention: `documents/{doc_id}/assets/{file_name}`

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use super::paths::{doc_assets_dir, studio_dir};

/// Save a binary asset into a document's own assets folder.
/// Path: `documents/{doc_id}/assets/{file_name}`
///
/// If a file with the same name already exists, a numeric suffix is appended
/// (e.g. `photo.png` → `photo-1.png` → `photo-2.png`) until a free name is found.
/// Returns the **final** file name used.
#[tauri::command]
pub fn save_doc_asset(doc_id: String, file_name: String, data: Vec<u8>) -> Result<String, String> {
    let dir = doc_assets_dir(&doc_id);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create assets dir: {e}"))?;

    let final_name = resolve_unique_name(&dir, &file_name);
    let path = dir.join(&final_name);
    fs::write(&path, &data).map_err(|e| format!("failed to save doc asset: {e}"))?;
    Ok(final_name)
}

/// Delete a single asset from a document's assets folder.
#[tauri::command]
pub fn delete_doc_asset(doc_id: String, file_name: String) -> Result<(), String> {
    let path = doc_assets_dir(&doc_id).join(&file_name);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("failed to delete doc asset {file_name}: {e}"))?;
    }
    Ok(())
}

/// List all assets in a document's assets folder with metadata.
#[tauri::command]
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
#[tauri::command]
pub fn clean_global_assets() -> Result<(), String> {
    let dir = studio_dir().join("assets");
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("failed to clean global assets dir: {e}"))?;
    }
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
