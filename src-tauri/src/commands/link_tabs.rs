/*!
 * Link preview tabs — multi-webview browser-like window.
 *
 * Uses Tauri's `unstable` feature to access WindowBuilder + WebviewBuilder API.
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  Window (no default webview)                                 │
 * │  ┌────────────────────────────────────────────────────────┐  │
 * │  │ UI Webview (React — tab strip + address bar)           │  │
 * │  │ Height: ~80px (tab strip 36px + address bar ~38px)     │  │
 * │  └────────────────────────────────────────────────────────┘  │
 * │  ┌────────────────────────────────────────────────────────┐  │
 * │  │ Content Webview(s) — one per tab, only active visible  │  │
 * │  │ Visible: positioned at Y=ui_height, fills rest         │  │
 * │  │ Hidden: positioned at Y=9999 (off-screen)              │  │
 * │  └────────────────────────────────────────────────────────┘  │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Key design decisions:
 *   - All sizes use **logical** pixels. Physical sizes from `window.inner_size()`
 *     are converted via `to_logical(scale_factor)` to avoid 2× scaling on Retina.
 *   - Window resize events re-layout the UI + active content webview.
 *   - `on_page_load` + `on_document_title_changed` track loading/title/URL.
 *   - `on_new_window` opens `window.open()` targets as new tabs.
 *   - State changes emit `link-preview:tabs-updated` (full TabsState) to frontend.
 *   - Closed tabs' webviews are destroyed via `webview.close()`.
 */

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl,
    WindowBuilder, WindowEvent,
};

use super::link::{BROWSER_UA, extract_domain, read_chrome_cookies_cached};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// UI webview height in logical pixels.
/// Address bar (~38px) at top + floating glassmorphism tab bar (~52px area) at bottom.
const UI_HEIGHT: f64 = 90.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Tab info sent to frontend for UI rendering.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TabInfo {
    pub id: String,
    pub url: String,
    pub title: String,
    pub loading: bool,
}

/// Full tabs state (list + active) sent to frontend.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TabsState {
    pub tabs: Vec<TabInfo>,
    pub active_tab_id: Option<String>,
}

/// Per-window tab manager state.
struct TabManager {
    /// Tabs by their ID.
    tabs: HashMap<String, Tab>,
    /// Tab IDs in insertion order — used for stable tab-strip ordering and
    /// for picking the adjacent tab when the active one closes. HashMap
    /// iteration is random, so we keep this vec authoritative for order.
    tab_order: Vec<String>,
    /// Currently active tab ID.
    active_tab_id: Option<String>,
}

/// Internal tab representation.
#[derive(Clone)]
struct Tab {
    id: String,
    webview_label: String,
    url: String,
    title: String,
    loading: bool,
}

// ---------------------------------------------------------------------------
// Global registry
// ---------------------------------------------------------------------------

static TAB_MANAGERS: OnceLock<Mutex<HashMap<String, Arc<Mutex<TabManager>>>>> = OnceLock::new();
static TAB_COUNTER: AtomicU64 = AtomicU64::new(1);

fn get_managers() -> &'static Mutex<HashMap<String, Arc<Mutex<TabManager>>>> {
    TAB_MANAGERS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Generate a globally unique ID (avoids timestamp collisions).
fn next_id() -> u64 {
    TAB_COUNTER.fetch_add(1, Ordering::Relaxed)
}

