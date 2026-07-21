mod commands;
mod db;

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
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

/// Build the macOS app menu identical to Tauri's default, EXCEPT the Edit
/// menu's "Select All" item is omitted.
///
/// Why: Tauri's default menu includes `PredefinedMenuItem::select_all` bound
/// to Cmd+A. macOS dispatches Cmd+A to that menu item via
/// `performKeyEquivalent:` BEFORE generating a DOM keydown event, so the
/// editor's JS keyboard handlers (ProseMirror keymap AND window-capture
/// listeners) never see Cmd+A — breaking in-code-block "select all" and any
/// other Cmd+A handling. Removing the menu item lets Cmd+A flow through to
/// the webview like any ordinary key (the same path Cmd+Arrow already takes;
/// see docs/bug-graveyard.md #001). The structure mirrors Tauri 2.11's
/// `Menu::default` (src/menu/menu.rs) item-for-item, minus that one item.
#[cfg(target_os = "macos")]
fn build_app_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<(Menu<R>, MenuItem<R>, MenuItem<R>)> {
    let pkg = app.package_info();
    let about = AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        ..Default::default()
    };

    let app_submenu = Submenu::with_items(
        app,
        pkg.name.as_str(),
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_submenu = Submenu::with_items(
        app,
        "File",
        true,
        &[&PredefinedMenuItem::close_window(app, None)?],
    )?;

    // Edit menu — intentionally WITHOUT `select_all` (see fn doc above).
    // Find starts without an accelerator. After settings load, the frontend
    // synchronizes the effective user binding through
    // `set_native_menu_accelerator`; an explicit unbind therefore remains
    // unbound instead of briefly restoring Cmd+F during startup.
    let find_item = MenuItem::with_id(app, "app.find", "Find...", true, None::<&str>)?;

    // Inline code menu item — bound to Cmd+` by default.
    //
    // Why: macOS reserves Cmd+` for the system "Cycle Windows" accelerator.
    // Without a menu item claiming that key equivalent, macOS swallows the
    // event at performKeyEquivalent: time and no DOM keydown ever reaches
    // the webview (same family as bug-graveyard.md #001). By installing a
    // menu item with the Cmd+` accelerator, macOS routes the keypress to
    // our item instead of the system, and we forward it to the focused
    // webview via the `native-command` event. The accelerator is kept in
    // sync with the user's customized binding via `set_native_menu_accelerator`
    // (see App.tsx).
    let inline_code_item = MenuItem::with_id(
        app,
        "editor.inlineCode",
        "Inline Code",
        true,
        Some("CmdOrCtrl+`"),
    )?;

    // Undo / Redo menu items - custom MenuItem (NOT PredefinedMenuItem).
    //
    // Why: PredefinedMenuItem::undo/redo trigger the WKWebView's *native*
    // undo/redo, which tracks DOM `input` events (typing) but is unaware of
    // ProseMirror transactions. Pasted content inserted via
    // `editor.commands.insertContent()` (after `preventDefault()` on the
    // paste event) is never recorded in the native undo stack, so Cmd+Z
    // could undo typing but NOT paste. By using custom MenuItems with the
    // same accelerators, macOS still routes Cmd+Z / Cmd+Shift+Z to our
    // menu items via `performKeyEquivalent:`, but instead of the native
    // action we emit a `native-command` event that the frontend forwards
    // to ProseMirror's `editor.commands.undo()/redo()`. Same pattern as
    // `editor.inlineCode` (Cmd+`) above.
    let undo_item = MenuItem::with_id(app, "editor.undo", "Undo", true, Some("CmdOrCtrl+Z"))?;
    let redo_item = MenuItem::with_id(app, "editor.redo", "Redo", true, Some("CmdOrCtrl+Shift+Z"))?;

    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &undo_item,
            &redo_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &find_item,
            &PredefinedMenuItem::separator(app)?,
            &inline_code_item,
        ],
    )?;

    let view_submenu = Submenu::with_items(
        app,
        "View",
        true,
        &[&PredefinedMenuItem::fullscreen(app, None)?],
    )?;

    let window_submenu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_submenu = Submenu::with_items(app, "Help", true, &[])?;

    let menu = Menu::with_items(
        app,
        &[
            &app_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
            &help_submenu,
        ],
    )?;

    Ok((menu, find_item, inline_code_item))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Tauri's default macOS menu includes Edit > "Select All" (Cmd+A),
        // which macOS intercepts via performKeyEquivalent: before any DOM
        // keydown is generated — so the editor never sees Cmd+A. We disable
        // the default menu and install a custom one (build_app_menu) that is
        // identical except it omits the "Select All" item. Cmd+A then flows
        // through to the webview like Cmd+Arrow. See build_app_menu + the
        // window-capture handler in SectionedEditorPanel.tsx.
        .enable_macos_default_menu(false)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Install the custom macOS menu (default minus "Select All").
            #[cfg(target_os = "macos")]
            {
                let (menu, find_item, inline_code_item) = build_app_menu(app.handle())?;
                app.manage(commands::window::NativeMenuState {
                    find_item,
                    inline_code_item,
                });
                app.set_menu(menu)?;
            }
            Ok(())
        })
        // Intercept window close requests (Cmd+W on macOS) before WKWebView
        // closes the window. We emit an event to JS and let it decide.
        // Only the main window is intercepted; child windows close directly.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                on_window_close_requested(window, api);
            }
        })
        // Native menu events use the same command IDs as DOM shortcuts. Send
        // only to the focused WebView so detached document windows execute
        // against their own store instead of opening UI in the main window.
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if (id == "app.find"
                || id == "editor.inlineCode"
                || id == "editor.undo"
                || id == "editor.redo")
                && let Some((label, _)) = app
                    .webview_windows()
                    .into_iter()
                    .find(|(_, window)| window.is_focused().unwrap_or(false))
            {
                let _ = app.emit_to(label, "native-command", id.to_string());
            }
        })
        .invoke_handler(tauri::generate_handler![
            // ── storage: paths ──
            commands::storage::paths::ensure_studio_dir,
            commands::storage::paths::open_studio_dir,
            commands::storage::paths::open_doc_dir,
            commands::storage::paths::get_doc_path,
            commands::storage::paths::read_file_bytes,
            commands::storage::paths::copy_image_to_clipboard,
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
            commands::window::set_native_menu_accelerator,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jstudio tauri application");
}
