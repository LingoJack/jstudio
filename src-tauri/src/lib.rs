mod commands;
mod db;

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

#[cfg(target_os = "macos")]
mod macos_menu_cleanup {
    //! macOS automatically injects "AutoFill", "Start Dictation...", and
    //! "Emoji & Symbols" items into any submenu named "Edit". These are
    //! system items that Tauri/muda does not create and cannot remove via
    //! its public API. We prune them by accessing the native NSMenu
    //! directly and deleting every item beyond the ones we explicitly add.

    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSMenu};
    use std::ffi::c_void;

    /// Items we explicitly add to the Edit menu:
    /// Undo, Redo, separator, Cut, Copy, Paste, separator, Find, separator, Inline Code
    const EDIT_MENU_ITEM_COUNT: isize = 10;

    // dispatch_get_main_queue() is a C macro (not a real function) that
    // expands to &_dispatch_main_q. We declare the global directly.
    unsafe extern "C" {
        static _dispatch_main_q: c_void;
        fn dispatch_async_f(
            queue: *mut c_void,
            context: *mut c_void,
            work: extern "C" fn(*mut c_void),
        );
    }

    extern "C" fn prune(_ctx: *mut c_void) {
        // SAFETY: runs on the main thread via dispatch_async_f.
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let app = NSApplication::sharedApplication(mtm);
        if let Some(main_menu) = app.mainMenu() {
            // Edit menu is at index 1 (index 0 is the app menu).
            if let Some(edit_item) = main_menu.itemAtIndex(1) {
                if let Some(edit_menu) = edit_item.submenu() {
                    remove_system_items(&edit_menu);
                }
            }
        }
    }

    fn remove_system_items(edit_menu: &NSMenu) {
        let count = edit_menu.numberOfItems();
        // Remove all items beyond our explicit count. System items
        // (AutoFill, Start Dictation, Emoji & Symbols) are appended
        // after our items, often preceded by a separator.
        if count > EDIT_MENU_ITEM_COUNT {
            for i in (EDIT_MENU_ITEM_COUNT..count).rev() {
                edit_menu.removeItemAtIndex(i);
            }
        }
    }

    /// Schedule the pruning on the next main-thread run-loop iteration.
    /// The system items are injected during app launch, so we defer
    /// slightly to ensure they exist before we remove them.
    pub fn schedule() {
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(200));
            unsafe {
                // dispatch_get_main_queue() expands to &_dispatch_main_q
                let main_queue = &_dispatch_main_q as *const c_void as *mut c_void;
                dispatch_async_f(main_queue, std::ptr::null_mut(), prune);
            }
        });
    }
}

/// Tracks the label of the currently-focused window.
///
/// Updated from `WindowEvent::Focused` and read by `on_menu_event` to route
/// native menu commands (Cmd+W, Cmd+F, …) to the focused window. Tauri's
/// `Window::is_focused()` is unreliable for child windows — it can keep
/// reporting the main window as focused after a child gains focus — so we
/// track focus ourselves.
struct FocusedWindow(Mutex<String>);

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

