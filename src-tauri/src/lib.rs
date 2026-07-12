mod commands;
mod db;

use tauri::{Emitter, Manager};

/// Handle window close requests (Cmd+W on macOS).
///
/// Only intercepts close requests for the **main window**. Child windows
/// (preview, diagram, terminal detach, document detach) are allowed to
/// close directly without triggering the tab-close logic.
///
/// For the main window, we prevent the default action and emit an event
/// to the frontend, letting it decide whether to close the current tab
/// or the entire window.
fn on_window_close_requested(window: &tauri::Window, api: &tauri::CloseRequestApi) {
    // Only intercept close requests for the main window.
    // Child windows (preview, diagram, terminal, document) should close directly.
    let label = window.label();
    if label != "main" {
        // Let child windows close normally.
        return;
    }

    // Prevent the default close action — we'll handle it in JS.
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Intercept window close requests (Cmd+W on macOS) before WKWebView
        // closes the window. We emit an event to JS and let it decide.
        // Only the main window is intercepted; child windows close directly.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                on_window_close_requested(window, api);
            }
        })
        .invoke_handler(tauri::generate_handler![
            // ── storage: paths ──
            commands::storage::paths::ensure_studio_dir,
            commands::storage::paths::open_studio_dir,
            commands::storage::paths::open_doc_dir,
            commands::storage::paths::get_doc_path,
            commands::storage::paths::read_file_bytes,
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
            // ── window control ──
            commands::window::close_window,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jstudio tauri application");
}
