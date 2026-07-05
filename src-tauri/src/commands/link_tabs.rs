/*!
 * Link preview tabs — multi-webview browser-like window.
 *
 * Uses Tauri's `unstable` feature to access WindowBuilder + WebviewBuilder API.
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  Window (no default webview)                                 │
 * │  ┌────────────────────────────────────────────────────────┐  │
 * │  │ UI Webview (React — tab bar + address bar)             │  │
 * │  │ Height: ~70px                                          │  │
 * │  └────────────────────────────────────────────────────────┘  │
 * │  ┌────────────────────────────────────────────────────────┐  │
 * │  │ Content Webview(s) — one per tab, only active visible  │  │
 * │  │ Visible: positioned at Y=70, fills remaining height    │  │
 * │  │ Hidden: positioned at Y=9999 (off-screen)              │  │
 * │  └────────────────────────────────────────────────────────┘  │
 * └──────────────────────────────────────────────────────────────┘
 */

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::webview::NewWindowResponse;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl,
    WindowBuilder,
};

use super::link::{extract_domain, read_chrome_cookies_cached, BROWSER_UA};

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
    /// UI webview height.
    ui_height: f64,
}

/// Internal tab representation.
#[derive(Clone)]
struct Tab {
    id: String,
    webview_label: String,
    url: String,
    title: String,
}

// ---------------------------------------------------------------------------
// Global registry
// ---------------------------------------------------------------------------

static TAB_MANAGERS: OnceLock<Mutex<HashMap<String, Arc<Mutex<TabManager>>>>> = OnceLock::new();

fn get_managers() -> &'static Mutex<HashMap<String, Arc<Mutex<TabManager>>>> {
    TAB_MANAGERS.get_or_init(|| Mutex::new(HashMap::new()))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Open a new link preview window with tabs support.
#[tauri::command]
pub async fn open_link_preview_with_tabs(app: AppHandle, url: String) -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let window_label = format!("link-preview-tabs-{}", timestamp);

    // UI webview height (tab bar + address bar)
    let ui_height = 70.0;

    // Create the window (without default webview) using unstable API
    let window = WindowBuilder::new(&app, &window_label)
        .title("Link Preview")
        .inner_size(1100.0, 800.0)
        .min_inner_size(400.0, 300.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("failed to create window: {e}"))?;

    // Get window dimensions - use PhysicalSize and convert
    let window_size = window
        .inner_size()
        .map_err(|e| format!("failed to get window size: {e}"))?;
    let content_width = window_size.width as f64;
    let ui_webview_height = ui_height;

    // Pass window label via URL query param so UI webview knows its parent
    let ui_url = format!(
        "index.html?window=link-preview-tabs&windowLabel={}",
        window_label
    );

    // Create UI webview (React frontend for tabs)
    let ui_webview = WebviewBuilder::new("ui-tabs", WebviewUrl::App(ui_url.into()));

    window
        .add_child(
            ui_webview,
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(content_width, ui_webview_height),
        )
        .map_err(|e| format!("failed to add UI webview: {e}"))?;

    // Create tab manager
    let manager = Arc::new(Mutex::new(TabManager {
        tabs: HashMap::new(),
        active_tab_id: None,
        ui_height,
    }));

    // Register manager
    get_managers()
        .lock()
        .unwrap()
        .insert(window_label.clone(), manager.clone());

    // Add first tab for the initial URL
    add_tab_internal(&app, &manager, &window_label, url.clone())?;

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
    let tabs: Vec<TabInfo> = m
        .tabs
        .values()
        .map(|t| TabInfo {
            id: t.id.clone(),
            url: t.url.clone(),
            title: t.title.clone(),
            loading: false,
        })
        .collect();

    Ok(TabsState {
        tabs,
        active_tab_id: m.active_tab_id.clone(),
    })
}