/// Build the macOS app menu identical to Tauri's default, EXCEPT the Edit
/// menu's "Select All" item is a custom `MenuItem` (not
/// `PredefinedMenuItem::select_all`) so the keypress is forwarded to the
/// frontend via `native-command` instead of triggering WKWebView's native
/// select-all.
///
/// Why: `PredefinedMenuItem::select_all` calls WKWebView's native
/// `selectAll:`, which selects all text in the focused editing host. For the
/// sectioned editor this only grabs the CURRENT section — not the whole
/// document — and ignores code-block scoping. By using a custom `MenuItem`
/// with the same Cmd+A accelerator, macOS still routes the keypress through
/// `performKeyEquivalent:` → `on_menu_event`, but instead of the native
/// action we emit a `native-command` event (`"app.selectAll"`) that the
/// frontend dispatches via `commandRegistry` → `selectAllRegistry`. Same
/// pattern as `editor.undo` / `editor.redo` / `editor.inlineCode`.
#[cfg(target_os = "macos")]
fn build_app_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<(Menu<R>, MenuItem<R>, MenuItem<R>)> {
    let pkg = app.package_info();

    let app_submenu = Submenu::with_items(
        app,
        pkg.name.as_str(),
        true,
        &[
            &MenuItem::with_id(
                app,
                "app.openSettings",
                "Settings...",
                true,
                Some("CmdOrCtrl+,"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    // ── Edit menu ──────────────────────────────────────────────────────
    // Find starts without an accelerator. After settings load, the frontend
    // synchronizes the effective user binding through
    // `set_native_menu_accelerator`; an explicit unbind therefore remains
    // unbound instead of briefly restoring Cmd+F during startup.
    let find_item = MenuItem::with_id(app, "app.find", "Find...", true, None::<&str>)?;

    // Select All menu item — custom MenuItem (NOT PredefinedMenuItem).
    //
    // Why: PredefinedMenuItem::select_all triggers WKWebView's native
    // select-all, which only selects the currently-focused editing host
    // (one section in the sectioned editor) and ignores code-block scoping.
    // By using a custom MenuItem, macOS routes Cmd+A through
    // `performKeyEquivalent:` → `on_menu_event` → `native-command`
    // ("app.selectAll"), and the frontend's `commandRegistry` dispatches it
    // to the appropriate handler (input.select(), editor code-block-scoped
    // / cross-section select-all, or browser content webview). Same pattern
    // as editor.undo / editor.redo / editor.inlineCode above.
    let select_all_item = MenuItem::with_id(
        app,
        "app.selectAll",
        "Select All",
        true,
        Some("CmdOrCtrl+A"),
    )?;

    // Inline code menu item - bound to Cmd+` by default.
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
            &select_all_item,
            &PredefinedMenuItem::separator(app)?,
            &find_item,
            &PredefinedMenuItem::separator(app)?,
            &inline_code_item,
        ],
    )?;

    // ── Window menu ────────────────────────────────────────────────────
    // All tab/window management in one menu. Custom MenuItems (NOT
    // PredefinedMenuItem) so keypresses route through on_menu_event ->
    // "native-command" -> executeShortcutAction, same pattern as the Edit
    // menu items above. The traffic-light close button still triggers
    // CloseRequested -> on_window_close_requested -> "window-close-requested"
    // (see on_window_event in run()).
    let new_terminal_tab_item = MenuItem::with_id(
        app,
        "terminal.newTab",
        "New Terminal Tab",
        true,
        Some("CmdOrCtrl+T"),
    )?;
    let close_tab_item =
        MenuItem::with_id(app, "app.closeTab", "Close Tab", true, Some("CmdOrCtrl+W"))?;

    let window_submenu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &new_terminal_tab_item,
            &close_tab_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::minimize(app, None)?,
        ],
    )?;

    let menu = Menu::with_items(app, &[&app_submenu, &edit_submenu, &window_submenu])?;

    Ok((menu, find_item, inline_code_item))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Tauri's default macOS menu includes Edit > "Select All" (Cmd+A)
        // via PredefinedMenuItem::select_all, which triggers WKWebView's
        // native select-all — that only grabs the focused editing host (one
        // section in the sectioned editor) and ignores code-block scoping.
        // We disable the default menu and install a custom one (build_app_menu)
        // that replaces "Select All" with a custom MenuItem bound to the same
        // Cmd+A accelerator. macOS still routes the keypress through
        // performKeyEquivalent: → on_menu_event, but instead of the native
        // action we emit a `native-command` ("app.selectAll") that the
        // frontend dispatches via commandRegistry → selectAllRegistry (same
        // forwarding pattern as editor.undo / editor.redo / editor.inlineCode).
        .enable_macos_default_menu(false)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Track the focused window label so on_menu_event can route
            // native menu commands (Cmd+W, etc.) to the correct window.
            // Initialized to "main" — the main window is focused on launch.
            app.manage(FocusedWindow(Mutex::new(String::from("main"))));

            // Install the custom macOS menu (default minus "Select All").
            #[cfg(target_os = "macos")]
            {
                let (menu, find_item, inline_code_item) = build_app_menu(app.handle())?;
                app.manage(commands::window::NativeMenuState {
                    find_item,
                    inline_code_item,
                });
                app.set_menu(menu)?;
                // Prune macOS system-injected Edit menu items (AutoFill,
                // Start Dictation, Emoji & Symbols) after the menu is set.
                macos_menu_cleanup::schedule();
            }
            Ok(())
        })
        // Intercept window close requests (traffic-light close button) before
        // WKWebView closes the window. We emit an event to JS and let it
        // decide. Only the main window is intercepted; child windows close
        // directly. Cmd+W is handled separately via on_menu_event below.
        // We also track the focused window here (WindowEvent::Focused) so
        // that on_menu_event can reliably route menu commands — Tauri's
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
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let routed = id == "app.find"
                || id == "app.openSettings"
                || id == "editor.inlineCode"
                || id == "editor.undo"
                || id == "editor.redo"
                || id == "app.closeTab"
                || id == "terminal.newTab"
                || id == "app.selectAll";
            if !routed {
                return;
            }

            let target = app
                .try_state::<FocusedWindow>()
                .and_then(|s| s.0.lock().ok().map(|g| g.clone()))
                .filter(|label| {
                    // Use get_window (not get_webview_window) because the
                    // link-preview window hosts multiple webviews whose
                    // labels differ from the window label — get_webview_window
                    // would return None for it and we'd fall back to "main",
                    // causing Cmd+T/Cmd+W to always hit the main window.
                    app.get_window(label).is_some() || app.get_webview_window(label).is_some()
                })
                .or_else(|| {
                    app.webview_windows()
                        .into_iter()
                        .find(|(_, w)| w.is_focused().unwrap_or(false))
                        .map(|(label, _)| label)
                })
                .unwrap_or_else(|| "main".to_string());

            // Link-preview window handles Cmd+T / Cmd+W natively on the
            // Rust side — don't emit `native-command` for these, otherwise
            // the main window's ShortcutManager also receives the event
            // (because the link-preview window hosts multiple webviews and
            // event scoping is unreliable), causing Cmd+T to fire in both
            // windows simultaneously.
            if commands::link_tabs::is_link_preview_window(&target) {
                match id {
                    "terminal.newTab" => {
                        let _ = commands::link_tabs::add_tab_to_focused_preview(app);
                        return;
                    }
                    "app.closeTab" => {
                        let _ = commands::link_tabs::close_active_tab_in_focused_preview(app);
                        return;
                    }
                    _ => {}
                }
            }

            // Inline browser panel in the main window: when visible, Cmd+T
            // and Cmd+W should act on the browser tabs (not the editor's
            // document tabs). The visible flag is set by show_browser_panel
            // / hide_browser_panel. Handling this on the Rust side (instead
            // of emitting native-command) keeps the editor's ShortcutManager
            // from also receiving the event.
            if target == "main" && commands::link_tabs::is_browser_panel_visible() {
                match id {
                    "terminal.newTab" => {
                        let _ = commands::link_tabs::add_tab_to_main_browser(app);
                        return;
                    }
                    "app.closeTab" => {
                        let _ = commands::link_tabs::close_active_tab_in_main_browser(app);
                        return;
                    }
                    _ => {}
                }
            }

            // ── app.selectAll: forward to the focused webview ──
            // The main window and detached document windows run ShortcutManager,
            // which listens for `native-command` and dispatches via
            // `commandRegistry` (handles inputs, editor code-block scoping /
            // cross-section select-all, and browser content webviews).
            //
            // Other detached windows (link-preview, preview, diagram,
            // command-palette, terminal) don't run ShortcutManager, so we
            // eval_js a select-all script directly into their webviews. For
            // link-preview windows this covers both the UI webview (address
            // bar) and the active content webview (external page).
            if id == "app.selectAll" {
                if commands::link_tabs::is_link_preview_window(&target) {
                    let _ = commands::link_tabs::select_all_in_link_preview(app, &target);
                    return;
                }
                if target != "main" && !target.starts_with("document-") {
                    // Detached window without ShortcutManager — eval_js
                    // select-all directly.
                    let script = "(function(){var el=document.activeElement;\
                        if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'))el.select();\
                        else document.execCommand('selectAll')})()";
                    if let Some(wv) = app.get_webview(&target) {
                        let _ = wv.eval(script);
                    }
                    return;
                }
                // Main + document windows: fall through to emit_to below
                // (ShortcutManager handles it).
            }

            let _ = app.emit_to(target, "native-command", id.to_string());
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
            // ── window control ──
            commands::window::close_window,
            commands::window::set_native_menu_accelerator,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jstudio tauri application");
}
