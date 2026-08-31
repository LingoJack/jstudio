//! In-memory caches for cross-window data passing.
//!
//! These caches avoid Tauri event IPC size limits when passing large payloads
//! (base64 file data, diagram snapshots) between the main window and
//! detached preview / diagram windows.

use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;

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
pub fn set_preview_data(label: String, data: Value) -> Result<(), String> {
    let mut cache = PREVIEW_CACHE.lock().map_err(|e| e.to_string())?;
    cache.insert(label, data);
    Ok(())
}

/// Retrieve and remove preview data for the given label.
pub fn get_preview_data(label: String) -> Result<Option<Value>, String> {
    let mut cache = PREVIEW_CACHE.lock().map_err(|e| e.to_string())?;
    Ok(cache.remove(&label))
}

/// Store an updated diagram snapshot from the diagram window.
pub fn set_diagram_update(label: String, data: Value) -> Result<(), String> {
    let mut updates = DIAGRAM_UPDATES.lock().map_err(|e| e.to_string())?;
    updates.insert(label, data);
    Ok(())
}

/// Retrieve (non-destructively) the latest diagram snapshot for a label.
/// The main window polls this periodically; once it has consumed the data
/// it calls `clear_diagram_update`.
pub fn get_diagram_update(label: String) -> Result<Option<Value>, String> {
    let updates = DIAGRAM_UPDATES.lock().map_err(|e| e.to_string())?;
    Ok(updates.get(&label).cloned())
}

/// Remove a diagram update entry after the main window has consumed it.
pub fn clear_diagram_update(label: String) -> Result<(), String> {
    let mut updates = DIAGRAM_UPDATES.lock().map_err(|e| e.to_string())?;
    updates.remove(&label);
    Ok(())
}
