//! Window control commands.
//!
//! Provides commands for the frontend to control window lifecycle,
//! bypassing the intercept layer we added in `lib.rs`.

use tauri::Manager;

#[cfg(target_os = "macos")]
pub struct NativeMenuState {
    pub find_item: tauri::menu::MenuItem<tauri::Wry>,
    pub inline_code_item: tauri::menu::MenuItem<tauri::Wry>,
}

/// Disable WKWebView "Live Text" (image text recognition) for the calling
/// window's webview.
///
/// Without this, clicking an image in the editor triggers Live Text: WKWebView
/// starts a text selection over text it recognized *inside* the rendered image
/// instead of producing a ProseMirror NodeSelection. DOM-level preventDefault
/// cannot reliably cancel this UA-driven interaction, so we turn the feature
/// off at the WKPreferences level. Called once from each window's JS bootstrap
/// (main.tsx runs in every window). No-op on non-macOS platforms.
#[tauri::command]
pub fn disable_text_interaction(webview_window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_web_kit::WKWebView;
        webview_window
            .with_webview(|platform_webview| {
                let wkwebview: &WKWebView = unsafe { &*platform_webview.inner().cast() };
                unsafe {
                    let prefs = wkwebview.configuration().preferences();
                    prefs.setTextInteractionEnabled(false);
                }
            })
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = webview_window;
    Ok(())
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

/// Quit the entire application.
///
/// Called by the frontend `app.quit` shortcut action (Cmd+Q), after the
/// exit-confirmation dialog (if enabled) has been accepted. We use
/// `app.exit(0)` for a clean shutdown — Tauri handles window teardown
/// and process termination.
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

/// Report that a window gained focus, updating the `FocusedWindow` state.
///
/// The frontend calls this from each window's JS `focus` event listener
/// (see `useWindowFocusTracking` hook). This bypasses Tauri's
/// `WindowEvent::Focused`, which is unreliable for child webview windows
/// and causes native menu commands (Cmd+W, etc.) to be misrouted to the
/// main window even when a child window has focus.
#[tauri::command]
pub fn report_window_focus(label: String, app: tauri::AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<crate::FocusedWindow>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = label;
        }
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
