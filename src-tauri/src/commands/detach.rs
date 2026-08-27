// In-memory detach payload cache.
//
// Used to transfer a terminal group's metadata + serialized scrollback from
// the parent window to a torn-off terminal window. The parent writes via
// `set_terminal_detach_payload` before opening the new window; the child
// reads (destructively) via `get_terminal_detach_payload` after it loads.
// This avoids cross-window Tauri event permission issues and bypasses URL
// length limits for large scrollback payloads.
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;

static DETACH_PAYLOADS: std::sync::LazyLock<Mutex<HashMap<String, Value>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Store a terminal detach payload in memory, keyed by the child window label.
pub fn set_terminal_detach_payload(label: String, payload: Value) -> Result<(), String> {
    let mut cache = DETACH_PAYLOADS.lock().map_err(|e| e.to_string())?;
    cache.insert(label, payload);
    Ok(())
}

/// Retrieve and remove the detach payload for the given label.
/// Destructive read — the child window consumes the payload once on startup.
pub fn get_terminal_detach_payload(label: String) -> Result<Option<Value>, String> {
    let mut cache = DETACH_PAYLOADS.lock().map_err(|e| e.to_string())?;
    Ok(cache.remove(&label))
}

/// Remove a detach payload entry without reading it.
/// Used for cleanup if the child window fails to start.
pub fn clear_terminal_detach_payload(label: String) -> Result<(), String> {
    let mut cache = DETACH_PAYLOADS.lock().map_err(|e| e.to_string())?;
    cache.remove(&label);
    Ok(())
}