/// Derive the UI webview label for a given window (must be unique per window).
fn ui_webview_label(window_label: &str) -> String {
    format!("ui-{}", window_label)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Open a new link preview window with tabs support.
#[tauri::command]
pub async fn open_link_preview_with_tabs(app: AppHandle, url: String) -> Result<String, String> {
    let id = next_id();
    let window_label = format!("link-preview-tabs-{}", id);

    // Create the window (without default webview) using unstable API
    let window = WindowBuilder::new(&app, &window_label)
        .title("Link Preview")
        .inner_size(1100.0, 800.0)
        .min_inner_size(400.0, 300.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("failed to create window: {e}"))?;

    // --- Create UI webview (React frontend for tab strip + address bar) ---
    let ui_label = ui_webview_label(&window_label);
    let ui_url = format!(
        "index.html?window=link-preview-tabs&windowLabel={}",
        window_label
    );

    let (logical_w, _logical_h) = logical_window_size(&window)?;

    let ui_webview = WebviewBuilder::new(&ui_label, WebviewUrl::App(ui_url.into()));

    window
        .add_child(
            ui_webview,
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(logical_w, UI_HEIGHT),
        )
        .map_err(|e| format!("failed to add UI webview: {e}"))?;

    // --- Create tab manager ---
    let manager = Arc::new(Mutex::new(TabManager {
        tabs: HashMap::new(),
        tab_order: Vec::new(),
        active_tab_id: None,
    }));

    // Register manager
    get_managers()
        .lock()
        .unwrap()
        .insert(window_label.clone(), manager.clone());

    // --- Register window resize / destroy handlers ---
    {
        let app_resize = app.clone();
        let manager_resize = manager.clone();
        let wl_resize = window_label.clone();
        window.on_window_event(move |event| {
            match event {
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                    layout_webviews(&app_resize, &manager_resize, &wl_resize);
                }
                WindowEvent::Destroyed => {
                    // Clean up manager from global registry
                    get_managers().lock().unwrap().remove(&wl_resize);
                }
                _ => {}
            }
        });
    }

    // --- Add first tab for the initial URL ---
    add_tab_internal(&app, &manager, &window_label, url)?;

    Ok(window_label)
}

