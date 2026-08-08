mod commands;
mod db;
mod menu;

use std::sync::Mutex;

use tauri::{Emitter, Manager};

/// Tracks the label of the currently-focused window.
///
/// Updated from `WindowEvent::Focused` and read by `on_menu_event` to route
/// native menu commands (Cmd+W, Cmd+F, …) to the focused window. Tauri's
/// `Window::is_focused()` is unreliable for child windows - it can keep
/// reporting the main window as focused after a child gains focus - so we
/// track focus ourselves.
pub(crate) struct FocusedWindow(Mutex<String>);

/// Handle window close requests (traffic-light close button on macOS).
///
/// Only intercepts close requests for the **main window**. Child windows
/// (preview, diagram, terminal detach, document detach) are allowed to
/// close directly without triggering the tab-close logic.
///
/// For the main window, we prevent the default action and emit an event
/// to the frontend, letting it decide whether to close the current tab
/// or the entire window.
///
/// Note: Cmd+W no longer triggers this path - it is handled via a custom
/// MenuItem ("app.closeTab") that routes through on_menu_event. This
/// handler only fires when the user clicks the window's close button.
fn on_window_close_requested(window: &tauri::Window, api: &tauri::CloseRequestApi) {
    // Only intercept close requests for the main window.
    // Child windows (preview, diagram, terminal, document) should close directly.
    let label = window.label();
    if label != "main" {
        // Let child windows close normally.
        return;
    }

    // Prevent the default close action - we'll handle it in JS.
    // The frontend will call `close_window` if it really wants to close.
    api.prevent_close();

    // Emit event to frontend so it can close the current tab instead.
    // The frontend decides: close tab if multiple tabs exist, or close
    // window if it's the last tab.
    let _ = window.app_handle().emit("window-close-requested", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Tauri's default macOS menu includes Edit > "Select All" (Cmd+A)
        // via PredefinedMenuItem::select_all, which triggers WKWebView's
        // native select-all - that only grabs the focused editing host (one
        // section in the sectioned editor) and ignores code-block scoping.
        // We disable the default menu and install a custom one (menu::build_app_menu)
        // that replaces "Select All" with a custom MenuItem bound to the same
        // Cmd+A accelerator. macOS still routes the keypress through
        // performKeyEquivalent: -> on_menu_event, but instead of the native
        // action we emit a `native-command` ("app.selectAll") that the
        // frontend dispatches via commandRegistry -> selectAllRegistry (same
        // forwarding pattern as editor.undo / editor.redo / editor.inlineCode).
        .enable_macos_default_menu(false)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Track the focused window label so on_menu_event can route
            // native menu commands (Cmd+W, etc.) to the correct window.
            // Initialized to "main" - the main window is focused on launch.
            app.manage(FocusedWindow(Mutex::new(String::from("main"))));

            // Install the custom macOS menu (default minus "Select All").
            #[cfg(target_os = "macos")]
            {
                menu::setup_menu(app.handle())?;
            }
            Ok(())
        })
        // Intercept window close requests (traffic-light close button) before
        // WKWebView closes the window. We emit an event to JS and let it
        // decide. Only the main window is intercepted; child windows close
        // directly. Cmd+W is handled separately via on_menu_event below.
        // We also track the focused window here (WindowEvent::Focused) so
        // that on_menu_event can reliably route menu commands - Tauri's
        // Window::is_focused() is unreliable for child windows.
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    on_window_close_requested(window, api);
                }
                tauri::WindowEvent::Focused(focused) if *focused => {
                    // Record this window as the focused one. Used by
                    // on_menu_event to route native menu commands.
                    if let Some(state) = window.app_handle().try_state::<FocusedWindow>() {
                        if let Ok(mut guard) = state.0.lock() {
                            *guard = window.label().to_string();
                        }
                    }
                }
                _ => {}
            }
        })
        // Native menu events use the same command IDs as DOM shortcuts. Route
        // each command to the focused window so detached document/preview/
        // terminal windows act on their own store instead of the main window.
        // We prefer the FocusedWindow-tracked label (reliable) over
        // Window::is_focused() (unreliable for child windows), falling back
        // to is_focused() and finally "main" so a command is never dropped.
        .on_menu_event(menu::on_menu_event)
        .invoke_handler(tauri::generate_handler![
            // ── storage: paths ──
            commands::storage::paths::ensure_studio_dir,
            commands::storage::paths::open_studio_dir,
            commands::storage::paths::open_doc_dir,
            commands::storage::paths::get_doc_path,
            commands::storage::paths::read_file_bytes,
            commands::storage::paths::write_file_bytes,
            commands::storage::paths::copy_image_to_clipboard,
            commands::storage::paths::copy_image_bytes_to_clipboard,
            // ── storage: documents ──
            commands::storage::documents::read_index,
            commands::storage::documents::write_index,
            commands::storage::documents::read_document,
            commands::storage::documents::write_document,
            commands::storage::documents::delete_document,
            // ── storage: document backups ──
            commands::storage::backups::list_doc_backups,
            commands::storage::backups::read_doc_backup,
            commands::storage::backups::restore_doc_backup,
            // ── storage: folders ──
            commands::storage::folders::read_folders,
            commands::storage::folders::write_folders,
            // ── storage: settings ──
            commands::storage::settings::read_settings,
            commands::storage::settings::write_settings,
            commands::storage::settings::read_agent_config,
            commands::storage::settings::write_agent_config,
            // ── agent (j-agent integration) ──
            commands::agent::agent_list_sessions,
            commands::agent::agent_create_session,
            commands::agent::agent_load_session,
            commands::agent::agent_delete_session,
            commands::agent::agent_start_session,
            commands::agent::agent_send_message,
            commands::agent::agent_tool_result,
            commands::agent::agent_cancel,
            commands::agent::agent_set_auto_approve,
            commands::agent::agent_submit_ask_answer,
            // ── storage: assets ──
            commands::storage::assets::save_doc_asset,
            commands::storage::assets::delete_doc_asset,
            commands::storage::assets::list_doc_assets,
            commands::storage::assets::clean_global_assets,
            commands::storage::assets::trash_doc_asset,
            commands::storage::assets::list_trashed_assets,
            commands::storage::assets::restore_trashed_asset,
            commands::storage::assets::delete_trashed_asset,
            // ── storage: markdown ──
            commands::storage::markdown::list_markdown_files,
            // ── storage: cache ──
            commands::storage::cache::set_preview_data,
            commands::storage::cache::get_preview_data,
            commands::storage::cache::set_diagram_update,
            commands::storage::cache::get_diagram_update,
            commands::storage::cache::clear_diagram_update,
            // ── document backup bundles (.jnote) ──
            commands::bundle::export_document_bundle,
            commands::bundle::import_document_bundle,
            // ── terminal (PTY) ──
            commands::terminal::pty_create,
            commands::terminal::pty_write,
            commands::terminal::pty_write_batch,
            commands::terminal::pty_resize,
            commands::terminal::pty_kill,
            commands::terminal::pty_kill_all,
            commands::terminal::pty_list,
            commands::terminal::pty_set_title,
            commands::terminal::pty_is_alive,
            // ── jcli ──
            commands::jcli::check_jcli,
            commands::jcli::install_jcli,
            commands::jcli::uninstall_jcli,
            // ── link preview ──
            commands::link::fetch_link_metadata,
            commands::link::open_link_preview,
            // ── AI graph HTTP proxy (bypasses webview CORS) ──
            commands::ai_graph::ai_graph_fetch,
            commands::ai_graph::write_graph_log,
            // ── link preview tabs (multi-webview) ──
            commands::link_tabs::open_link_preview_with_tabs,
            commands::link_tabs::get_link_preview_tabs_state,
            commands::link_tabs::add_link_preview_tab,
            commands::link_tabs::switch_link_preview_tab,
            commands::link_tabs::close_link_preview_tab,
            commands::link_tabs::navigate_link_preview_tab,
            commands::link_tabs::refresh_link_preview_tab,
            commands::link_tabs::open_url_in_browser,
            commands::link_tabs::get_current_window_label,
            commands::link_tabs::open_or_focus_link_preview,
            // ── inline browser panel (main window) ──
            commands::link_tabs::show_browser_panel,
            commands::link_tabs::hide_browser_panel,
            commands::link_tabs::update_browser_panel_rect,
            commands::link_tabs::get_browser_panel_tabs_state,
            commands::link_tabs::select_all_in_active_browser_tab,
            // ── terminal detach (tear-off window mailbox) ──
            commands::detach::set_terminal_detach_payload,
            commands::detach::get_terminal_detach_payload,
            commands::detach::clear_terminal_detach_payload,
            // ── global OS shortcuts ──
            commands::global_shortcut::register_global_shortcut,
            commands::global_shortcut::unregister_global_shortcut,
            commands::global_shortcut::unregister_all_global_shortcuts,
            // ── debug / build info ──
            commands::debug::get_build_info,
            commands::debug::open_devtools,
            // ── runtime log file (frontend -> ~/.jdata/studio/logs/) ──
            commands::debug::append_log_line,
            commands::debug::get_log_file_path,
            commands::debug::open_logs_dir,
            commands::debug::clear_logs,
            // ── window control ──
            commands::window::close_window,
            commands::window::set_native_menu_accelerator,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jstudio tauri application");
}
