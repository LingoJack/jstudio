use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

// ---- In-memory preview data cache ----
// Used to pass large file data (base64) from the main window to a preview
// window without hitting Tauri event IPC size limits.
static PREVIEW_CACHE: std::sync::LazyLock<Mutex<HashMap<String, Value>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

// ---- In-memory diagram update cache ----
// Used by the diagram window to send updated snapshots back to the main
// window.  The diagram window writes via `set_diagram_update`; the main
// window polls via `get_diagram_update` (non-destructive) and removes the
// entry via `clear_diagram_update` once consumed.  This avoids cross-window
// event permission issues entirely.
static DIAGRAM_UPDATES: std::sync::LazyLock<Mutex<HashMap<String, Value>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Store preview data in memory, keyed by window label.
#[tauri::command]
pub fn set_preview_data(label: String, data: Value) -> Result<(), String> {
    let mut cache = PREVIEW_CACHE.lock().map_err(|e| e.to_string())?;
    cache.insert(label, data);
    Ok(())
}

/// Retrieve and remove preview data for the given label.
#[tauri::command]
pub fn get_preview_data(label: String) -> Result<Option<Value>, String> {
    let mut cache = PREVIEW_CACHE.lock().map_err(|e| e.to_string())?;
    Ok(cache.remove(&label))
}

/// Store an updated diagram snapshot from the diagram window.
#[tauri::command]
pub fn set_diagram_update(label: String, data: Value) -> Result<(), String> {
    let mut updates = DIAGRAM_UPDATES.lock().map_err(|e| e.to_string())?;
    updates.insert(label, data);
    Ok(())
}

/// Retrieve (non-destructively) the latest diagram snapshot for a label.
/// The main window polls this periodically; once it has consumed the data
/// it calls `clear_diagram_update`.
#[tauri::command]
pub fn get_diagram_update(label: String) -> Result<Option<Value>, String> {
    let updates = DIAGRAM_UPDATES.lock().map_err(|e| e.to_string())?;
    Ok(updates.get(&label).cloned())
}

/// Remove a diagram update entry after the main window has consumed it.
#[tauri::command]
pub fn clear_diagram_update(label: String) -> Result<(), String> {
    let mut updates = DIAGRAM_UPDATES.lock().map_err(|e| e.to_string())?;
    updates.remove(&label);
    Ok(())
}

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

/// Create the studio directory structure and initialise the SQLite database.
/// Returns the root path.
#[tauri::command]
pub fn ensure_studio_dir() -> Result<String, String> {
    let base = studio_dir();
    fs::create_dir_all(documents_dir()).map_err(|e| e.to_string())?;

    // Initialise SQLite database (creates tables + runs JSON migration).
    crate::db::init_db()?;

    Ok(base.to_string_lossy().into_owned())
}

/// Open the studio data directory in the system file manager.
#[tauri::command]
pub fn open_studio_dir() -> Result<(), String> {
    open_path_in_file_manager(&studio_dir())
}

/// Open a specific document's folder in the system file manager.
#[tauri::command]
pub fn open_doc_dir(doc_id: String) -> Result<(), String> {
    open_path_in_file_manager(&doc_dir(&doc_id))
}

/// Return the full filesystem path of a document's `document.json`.
#[tauri::command]
pub fn get_doc_path(doc_id: String) -> Result<String, String> {
    let path = doc_path(&doc_id);
    if !path.exists() {
        // Fall back to legacy path for display purposes.
        let legacy = documents_dir().join(format!("{doc_id}.json"));
        if legacy.exists() {
            return Ok(legacy.to_string_lossy().into_owned());
        }
    }
    Ok(path.to_string_lossy().into_owned())
}

/// Cross-platform "reveal in file manager" helper.
fn open_path_in_file_manager(path: &PathBuf) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        // On macOS, `open -R` reveals the path in Finder.
        let mut c = Command::new("open");
        c.arg("-R").arg(path);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("explorer");
        c.arg(path);
        c
    };
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(path);
        c
    };
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

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
            if let Some(fid) = folder_id {
                obj["folderId"] = Value::String(fid);
            }
            if let Some(ta) = trashed_at {
                obj["trashedAt"] = Value::String(ta);
            }
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

/// Read all settings from the database, assembled into a single JSON object.
///
/// Each row in the `settings` table stores one key with a JSON-encoded value;
/// this function rehydrates them into `{ key1: value1, key2: value2, ... }`.
#[tauri::command]
pub fn read_settings() -> Result<Value, String> {
    let conn = crate::db::db()?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| format!("failed to prepare settings query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let value_str: String = row.get(1)?;
            Ok((key, value_str))
        })
        .map_err(|e| format!("failed to query settings: {e}"))?;

    let mut obj = serde_json::Map::new();
    for row in rows {
        let (key, value_str) = row.map_err(|e| format!("settings row error: {e}"))?;
        let val: Value = serde_json::from_str(&value_str).unwrap_or(Value::Null);
        obj.insert(key, val);
    }
    Ok(Value::Object(obj))
}

