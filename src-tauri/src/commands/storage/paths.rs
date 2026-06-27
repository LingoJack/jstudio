//! Directory path helpers + "open in file manager" commands.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

// ---- path helpers (shared across all storage sub-modules) ----

/// Return the root data directory: `~/.jdata/studio/`
pub fn studio_dir() -> PathBuf {
    let home = dirs::home_dir().expect("cannot determine home directory");
    home.join(".jdata").join("studio")
}

/// `~/.jdata/studio/documents/`
pub fn documents_dir() -> PathBuf {
    studio_dir().join("documents")
}

/// `~/.jdata/studio/documents/{doc_id}/`
pub fn doc_dir(doc_id: &str) -> PathBuf {
    documents_dir().join(doc_id)
}

/// `~/.jdata/studio/documents/{doc_id}/document.json`
pub fn doc_path(doc_id: &str) -> PathBuf {
    doc_dir(doc_id).join("document.json")
}

/// `~/.jdata/studio/documents/{doc_id}/assets/`
pub fn doc_assets_dir(doc_id: &str) -> PathBuf {
    doc_dir(doc_id).join("assets")
}

// ---- Tauri commands ----

/// Create the studio directory structure and initialise the SQLite database.
/// Returns the root path.
#[tauri::command]
pub fn ensure_studio_dir() -> Result<String, String> {
    let base = studio_dir();
    fs::create_dir_all(documents_dir()).map_err(|e| e.to_string())?;

    // Initialise SQLite database (creates tables + runs JSON migrations).
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

/// Read raw bytes from an arbitrary file path (returned by the file dialog).
/// Returns the data as a byte array (serialized as a Vec<u8>).
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("failed to read file {path}: {e}"))
}

// ---- internal helpers ----

/// Cross-platform "reveal in file manager" helper.
pub(crate) fn open_path_in_file_manager(path: &PathBuf) -> Result<(), String> {
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
