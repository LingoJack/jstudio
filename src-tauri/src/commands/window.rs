//! Window control commands.
//!
//! Provides commands for the frontend to control window lifecycle,
//! bypassing the intercept layer we added in `lib.rs`.

#[cfg(target_os = "macos")]
pub struct NativeMenuState {
    pub find_item: tauri::menu::MenuItem<tauri::Wry>,
    pub inline_code_item: tauri::menu::MenuItem<tauri::Wry>,
}

/// Close the window that invoked this command.
///
/// Called by the frontend when a tab/window should close:
///   - The main window's `window-close-requested` handler (last tab) — the
///     invoking window is the main window, so it closes the main window.
///   - The `app.closeTab` shortcut action (Cmd+W) — the invoking window is
///     whichever window had focus (main or a detached document window).
///
/// `destroy()` is used (rather than `close()`) to bypass the `CloseRequested`
/// intercept in `lib.rs`, which would re-emit `window-close-requested` for the
/// main window and loop. Child windows are not intercepted, but `destroy()` is
/// consistent and avoids an extra event round-trip.
#[tauri::command]
pub fn close_window(webview_window: tauri::WebviewWindow) -> Result<(), String> {
    webview_window.destroy().map_err(|e| e.to_string())
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