/// Write settings (partial upsert).
///
/// The frontend sends **partial** objects (e.g. `{ "theme": "dark" }`).
/// Each key in the incoming object is upserted into the `settings` table;
/// keys not present in the incoming object are left untouched — this
/// preserves the existing shallow-merge semantics.
#[tauri::command]
pub fn write_settings(settings: Value) -> Result<(), String> {
    let obj = settings
        .as_object()
        .ok_or("write_settings: expected JSON object")?;

    let mut conn = crate::db::db()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin settings tx: {e}"))?;

    for (key, val) in obj {
        let value_str = serde_json::to_string(val).unwrap_or_else(|_| "null".into());
        tx.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value_str],
        )
        .map_err(|e| format!("failed to upsert setting '{key}': {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("failed to commit settings tx: {e}"))
}

// ────────────────────────────────────────────────
// Agent config (~/.jdata/agent/data/agent_config.json)
// ────────────────────────────────────────────────

/// `~/.jdata/agent/data/agent_config.json`  (jcli agent 主配置)
fn agent_config_path() -> PathBuf {
    let home = dirs::home_dir().expect("cannot determine home directory");
    home.join(".jdata")
        .join("agent")
        .join("data")
        .join("agent_config.json")
}

/// Read the jcli agent configuration file.
/// Returns `{}` if the file does not exist yet — JStudio can create it
/// on first save, so no external initialisation step is required.
#[tauri::command]
pub fn read_agent_config() -> Result<Value, String> {
    let path = agent_config_path();
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

/// Write the full jcli agent configuration file.
/// Creates the parent directory tree if it does not exist.
#[tauri::command]
pub fn write_agent_config(config: Value) -> Result<(), String> {
    let path = agent_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// Read all folders from the database, ordered by `sort_order`.
#[tauri::command]
pub fn read_folders() -> Result<Value, String> {
    let conn = crate::db::db()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, parent_id, sort_order, collapsed, trashed_at \
             FROM folders ORDER BY sort_order ASC",
        )
        .map_err(|e| format!("failed to prepare folders query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let parent_id: Option<String> = row.get(2)?;
            let sort_order: i64 = row.get(3)?;
            let collapsed: i64 = row.get(4)?;
            let trashed_at: Option<String> = row.get(5)?;

            let mut obj = serde_json::json!({
                "id": id,
                "name": name,
                "sortOrder": sort_order,
                "collapsed": collapsed != 0,
            });
            if let Some(pid) = parent_id {
                obj["parentId"] = Value::String(pid);
            }
            if let Some(ta) = trashed_at {
                obj["trashedAt"] = Value::String(ta);
            }
            Ok(obj)
        })
        .map_err(|e| format!("failed to query folders: {e}"))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("folders row error: {e}"))?);
    }
    Ok(Value::Array(entries))
}

/// Replace the entire folder tree in a single transaction.
#[tauri::command]
pub fn write_folders(entries: Value) -> Result<(), String> {
    let arr = entries
        .as_array()
        .ok_or("write_folders: expected JSON array")?;

    let mut conn = crate::db::db()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin folders tx: {e}"))?;

    tx.execute("DELETE FROM folders", [])
        .map_err(|e| format!("failed to clear folders: {e}"))?;

    for entry in arr {
        let id = entry["id"].as_str().ok_or("write_folders: missing id")?;
        let name = entry["name"].as_str().unwrap_or("");
        let parent_id = entry["parentId"].as_str();
        let sort_order = entry["sortOrder"].as_i64().unwrap_or(0);
        let collapsed = if entry["collapsed"].as_bool() == Some(true) {
            1
        } else {
            0
        };
        let trashed_at = entry["trashedAt"].as_str();

        tx.execute(
            "INSERT OR REPLACE INTO folders \
             (id, name, parent_id, sort_order, collapsed, trashed_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, name, parent_id, sort_order, collapsed, trashed_at],
        )
        .map_err(|e| format!("failed to insert folder {id}: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("failed to commit folders tx: {e}"))
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

/// Recursively list all Markdown files inside `dir`, returning their absolute
/// paths and their path relative to `dir` (using `/` separators).
///
/// Each entry also records whether it is a directory. This lets the frontend
/// recreate the folder hierarchy before importing the documents.
///
/// # Arguments
/// * `dir` — absolute path to the directory to scan.
#[tauri::command]
pub fn list_markdown_files(dir: String) -> Result<Vec<MarkdownEntry>, String> {
    let root = Path::new(&dir);
    if !root.is_dir() {
        return Err(format!("not a directory: {dir}"));
    }

    let mut entries = Vec::new();
    collect_markdown(root, root, &mut entries)?;
    // Sort by relative path so that directories always appear before the files
    // they contain — the frontend relies on this to create folders first.
    entries.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(entries)
}

/// A single entry returned by [`list_markdown_files`].
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownEntry {
    /// Absolute filesystem path.
    pub path: String,
    /// Path relative to the scanned root, using `/` as separator.
    pub relative_path: String,
    /// `true` for directories, `false` for files.
    pub is_dir: bool,
}

/// Recursive helper for [`list_markdown_files`].
fn collect_markdown(
    root: &Path,
    current: &Path,
    out: &mut Vec<MarkdownEntry>,
) -> Result<(), String> {
    let rd = fs::read_dir(current)
        .map_err(|e| format!("failed to read dir {}: {e}", current.display()))?;

    for entry in rd {
        let entry = entry.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        // Skip hidden files/directories (dotfiles like .git, .DS_Store, …)
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        let rel = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        if path.is_dir() {
            out.push(MarkdownEntry {
                path: path.to_string_lossy().into_owned(),
                relative_path: rel,
                is_dir: true,
            });
            collect_markdown(root, &path, out)?;
        } else if is_markdown(&path) {
            out.push(MarkdownEntry {
                path: path.to_string_lossy().into_owned(),
                relative_path: rel,
                is_dir: false,
            });
        }
    }
    Ok(())
}

/// Returns `true` if the file extension looks like Markdown.
fn is_markdown(path: &Path) -> bool {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("md") | Some("markdown") | Some("mdown") => true,
        _ => false,
    }
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
