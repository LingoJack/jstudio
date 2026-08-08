//! Native macOS application menu: construction, installation, and event routing.
//!
//! On macOS the default Tauri menu includes `PredefinedMenuItem` entries for
//! Undo / Redo / Select All that trigger WKWebView's *native* actions. These
//! are incompatible with the sectioned editor (native undo doesn't track
//! ProseMirror transactions; native select-all only grabs the focused editing
//! host). This module builds a custom menu that replaces those with custom
//! `MenuItem`s so the keypresses route through `on_menu_event` ->
//! `native-command` -> frontend `commandRegistry` instead.
//!
//! It also prunes the system-injected "AutoFill", "Start Dictation…", and
//! "Emoji & Symbols" items that macOS adds to any submenu named "Edit".

use tauri::{Emitter, Manager};

#[cfg(target_os = "macos")]
use tauri::Runtime;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

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
    /// Undo, Redo, separator, Cut, Copy, Paste, Select All, separator,
    /// Inline Code, separator, Find
    const EDIT_MENU_ITEM_COUNT: isize = 11;

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

/// Build the macOS app menu identical to Tauri's default, EXCEPT the Edit
/// menu's "Select All" item is a custom `MenuItem` (not
/// `PredefinedMenuItem::select_all`) so the keypress is forwarded to the
/// frontend via `native-command` instead of triggering WKWebView's native
/// select-all.
///
/// Why: `PredefinedMenuItem::select_all` calls WKWebView's native
/// `selectAll:`, which selects all text in the focused editing host. For the
/// sectioned editor this only grabs the CURRENT section - not the whole
/// document - and ignores code-block scoping. By using a custom `MenuItem`
/// with the same Cmd+A accelerator, macOS still routes the keypress through
/// `performKeyEquivalent:` -> `on_menu_event`, but instead of the native
/// action we emit a `native-command` event (`"app.selectAll"`) that the
/// frontend dispatches via `commandRegistry` -> `selectAllRegistry`. Same
/// pattern as `editor.undo` / `editor.redo` / `editor.inlineCode`.
#[cfg(target_os = "macos")]
fn build_app_menu<R: Runtime>(
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

    // Select All menu item - custom MenuItem (NOT PredefinedMenuItem).
    //
    // Why: PredefinedMenuItem::select_all triggers WKWebView's native
    // select-all, which only selects the currently-focused editing host
    // (one section in the sectioned editor) and ignores code-block scoping.
    // By using a custom MenuItem, macOS routes Cmd+A through
    // `performKeyEquivalent:` -> `on_menu_event` -> `native-command`
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

    // Cut / Copy / Paste - custom MenuItems (NOT PredefinedMenuItem).
    //
    // Why: macOS renders system icons for PredefinedMenuItem entries based
    // on their standard action selectors (cut:/copy:/paste:). Using custom
    // MenuItems avoids the icons while keeping the same Cmd+X/C/V
    // accelerators. In `on_menu_event`, the native cut:/copy:/paste: action
    // is forwarded to the first responder via NSApplication sendAction:to:from:,
    // so the WKWebView's native clipboard behavior (rich text, images, etc.)
    // is fully preserved.
    let cut_item = MenuItem::with_id(app, "app.cut", "Cut", true, Some("CmdOrCtrl+X"))?;
    let copy_item = MenuItem::with_id(app, "app.copy", "Copy", true, Some("CmdOrCtrl+C"))?;
    let paste_item = MenuItem::with_id(app, "app.paste", "Paste", true, Some("CmdOrCtrl+V"))?;

    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &undo_item,
            &redo_item,
            &PredefinedMenuItem::separator(app)?,
            &cut_item,
            &copy_item,
            &paste_item,
            &select_all_item,
            &PredefinedMenuItem::separator(app)?,
            &inline_code_item,
            &PredefinedMenuItem::separator(app)?,
            &find_item,
        ],
    )?;

    // ── Window menu ────────────────────────────────────────────────────
    // All tab/window management in one menu. Custom MenuItems (NOT
    // PredefinedMenuItem) so keypresses route through on_menu_event ->
    // "native-command" -> executeShortcutAction, same pattern as the Edit
    // menu items above. The traffic-light close button still triggers
    // CloseRequested -> on_window_close_requested -> "window-close-requested"
    // (see on_window_event in run()).
    let new_terminal_tab_item =
        MenuItem::with_id(app, "app.newTab", "New Tab", true, Some("CmdOrCtrl+T"))?;
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

