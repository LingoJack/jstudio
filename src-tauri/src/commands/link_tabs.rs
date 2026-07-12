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
pub struct TabInfo {
    pub id: String,
    pub url: String,
    pub title: String,
    pub loading: bool,
}

/// Full tabs state (list + active) sent to frontend.
#[derive(Serialize, Deserialize, Clone)]
pub struct TabsState {
    pub tabs: Vec<TabInfo>,
    pub active_tab_id: Option<String>,
}

/// Per-window tab manager state.
struct TabManager {
    /// Tabs by their ID.
    tabs: HashMap<String, Tab>,
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

    let removed = {
        let mut m = manager.lock().unwrap();
        m.tabs.remove(&tab_id)
    };

    if let Some(tab) = removed {
        // Actually destroy the webview (frees memory + stops loading)
        if let Some(wv) = app.get_webview(&tab.webview_label) {
            let _ = wv.close();
        }
    }

    // If the closed tab was active, switch to another
    if was_active {
        let next_id = {
            let m = manager.lock().unwrap();
            // Pick the tab that was closest to the closed one (by insertion order is
            // not tracked, so just take the first available)
            m.tabs.keys().next().cloned()
        };

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
    let mut tabs: Vec<TabInfo> = m
        .tabs
        .values()
        .map(|t| TabInfo {
            id: t.id.clone(),
            url: t.url.clone(),
            title: t.title.clone(),
            loading: t.loading,
        })
        .collect();
    // Sort by tab ID for stable ordering
    tabs.sort_by(|a, b| a.id.cmp(&b.id));
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
    let initial_title = url_parsed
        .host_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Loading...".to_string());

    // --- Window + content dimensions ---
    let window = app
        .get_window(window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?;

    let (content_width, content_height) = {
        let (w, h) = logical_window_size(&window)?;
        (w, (h - UI_HEIGHT).max(1.0))
    };

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

    // Position: initially hidden off-screen, will be shown when switched to
    window
        .add_child(
            webview_builder,
            LogicalPosition::new(0.0, 9999.0),
            LogicalSize::new(content_width, content_height),
        )
        .map_err(|e| format!("failed to add content webview: {e}"))?;

    // --- Create tab record ---
    let tab = Tab {
        id: tab_id.clone(),
        webview_label: webview_label.clone(),
        url: url.clone(),
        title: initial_title.clone(),
        loading: true,
    };

    {
        let mut m = manager.lock().unwrap();
        m.tabs.insert(tab_id.clone(), tab);
        m.active_tab_id = Some(tab_id.clone());
    }

    // Show this tab (switch to it)
    switch_tab_internal(app, manager, window_label, &tab_id)?;

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

    // Show new active tab (position + resize to fill content area)
    if let Some(wv) = app.get_webview(&target_label) {
        wv.set_position(LogicalPosition::new(0.0, UI_HEIGHT))
            .map_err(|e| format!("failed to position webview: {e}"))?;
        wv.set_size(LogicalSize::new(width, content_height))
            .map_err(|e| format!("failed to resize webview: {e}"))?;
    }

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
