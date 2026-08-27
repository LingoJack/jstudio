//! Directory path helpers + "open in file manager" commands.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

// ---- path helpers (shared across all storage sub-modules) ----

/// Return the shared jdata root: `~/.jdata/`
///
/// All jcli/jstudio data lives under this directory. Centralising the
/// `home_dir` lookup here means every other module avoids repeating
/// `dirs::home_dir().expect("cannot determine home directory")`.
pub fn jdata_dir() -> PathBuf {
    let home = dirs::home_dir().expect("cannot determine home directory");
    home.join(".jdata")
}

/// Return the root data directory: `~/.jdata/studio/`
pub fn studio_dir() -> PathBuf {
    jdata_dir().join("studio")
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

/// `~/.jdata/studio/documents/{doc_id}/.trash/`
///
/// Per-document recycle bin for assets removed from the document. Living
/// inside the document folder keeps the document self-contained: deleting
/// the document (which removes the whole folder) also clears its asset trash.
pub fn doc_trash_dir(doc_id: &str) -> PathBuf {
    doc_dir(doc_id).join(".trash")
}

// ---- Tauri commands ----

/// Create the studio directory structure and initialise the SQLite database.
/// Returns the root path.
pub fn ensure_studio_dir() -> Result<String, String> {
    let base = studio_dir();
    fs::create_dir_all(documents_dir()).map_err(|e| e.to_string())?;

    // Initialise SQLite database (creates tables + runs JSON migrations).
    crate::db::init_db()?;

    Ok(base.to_string_lossy().into_owned())
}

/// Open the studio data directory in the system file manager.
pub fn open_studio_dir() -> Result<(), String> {
    open_path_in_file_manager(&studio_dir())
}

/// Open a specific document's folder in the system file manager.
pub fn open_doc_dir(doc_id: String) -> Result<(), String> {
    open_path_in_file_manager(&doc_dir(&doc_id))
}

/// Return the full filesystem path of a document's `document.json`.
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
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("failed to read file {path}: {e}"))
}

/// Write raw bytes to an arbitrary file path (e.g. returned by the save dialog).
pub fn write_file_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, &data).map_err(|e| format!("failed to write file {path}: {e}"))
}

/// Copy an image file straight from disk onto the OS clipboard.
///
/// Does the file read + decode + clipboard write entirely on the Rust side,
/// so the (potentially multi-megabyte) image bytes never cross the JS↔Rust
/// IPC bridge as a JSON-serialized number array — that serialization is what
/// made the earlier JS-side `writeImage(bytes)` approach slow for large
/// images.
///
/// Uses arboard directly. Blocking (decode + clipboard write) — the sidecar
/// dispatch runs it on the blocking pool.
pub fn copy_image_to_clipboard(path: String) -> Result<(), String> {
    let bytes = fs::read(&path).map_err(|e| format!("failed to read file {path}: {e}"))?;
    write_image_bytes_to_clipboard_impl(bytes)
}

/// Copy an in-memory image (raw bytes: PNG/JPEG/etc.) to the system clipboard.
///
/// This is the byte-array variant of `copy_image_to_clipboard` for use when
/// the image is generated in the frontend (e.g. canvas export) and no file
/// path exists yet.
pub fn copy_image_bytes_to_clipboard(data: Vec<u8>) -> Result<(), String> {
    write_image_bytes_to_clipboard_impl(data)
}

/// Decode image bytes (PNG/JPEG/…) and put them on the OS clipboard.
/// Shared by both clipboard commands; blocking — call off the UI thread.
fn write_image_bytes_to_clipboard_impl(data: Vec<u8>) -> Result<(), String> {
    let img = image::load_from_memory(&data)
        .map_err(|e| format!("failed to decode image: {e}"))?
        .to_rgba8();
    let (width, height) = (img.width() as usize, img.height() as usize);

    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("failed to open clipboard: {e}"))?;
    clipboard
        .set_image(arboard::ImageData {
            width,
            height,
            bytes: std::borrow::Cow::Owned(img.into_raw()),
        })
        .map_err(|e| format!("failed to write image to clipboard: {e}"))
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