/// Get current tabs state for a window.
#[tauri::command]
pub async fn get_link_preview_tabs_state(window_label: String) -> Result<TabsState, String> {
    let managers = get_managers().lock().unwrap();
    let manager = managers
        .get(&window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?;

    let m = manager.lock().unwrap();
    Ok(build_tabs_state(&m))
}

/// Add a new tab with the given URL. Returns the new tab info.
#[tauri::command]
pub async fn add_link_preview_tab(
    app: AppHandle,
    window_label: String,
    url: String,
) -> Result<TabInfo, String> {
    let manager = get_manager(&window_label)?;
    let tab_id = add_tab_internal(&app, &manager, &window_label, url)?;

    // Return the new tab info
    let m = manager.lock().unwrap();
    let tab = m.tabs.get(&tab_id).ok_or("tab not found after creation")?;
    Ok(TabInfo {
        id: tab.id.clone(),
        url: tab.url.clone(),
        title: tab.title.clone(),
        loading: tab.loading,
    })
}

/// Switch to a different tab.
#[tauri::command]
pub async fn switch_link_preview_tab(
    app: AppHandle,
    window_label: String,
    tab_id: String,
) -> Result<(), String> {
    let manager = get_manager(&window_label)?;
    switch_tab_internal(&app, &manager, &window_label, &tab_id)?;

    {
        let mut m = manager.lock().unwrap();
        m.active_tab_id = Some(tab_id);
    }
    emit_tabs_updated(&app, &manager);
    Ok(())
}

/// Close a tab.
#[tauri::command]
pub async fn close_link_preview_tab(
    app: AppHandle,
    window_label: String,
    tab_id: String,
) -> Result<(), String> {
    let manager = get_manager(&window_label)?;

    // Remove tab from manager and destroy its webview
    let was_active = {
        let m = manager.lock().unwrap();
        m.active_tab_id == Some(tab_id.clone())
    };

    let (removed, next_id) = {
        let mut m = manager.lock().unwrap();
        // Find the adjacent tab by insertion order BEFORE removing, so we
        // know which neighbor to activate. Prefer the tab to the right; if
        // the closed tab was last, fall back to the one before it.
        let next_id = if was_active {
            m.tab_order
                .iter()
                .position(|id| id == &tab_id)
                .and_then(|idx| {
                    m.tab_order
                        .get(idx + 1)
                        .or_else(|| {
                            if idx > 0 {
                                m.tab_order.get(idx - 1)
                            } else {
                                None
                            }
                        })
                        .cloned()
                })
        } else {
            None
        };
        let removed = m.tabs.remove(&tab_id);
        m.tab_order.retain(|id| id != &tab_id);
        (removed, next_id)
    };

    if let Some(tab) = removed {
        // Actually destroy the webview (frees memory + stops loading)
        if let Some(wv) = app.get_webview(&tab.webview_label) {
            let _ = wv.close();
        }
    }

    // If the closed tab was active, switch to the adjacent one (if any).
    if was_active {
        if let Some(next_id) = next_id {
            switch_tab_internal(&app, &manager, &window_label, &next_id)?;
            let mut m = manager.lock().unwrap();
            m.active_tab_id = Some(next_id);
        } else {
            let mut m = manager.lock().unwrap();
            m.active_tab_id = None;
        }
    }

    emit_tabs_updated(&app, &manager);
    Ok(())
}

/// Navigate a tab to a new URL.
#[tauri::command]
pub async fn navigate_link_preview_tab(
    app: AppHandle,
    window_label: String,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let manager = get_manager(&window_label)?;

    let webview_label = {
        let m = manager.lock().unwrap();
        let tab = m
            .tabs
            .get(&tab_id)
            .ok_or_else(|| format!("tab not found: {}", tab_id))?;
        // Optimistic URL update (on_page_load will confirm the final URL)
        tab.webview_label.clone()
    };

    // Update URL optimistically
    {
        let mut m = manager.lock().unwrap();
        if let Some(tab) = m.tabs.get_mut(&tab_id) {
            tab.url = url.clone();
            tab.loading = true;
        }
    }

    let webview = app
        .get_webview(&webview_label)
        .ok_or_else(|| format!("webview not found: {}", webview_label))?;

    let url_parsed = url::Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
    webview
        .navigate(url_parsed)
        .map_err(|e| format!("failed to navigate: {e}"))?;

    emit_tabs_updated(&app, &manager);
    Ok(())
}

/// Refresh a tab (reload its current URL).
#[tauri::command]
pub async fn refresh_link_preview_tab(
    app: AppHandle,
    window_label: String,
    tab_id: String,
) -> Result<(), String> {
    let manager = get_manager(&window_label)?;

    let (webview_label, url) = {
        let m = manager.lock().unwrap();
        let tab = m
            .tabs
            .get(&tab_id)
            .ok_or_else(|| format!("tab not found: {}", tab_id))?;
        (tab.webview_label.clone(), tab.url.clone())
    };

    // Set loading state
    {
        let mut m = manager.lock().unwrap();
        if let Some(tab) = m.tabs.get_mut(&tab_id) {
            tab.loading = true;
        }
    }

    let webview = app
        .get_webview(&webview_label)
        .ok_or_else(|| format!("webview not found: {}", webview_label))?;

    let url_parsed = url::Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
    webview
        .navigate(url_parsed)
        .map_err(|e| format!("failed to refresh: {e}"))?;

    emit_tabs_updated(&app, &manager);
    Ok(())
}

/// Open URL in system browser.
#[tauri::command]
pub async fn open_url_in_browser(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(&url, None::<&str>)
        .map_err(|e| format!("failed to open URL: {e}"))?;
    Ok(())
}

/// Get window label from frontend (passed via URL param).
#[tauri::command]
pub async fn get_current_window_label(app: AppHandle) -> Result<String, String> {
    let windows = app.windows();
    for (label, _) in windows.iter() {
        if label.starts_with("link-preview-tabs-") {
            return Ok(label.clone());
        }
    }
    Err("no link preview tabs window found".to_string())
}

/// Open the link preview window, or focus it if one already exists.
/// Called from the Activity Bar "browser" icon. If a window already
/// exists, it's focused and a new about:blank tab is added; otherwise a
/// fresh window is created.
#[tauri::command]
pub async fn open_or_focus_link_preview(app: AppHandle) -> Result<String, String> {
    // Look for an existing link-preview-tabs window.
    let existing = app
        .windows()
        .into_iter()
        .find(|(label, _)| label.starts_with("link-preview-tabs-"))
        .map(|(_, w)| w);

    if let Some(window) = existing {
        // Focus + unminimize the existing window, and add a fresh tab.
        let _ = window.show();
        let _ = window.set_focus();
        let label = window.label().to_string();
        if let Ok(manager) = get_manager(&label) {
            let _ = add_tab_internal(&app, &manager, &label, "about:blank".to_string());
        }
        return Ok(label);
    }

    // No existing window — create a new one.
    open_link_preview_with_tabs(app, "about:blank".to_string()).await
}

/// Check whether a window label belongs to a link-preview-tabs window.
/// Used by lib.rs `on_menu_event` to route Cmd+T / Cmd+W natively.
pub fn is_link_preview_window(label: &str) -> bool {
    label.starts_with("link-preview-tabs-")
}

/// Add a new (about:blank) tab to the focused link-preview window.
/// Called from `on_menu_event` when Cmd+T fires while a link-preview
/// window is focused. Handling this on the Rust side (instead of emitting
/// `native-command` to the frontend) avoids the event reaching both the
/// link-preview UI webview AND the main window's ShortcutManager.
pub fn add_tab_to_focused_preview(app: &AppHandle) -> Result<(), String> {
    let window_label = app
        .windows()
        .into_iter()
        .find(|(label, w)| is_link_preview_window(label) && w.is_focused().unwrap_or(false))
        .map(|(label, _)| label);
    let window_label = window_label.ok_or("no focused link preview window")?;
    let manager = get_manager(&window_label)?;
    add_tab_internal(app, &manager, &window_label, "about:blank".to_string())?;
    Ok(())
}

/// Close the active tab in the focused link-preview window. If it's the
/// last tab, close the whole window. Called from `on_menu_event` when
/// Cmd+W fires while a link-preview window is focused.
pub fn close_active_tab_in_focused_preview(app: &AppHandle) -> Result<(), String> {
    let window_label = app
        .windows()
        .into_iter()
        .find(|(label, w)| is_link_preview_window(label) && w.is_focused().unwrap_or(false))
        .map(|(label, _)| label);
    let window_label = window_label.ok_or("no focused link preview window")?;
    let manager = get_manager(&window_label)?;

    let (tab_count, active_id) = {
        let m = manager.lock().unwrap();
        (m.tab_order.len(), m.active_tab_id.clone())
    };

    if tab_count <= 1 {
        // Last tab — close the whole window.
        if let Some(window) = app.get_window(&window_label) {
            let _ = window.close();
        }
        return Ok(());
    }

    if let Some(id) = active_id {
        // Close the active tab; close_active_tab logic handles picking
        // the adjacent tab and repositioning webviews.
        // Reuse the command body by calling the internal pieces directly.
        let was_active = true;
        let (removed, next_id) = {
            let mut m = manager.lock().unwrap();
            let next_id = if was_active {
                m.tab_order
                    .iter()
                    .position(|tid| tid == &id)
                    .and_then(|idx| {
                        m.tab_order
                            .get(idx + 1)
                            .or_else(|| {
                                if idx > 0 {
                                    m.tab_order.get(idx - 1)
                                } else {
                                    None
                                }
                            })
                            .cloned()
                    })
            } else {
                None
            };
            let removed = m.tabs.remove(&id);
            m.tab_order.retain(|tid| tid != &id);
            (removed, next_id)
        };

        if let Some(tab) = removed {
            if let Some(wv) = app.get_webview(&tab.webview_label) {
                let _ = wv.close();
            }
        }

        if let Some(next_id) = next_id {
            switch_tab_internal(app, &manager, &window_label, &next_id)?;
            let mut m = manager.lock().unwrap();
            m.active_tab_id = Some(next_id);
        } else {
            let mut m = manager.lock().unwrap();
            m.active_tab_id = None;
        }

        emit_tabs_updated(app, &manager);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Look up the tab manager for a window.
fn get_manager(window_label: &str) -> Result<Arc<Mutex<TabManager>>, String> {
    let managers = get_managers().lock().unwrap();
    managers
        .get(window_label)
        .cloned()
        .ok_or_else(|| format!("window not found: {}", window_label))
}

/// Get the window's inner size in logical pixels.
fn logical_window_size(window: &tauri::Window) -> Result<(f64, f64), String> {
    let scale = window
        .scale_factor()
        .map_err(|e| format!("failed to get scale factor: {e}"))?;
    let physical = window
        .inner_size()
        .map_err(|e| format!("failed to get inner size: {e}"))?;
    let logical: LogicalSize<f64> = physical.to_logical(scale);
    Ok((logical.width, logical.height))
}

/// Build a TabsState snapshot from the manager (caller must hold the lock).
fn build_tabs_state(m: &TabManager) -> TabsState {
    // Iterate in insertion order (tab_order) so the tab strip is stable.
    // Previously this sorted by string ID, which broke after 10 tabs
    // ("tab-1" < "tab-10" < "tab-2" lexicographically).
    let tabs: Vec<TabInfo> = m
        .tab_order
        .iter()
        .filter_map(|id| m.tabs.get(id))
        .map(|t| TabInfo {
            id: t.id.clone(),
            url: t.url.clone(),
            title: t.title.clone(),
            loading: t.loading,
        })
        .collect();
    TabsState {
        tabs,
        active_tab_id: m.active_tab_id.clone(),
    }
}

/// Emit the full tabs state to the frontend.
fn emit_tabs_updated(app: &AppHandle, manager: &Arc<Mutex<TabManager>>) {
    let state = {
        let m = manager.lock().unwrap();
        build_tabs_state(&m)
    };
    let _ = app.emit("link-preview:tabs-updated", state);
}

/// Re-layout the UI webview and the active content webview to fill the window.
/// Called on window resize and scale-factor changes.
fn layout_webviews(app: &AppHandle, manager: &Arc<Mutex<TabManager>>, window_label: &str) {
    let window = match app.get_window(window_label) {
        Some(w) => w,
        None => return,
    };

    let (width, height) = match logical_window_size(&window) {
        Ok(dims) => dims,
        Err(_) => return,
    };

    let content_height = (height - UI_HEIGHT).max(1.0);

    // Resize UI webview
    let ui_label = ui_webview_label(window_label);
    if let Some(ui_wv) = app.get_webview(&ui_label) {
        let _ = ui_wv.set_size(LogicalSize::new(width, UI_HEIGHT));
    }

    // Resize + reposition the active content webview
    let active_label = {
        let m = manager.lock().unwrap();
        m.active_tab_id
            .as_ref()
            .and_then(|id| m.tabs.get(id))
            .map(|t| t.webview_label.clone())
    };

    if let Some(label) = active_label {
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.set_position(LogicalPosition::new(0.0, UI_HEIGHT));
            let _ = wv.set_size(LogicalSize::new(width, content_height));
        }
    }
}

/// Create a new tab with the given URL, add its content webview, and switch to it.
fn add_tab_internal(
    app: &AppHandle,
    manager: &Arc<Mutex<TabManager>>,
    window_label: &str,
    url: String,
) -> Result<String, String> {
    let n = next_id();
    let tab_id = format!("tab-{}", n);
    let webview_label = format!("content-{}", n);

    // --- Cookies (inject so logged-in sessions carry over from Chrome) ---
    let cookies = read_chrome_cookies_cached(&url);
    let host = extract_domain(&url).unwrap_or_else(|_| "site".to_string());

    let cookie_script = if cookies.is_empty() {
        String::new()
    } else {
        let mut lines = Vec::new();
        for (name, value) in &cookies {
            let safe_value = value.replace('\\', "\\\\").replace('\'', "\\'");
            let safe_name = name.replace('\\', "\\\\").replace('\'', "\\'");
            lines.push(format!(
                "document.cookie='{}={}; path=/; domain=.{}; SameSite=None; Secure';",
                safe_name, safe_value, host
            ));
        }
        lines.join("\n")
    };

    // --- Parse URL + derive initial title ---
    let url_parsed = url::Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
    // about:blank has no host and never fires on_document_title_changed,
    // so label it "New Tab" up front instead of leaving it on "Loading...".
    let initial_title = if url == "about:blank" {
        "New Tab".to_string()
    } else {
        url_parsed
            .host_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Loading...".to_string())
    };

    // --- Window + content dimensions ---
    let window = app
        .get_window(window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?;

    let (content_width, content_height) = {
        let (w, h) = logical_window_size(&window)?;
        (w, (h - UI_HEIGHT).max(1.0))
    };

    // --- Hide the currently-active content webview BEFORE creating the new
    //     one. Doing this first guarantees old and new never overlap on
    //     screen during the transition, even if the new webview's positioning
    //     runs a frame late. We resolve the old label while holding the
    //     manager lock, then move it off-screen.
    let previous_active_label = {
        let m = manager.lock().unwrap();
        m.active_tab_id
            .as_ref()
            .and_then(|id| m.tabs.get(id))
            .map(|t| t.webview_label.clone())
    };
    if let Some(label) = &previous_active_label {
        if let Some(wv) = app.get_webview(label) {
            let _ = wv.set_position(LogicalPosition::new(0.0, 9999.0));
        }
    }

    // --- Build content webview with event callbacks ---
    let app_for_title = app.clone();
    let manager_for_title = manager.clone();
    let app_for_load = app.clone();
    let manager_for_load = manager.clone();
    let app_for_new_window = app.clone();
    let manager_for_new_window = manager.clone();
    let window_label_for_new_window = window_label.to_string();

    let mut webview_builder =
        WebviewBuilder::new(&webview_label, WebviewUrl::External(url_parsed.clone()))
            .user_agent(BROWSER_UA)
            // Track page title changes → update tab + emit state
            .on_document_title_changed(move |wv, title| {
                let label = wv.label().to_string();
                update_tab_field(&app_for_title, &manager_for_title, &label, |tab| {
                    if tab.title != title {
                        tab.title = title;
                        true
                    } else {
                        false
                    }
                });
            })
            // Track page load start/finish → update loading + URL
            .on_page_load(move |wv, payload| {
                let label = wv.label().to_string();
                let url_str = payload.url().to_string();
                let loading = match payload.event() {
                    PageLoadEvent::Started => true,
                    PageLoadEvent::Finished => false,
                };
                update_tab_field(&app_for_load, &manager_for_load, &label, |tab| {
                    let mut changed = false;
                    if tab.loading != loading {
                        tab.loading = loading;
                        changed = true;
                    }
                    // Update URL only for real http(s) navigations (not about:blank)
                    if (url_str.starts_with("http://") || url_str.starts_with("https://"))
                        && tab.url != url_str
                    {
                        tab.url = url_str;
                        changed = true;
                    }
                    changed
                });
            })
            // window.open() → open as new tab instead of popup
            .on_new_window(move |new_url, _features| {
                let _ = add_tab_internal(
                    &app_for_new_window,
                    &manager_for_new_window,
                    &window_label_for_new_window,
                    new_url.as_str().to_string(),
                );
                NewWindowResponse::Deny
            });

    if !cookie_script.is_empty() {
        webview_builder = webview_builder.initialization_script(&cookie_script);
    }

    // Create the content webview off-screen first. We capture the returned
    // Webview and position it directly — relying on app.get_webview(label)
    // immediately after add_child can race on macOS WKWebView (the webview
    // isn't yet registered in Tauri's store), which left new tabs stranded
    // at Y=9999 and was the root cause of "新标签页打不开".
    let new_webview = window
        .add_child(
            webview_builder,
            LogicalPosition::new(0.0, 9999.0),
            LogicalSize::new(content_width, content_height),
        )
        .map_err(|e| format!("failed to add content webview: {e}"))?;

    // Position the new webview into the content area immediately, using the
    // Webview handle returned by add_child (no store lookup needed).
    new_webview
        .set_position(LogicalPosition::new(0.0, UI_HEIGHT))
        .map_err(|e| format!("failed to position new webview: {e}"))?;
    new_webview
        .set_size(LogicalSize::new(content_width, content_height))
        .map_err(|e| format!("failed to size new webview: {e}"))?;

    // --- Create tab record ---
    let tab = Tab {
        id: tab_id.clone(),
        webview_label: webview_label.clone(),
        url: url.clone(),
        title: initial_title.clone(),
        loading: url != "about:blank",
    };

    {
        let mut m = manager.lock().unwrap();
        m.tabs.insert(tab_id.clone(), tab);
        m.tab_order.push(tab_id.clone());
        m.active_tab_id = Some(tab_id.clone());
    }

    emit_tabs_updated(app, manager);

    Ok(tab_id)
}

/// Switch the visible content webview to the specified tab.
fn switch_tab_internal(
    app: &AppHandle,
    manager: &Arc<Mutex<TabManager>>,
    window_label: &str,
    tab_id: &str,
) -> Result<(), String> {
    let window = app
        .get_window(window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?;

    let (width, height) = logical_window_size(&window)?;
    let content_height = (height - UI_HEIGHT).max(1.0);

    let (current_active, target_label) = {
        let m = manager.lock().unwrap();
        let current = m.active_tab_id.as_ref().and_then(|id| m.tabs.get(id));
        let current_label = current.map(|t| t.webview_label.clone());
        let target = m
            .tabs
            .get(tab_id)
            .ok_or_else(|| format!("tab not found: {}", tab_id))?;
        (current_label, target.webview_label.clone())
    };

    // Hide current active tab (move off-screen)
    if let Some(label) = current_active {
        if label != target_label {
            if let Some(wv) = app.get_webview(&label) {
                let _ = wv.set_position(LogicalPosition::new(0.0, 9999.0));
            }
        }
    }

    // Show new active tab (position + resize to fill content area).
    // If the webview can't be found, surface an error rather than silently
    // succeeding — a silent no-op here leaves the tab stranded off-screen
    // (this was the secondary symptom of the new-tab race).
    let wv = app
        .get_webview(&target_label)
        .ok_or_else(|| format!("webview not found for tab {}: {}", tab_id, target_label))?;
    wv.set_position(LogicalPosition::new(0.0, UI_HEIGHT))
        .map_err(|e| format!("failed to position webview: {e}"))?;
    wv.set_size(LogicalSize::new(width, content_height))
        .map_err(|e| format!("failed to resize webview: {e}"))?;

    Ok(())
}

/// Update a tab field via a closure. If the closure returns `true` (changed),
/// emit the updated state to the frontend.
fn update_tab_field(
    app: &AppHandle,
    manager: &Arc<Mutex<TabManager>>,
    webview_label: &str,
    f: impl FnOnce(&mut Tab) -> bool,
) {
    let changed = {
        let mut m = manager.lock().unwrap();
        let tab = m
            .tabs
            .values_mut()
            .find(|t| t.webview_label == webview_label);
        match tab {
            Some(t) => f(t),
            None => false,
        }
    };
    if changed {
        emit_tabs_updated(app, manager);
    }
}
