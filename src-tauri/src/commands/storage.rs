use base64::{engine::general_purpose, Engine as _};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::UNIX_EPOCH;

/// Return the root data directory: `~/.jdata/studio/`
fn studio_dir() -> PathBuf {
    let home = dirs::home_dir().expect("cannot determine home directory");
    home.join(".jdata").join("studio")
}

/// `~/.jdata/studio/documents/`
fn documents_dir() -> PathBuf {
    studio_dir().join("documents")
}

/// `~/.jdata/studio/documents/{doc_id}/`
fn doc_dir(doc_id: &str) -> PathBuf {
    documents_dir().join(doc_id)
}

/// `~/.jdata/studio/documents/{doc_id}/document.json`
fn doc_path(doc_id: &str) -> PathBuf {
    doc_dir(doc_id).join("document.json")
}

/// `~/.jdata/studio/documents/{doc_id}/assets/`
fn doc_assets_dir(doc_id: &str) -> PathBuf {
    doc_dir(doc_id).join("assets")
}

fn index_path() -> PathBuf {
    studio_dir().join("index.json")
}

fn settings_path() -> PathBuf {
    studio_dir().join("settings.json")
}

/// Create the studio directory structure. Returns the root path.
#[tauri::command]
pub fn ensure_studio_dir() -> Result<String, String> {
    let base = studio_dir();
    fs::create_dir_all(documents_dir()).map_err(|e| e.to_string())?;

    // Seed index.json with an empty array if it doesn't exist.
    let idx = index_path();
    if !idx.exists() {
        fs::write(&idx, "[]").map_err(|e| e.to_string())?;
    }

    Ok(base.to_string_lossy().into_owned())
}

/// Open the studio data directory in the system file manager.
#[tauri::command]
pub fn open_studio_dir() -> Result<(), String> {
    let base = studio_dir();
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(&base);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("explorer");
        c.arg(&base);
        c
    };
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(&base);
        c
    };
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Read the document metadata index.
#[tauri::command]
pub fn read_index() -> Result<Value, String> {
    let data =
        fs::read_to_string(index_path()).map_err(|e| format!("failed to read index: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("failed to parse index: {e}"))
}

/// Write the full document metadata index.
#[tauri::command]
pub fn write_index(entries: Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(index_path(), json).map_err(|e| e.to_string())
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

/// Delete a document folder and all its assets.
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

    Ok(())
}

/// Read user settings.
#[tauri::command]
pub fn read_settings() -> Result<Value, String> {
    let path = settings_path();
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

/// Write user settings.
#[tauri::command]
pub fn write_settings(settings: Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(settings_path(), json).map_err(|e| e.to_string())
}

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

/// Read a document-scoped asset as base64.
#[tauri::command]
pub fn read_doc_asset_base64(doc_id: String, file_name: String) -> Result<String, String> {
    let path = doc_assets_dir(&doc_id).join(&file_name);
    let bytes =
        fs::read(&path).map_err(|e| format!("failed to read doc asset {file_name}: {e}"))?;
    Ok(general_purpose::STANDARD.encode(&bytes))
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

/// Read raw bytes from an arbitrary file path (returned by the file dialog).
/// Returns the data as a byte array (serialized as a Vec<u8>).
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("failed to read file {path}: {e}"))
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
