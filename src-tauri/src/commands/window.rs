//! Window control commands.
//!
//! Provides commands for the frontend to control window lifecycle,
//! bypassing the intercept layer we added in `lib.rs`.

use tauri::{AppHandle, Manager};

#[cfg(target_os = "macos")]
pub struct NativeMenuState {
    pub find_item: tauri::menu::MenuItem<tauri::Wry>,
    pub inline_code_item: tauri::menu::MenuItem<tauri::Wry>,
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

/// Update the accelerator of a native menu item at runtime.
///
/// Supported `command_id` values: `"app.find"`, `"editor.inlineCode"`.
/// Keep in sync with the frontend caller in `App.tsx`.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn set_native_menu_accelerator(
    state: tauri::State<'_, NativeMenuState>,
    command_id: String,
    accelerator: Option<String>,
) -> Result<(), String> {
    let item = match command_id.as_str() {
        "app.find" => &state.find_item,
        "editor.inlineCode" => &state.inline_code_item,
        other => return Err(format!("Unsupported native menu command: {other}")),
    };

    item.set_accelerator(accelerator.as_deref())
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn set_native_menu_accelerator(
    command_id: String,
    _accelerator: Option<String>,
) -> Result<(), String> {
    if !["app.find", "editor.inlineCode"].contains(&command_id.as_str()) {
        return Err(format!("Unsupported native menu command: {command_id}"));
    }
    Ok(())
}