/// Install the custom macOS menu.
///
/// Called from the app `setup` hook. Builds the menu, registers
/// `NativeMenuState` (holding the find / inline-code items so the frontend
/// can update their accelerators via `set_native_menu_accelerator`), sets
/// the menu, and schedules pruning of system-injected Edit menu items.
#[cfg(target_os = "macos")]
pub fn setup_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let (menu, find_item, inline_code_item) = build_app_menu(app)?;
    app.manage(crate::commands::window::NativeMenuState {
        find_item,
        inline_code_item,
    });
    app.set_menu(menu)?;
    // Prune macOS system-injected Edit menu items (AutoFill,
    // Start Dictation, Emoji & Symbols) after the menu is set.
    macos_menu_cleanup::schedule();
    Ok(())
}

/// Forward a standard edit action (`cut:`/`copy:`/`paste:`) to the first
/// responder via `NSApplication sendAction:to:from:`. With a nil target,
/// the application searches the key window's responder chain, finding the
/// WKWebView's first responder and triggering native clipboard behavior
/// (rich text, images, etc.) exactly as `PredefinedMenuItem` would.
#[cfg(target_os = "macos")]
fn forward_native_edit_action(action: &str) {
    use objc2::MainThreadMarker;
    use objc2::msg_send;
    use objc2::runtime::Sel;
    use objc2_app_kit::NSApplication;

    let mtm = match MainThreadMarker::new() {
        Some(mtm) => mtm,
        None => return,
    };

    let sel = match action {
        "cut:" => Sel::register(c"cut:"),
        "copy:" => Sel::register(c"copy:"),
        "paste:" => Sel::register(c"paste:"),
        _ => return,
    };

    let app = NSApplication::sharedApplication(mtm);
    let _: bool = unsafe {
        msg_send![
            &app,
            sendAction: sel,
            to: std::ptr::null::<objc2::runtime::AnyObject>(),
            from: std::ptr::null::<objc2::runtime::AnyObject>()
        ]
    };
}

/// Native menu event handler.
///
/// Routes menu commands to the focused window so detached
/// document/preview/terminal windows act on their own store instead of the
/// main window. We prefer the `FocusedWindow`-tracked label (reliable) over
/// `Window::is_focused()` (unreliable for child windows), falling back to
/// `is_focused()` and finally "main" so a command is never dropped.
pub fn on_menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();
    let routed = id == "app.find"
        || id == "app.openSettings"
        || id == "editor.inlineCode"
        || id == "editor.undo"
        || id == "editor.redo"
        || id == "app.closeTab"
        || id == "app.newTab"
        || id == "app.selectAll"
        || id == "app.cut"
        || id == "app.copy"
        || id == "app.paste";
    if !routed {
        return;
    }

    // ── Cut / Copy / Paste: forward native action ──
    // Custom MenuItems are used instead of PredefinedMenuItem to avoid
    // macOS system icons. Forward the standard cut:/copy:/paste: selector
    // to the first responder via NSApplication sendAction:to:from: so the
    // WKWebView's native clipboard behavior (rich text, images, etc.) is
    // fully preserved. This works for ALL windows (main, detached, etc.)
    // because sendAction searches the key window's responder chain.
    #[cfg(target_os = "macos")]
    {
        if let Some(action) = match id {
            "app.cut" => Some("cut:"),
            "app.copy" => Some("copy:"),
            "app.paste" => Some("paste:"),
            _ => None,
        } {
            forward_native_edit_action(action);
            return;
        }
    }

    let target = app
        .try_state::<crate::FocusedWindow>()
        .and_then(|s| s.0.lock().ok().map(|g| g.clone()))
        .filter(|label| {
            // Use get_window (not get_webview_window) because the
            // link-preview window hosts multiple webviews whose
            // labels differ from the window label - get_webview_window
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
    // Rust side - don't emit `native-command` for these, otherwise
    // the main window's ShortcutManager also receives the event
    // (because the link-preview window hosts multiple webviews and
    // event scoping is unreliable), causing Cmd+T to fire in both
    // windows simultaneously.
    if crate::commands::link_tabs::is_link_preview_window(&target) {
        match id {
            "app.newTab" => {
                let _ = crate::commands::link_tabs::add_tab_to_focused_preview(app);
                return;
            }
            "app.closeTab" => {
                let _ = crate::commands::link_tabs::close_active_tab_in_focused_preview(app);
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
    if target == "main" && crate::commands::link_tabs::is_browser_panel_visible() {
        match id {
            "app.newTab" => {
                let _ = crate::commands::link_tabs::add_tab_to_main_browser(app);
                return;
            }
            "app.closeTab" => {
                let _ = crate::commands::link_tabs::close_active_tab_in_main_browser(app);
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
        if crate::commands::link_tabs::is_link_preview_window(&target) {
            let _ = crate::commands::link_tabs::select_all_in_link_preview(app, &target);
            return;
        }
        if target != "main" && !target.starts_with("document-") {
            // Detached window without ShortcutManager - eval_js
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
}
