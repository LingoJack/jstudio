//! Window control commands.
//!
//! Provides commands for the frontend to control window lifecycle,
//! bypassing the intercept layer we added in `lib.rs`.

use tauri::{AppHandle, Manager};

#[cfg(target_os = "macos")]
pub struct NativeMenuState {
    pub find_item: tauri::menu::MenuItem<tauri::Wry>,
}

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

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn set_native_menu_accelerator(
    state: tauri::State<'_, NativeMenuState>,
    command_id: String,
    accelerator: Option<String>,
) -> Result<(), String> {
    if command_id != "app.find" {
        return Err(format!("Unsupported native menu command: {command_id}"));
    }

    state
        .find_item
        .set_accelerator(accelerator.as_deref())
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn set_native_menu_accelerator(
    command_id: String,
    _accelerator: Option<String>,
) -> Result<(), String> {
    if command_id != "app.find" {
        return Err(format!("Unsupported native menu command: {command_id}"));
    }
    Ok(())
}