/// Add a new tab with the given URL.
#[tauri::command]
pub async fn add_link_preview_tab(
    app: AppHandle,
    window_label: String,
    url: String,
) -> Result<TabInfo, String> {
    let managers = get_managers().lock().unwrap();
    let manager = managers
        .get(&window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?
        .clone();

    add_tab_internal(&app, &manager, &window_label, url.clone())?;

    // Get the new tab info
    let m = manager.lock().unwrap();
    let new_tab = m.tabs.values().find(|t| t.url == url);
    match new_tab {
        Some(t) => Ok(TabInfo {
            id: t.id.clone(),
            url: t.url.clone(),
            title: t.title.clone(),
            loading: false,
        }),
        None => Err("tab not found after creation".to_string()),
    }
}

/// Switch to a different tab.
#[tauri::command]
pub async fn switch_link_preview_tab(
    app: AppHandle,
    window_label: String,
    tab_id: String,
) -> Result<(), String> {
    let managers = get_managers().lock().unwrap();
    let manager = managers
        .get(&window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?
        .clone();

    switch_tab_internal(&app, &manager, &window_label, &tab_id)?;

    // Update active tab in manager
    {
        let mut m = manager.lock().unwrap();
        m.active_tab_id = Some(tab_id);
    }

    Ok(())
}

/// Close a tab.
#[tauri::command]
pub async fn close_link_preview_tab(
    app: AppHandle,
    window_label: String,
    tab_id: String,
) -> Result<(), String> {
    let managers = get_managers().lock().unwrap();
    let manager_arc = managers
        .get(&window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?
        .clone();

    // Remove tab and hide its webview
    let removed_tab = {
        let mut m = manager_arc.lock().unwrap();
        m.tabs.remove(&tab_id)
    };

    if let Some(tab) = removed_tab {
        // Move webview off-screen
        if let Some(wv) = app.get_webview(&tab.webview_label) {
            let _ = wv.set_position(LogicalPosition::new(0.0, 9999.0));
        }

        // If this was the active tab, switch to another
        let needs_switch = {
            let m = manager_arc.lock().unwrap();
            m.active_tab_id == Some(tab_id.clone())
        };

        if needs_switch {
            let m = manager_arc.lock().unwrap();
            if let Some(next_id) = m.tabs.keys().next() {
                let next_id = next_id.clone();
                drop(m);
                switch_tab_internal(&app, &manager_arc, &window_label, &next_id)?;
                let mut m = manager_arc.lock().unwrap();
                m.active_tab_id = Some(next_id);
            } else {
                // No more tabs
                let mut m = manager_arc.lock().unwrap();
                m.active_tab_id = None;
            }
        }
    }

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
    let managers = get_managers().lock().unwrap();
    let manager = managers
        .get(&window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?;

    let m = manager.lock().unwrap();
    let tab = m.tabs.get(&tab_id);

    if let Some(tab) = tab {
        let webview = app
            .get_webview(&tab.webview_label)
            .ok_or_else(|| format!("webview not found: {}", tab.webview_label))?;

        let url_parsed = url::Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
        webview
            .navigate(url_parsed)
            .map_err(|e| format!("failed to navigate: {e}"))?;
    }

    Ok(())
}

/// Refresh a tab.
#[tauri::command]
pub async fn refresh_link_preview_tab(
    app: AppHandle,
    window_label: String,
    tab_id: String,
) -> Result<(), String> {
    let managers = get_managers().lock().unwrap();
    let manager = managers
        .get(&window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?;

    let m = manager.lock().unwrap();

    if let Some(tab) = m.tabs.get(&tab_id) {
        let webview = app
            .get_webview(&tab.webview_label)
            .ok_or_else(|| format!("webview not found: {}", tab.webview_label))?;

        let url_parsed = url::Url::parse(&tab.url).map_err(|e| format!("invalid URL: {e}"))?;
        webview
            .navigate(url_parsed)
            .map_err(|e| format!("failed to refresh: {e}"))?;
    }

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
    // Use windows() instead of webview_windows() because the preview window
    // is created with WindowBuilder (not WebviewWindowBuilder)
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

fn add_tab_internal(
    app: &AppHandle,
    manager: &Arc<Mutex<TabManager>>,
    window_label: &str,
    url: String,
) -> Result<(), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let tab_id = format!("tab-{}", timestamp);
    let webview_label = format!("content-{}", timestamp);

    // Get cookies
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

    // Parse URL
    let url_parsed = url::Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
    let initial_title = url_parsed
        .host_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Loading...".to_string());

    // Get window (use Window, not WebviewWindow, for add_child)
    let window = app
        .get_window(window_label)
        .ok_or_else(|| format!("window not found: {}", window_label))?;

    let (ui_height, content_width, content_height) = {
        let m = manager.lock().unwrap();
        let ui_height = m.ui_height;
        let window_size = window
            .inner_size()
            .map_err(|e| format!("failed to get size: {e}"))?;
        let content_width = window_size.width as f64;
        let content_height = window_size.height as f64 - ui_height;
        (ui_height, content_width, content_height)
    };

    // Clone for closure
    let app_clone = app.clone();
    let window_label_clone = window_label.to_string();
    let manager_clone = manager.clone();

    // Build content webview
    let mut webview_builder =
        WebviewBuilder::new(&webview_label, WebviewUrl::External(url_parsed.clone()))
            .user_agent(BROWSER_UA)
            .on_new_window({
                let app = app_clone.clone();
                let window_label = window_label_clone.clone();
                let manager = manager_clone.clone();
                move |new_url, _features| {
                    // For window.open(), create a new tab instead of popup window
                    let new_url_str = new_url.as_str();
                    let _ =
                        add_tab_internal(&app, &manager, &window_label, new_url_str.to_string());
                    NewWindowResponse::Deny // We handled it ourselves
                }
            });

    if !cookie_script.is_empty() {
        webview_builder = webview_builder.initialization_script(&cookie_script);
    }

    // Position: initially hidden off-screen, will be shown when switched
    window
        .add_child(
            webview_builder,
            LogicalPosition::new(0.0, 9999.0),
            LogicalSize::new(content_width, content_height),
        )
        .map_err(|e| format!("failed to add content webview: {e}"))?;

    // Create tab record
    let tab = Tab {
        id: tab_id.clone(),
        webview_label: webview_label.clone(),
        url: url.clone(),
        title: initial_title.clone(),
    };

    // Update manager and switch to this tab
    {
        let mut m = manager.lock().unwrap();
        m.tabs.insert(tab_id.clone(), tab);
        m.active_tab_id = Some(tab_id.clone());
    }

    // Show this tab (switch to it)
    switch_tab_internal(app, manager, window_label, &tab_id)?;

    // Emit event to frontend
    app.emit(
        "link-preview:tab-added",
        TabInfo {
            id: tab_id,
            url,
            title: initial_title,
            loading: false,
        },
    )
    .map_err(|e| format!("failed to emit event: {e}"))?;

    Ok(())
}

fn switch_tab_internal(
    app: &AppHandle,
    manager: &Arc<Mutex<TabManager>>,
    window_label: &str,
    tab_id: &str,
) -> Result<(), String> {
    let (ui_height, content_width, content_height, all_tabs, active_id) = {
        let m = manager.lock().unwrap();
        let window = app
            .get_window(window_label)
            .ok_or_else(|| format!("window not found: {}", window_label))?;
        let window_size = window
            .inner_size()
            .map_err(|e| format!("failed to get size: {e}"))?;
        let content_width = window_size.width as f64;
        let content_height = window_size.height as f64 - m.ui_height;

        (
            m.ui_height,
            content_width,
            content_height,
            m.tabs.clone(),
            m.active_tab_id.clone(),
        )
    };

    // Hide current active tab (move off-screen)
    if let Some(current_id) = active_id {
        if let Some(current_tab) = all_tabs.get(&current_id) {
            if let Some(wv) = app.get_webview(&current_tab.webview_label) {
                let _ = wv.set_position(LogicalPosition::new(0.0, 9999.0));
            }
        }
    }

    // Show new active tab
    if let Some(tab) = all_tabs.get(tab_id) {
        if let Some(wv) = app.get_webview(&tab.webview_label) {
            wv.set_position(LogicalPosition::new(0.0, ui_height))
                .map_err(|e| format!("failed to position webview: {e}"))?;
            wv.set_size(LogicalSize::new(content_width, content_height))
                .map_err(|e| format!("failed to resize webview: {e}"))?;
        }
    }

    Ok(())
}
