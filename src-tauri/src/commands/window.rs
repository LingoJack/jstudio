//! Window control commands.
//!
//! Provides commands for the frontend to control window lifecycle,
//! bypassing the intercept layer we added in `lib.rs`.

use tauri::{AppHandle, Manager};

/// Close the main window unconditionally.
/// Called by the frontend when the last tab is closed and the user
/// confirms they want to exit (or when there's no tab to close).
#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<(), String> {
    // Use get_webview_window for the main window (created via WebviewWindowBuilder)
    if let Some(window) = app.get_webview_window("main") {
        // Destroy the window without triggering another close_requested event.
        // This bypasses the intercept layer in lib.rs.
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}
