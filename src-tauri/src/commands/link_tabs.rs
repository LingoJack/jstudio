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
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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

/// JavaScript injected into every content webview to intercept `target="_blank"`
/// links, `window.open()` calls, and `<form target="_blank">` submissions.
///
/// Instead of relying on WKWebView's `createWebViewWithConfiguration` UI delegate
/// (which has reentrancy issues when creating a new WKWebView inside the callback),
/// we override these APIs in JavaScript and signal the Rust backend via a hidden
/// iframe navigating to `http://newtab.invalid/?u=<encoded_url>`.
///
/// We use `http://newtab.invalid/` (a reserved TLD per RFC 2606 that never
/// resolves) instead of a custom `newtab:` scheme because WKWebView may not
/// fire `decidePolicyForNavigationAction` for unregistered URL schemes, making
/// the `on_navigation` handler unreliable.
///
/// For `window.open('', '_blank')` (used by OAuth flows like WeChat login),
/// we return a **proxy object** that intercepts `location` assignments and
/// `location.href`/`location.replace`/`location.assign` calls, forwarding the
/// real URL to `openAsTab`. This allows patterns like:
///   var popup = window.open('', '_blank');
///   popup.location = 'https://example.com';
/// to work correctly.
const NEW_TAB_INTERCEPT_JS: &str = r#"(function(){
    // Signal that this script is running
    try{
        var s=document.createElement('iframe');
        s.style.cssText='display:none!important';
        s.src='http://initlog.invalid/';
        (document.body||document.documentElement).appendChild(s);
        setTimeout(function(){if(s.parentNode)s.parentNode.removeChild(s)},2000);
    }catch(e){}
    // Save the original window.open BEFORE overriding it. We call this as a
    // fallback in openAsTab for sites where the hidden-iframe approach fails
    // (e.g. zhihu.com, where the iframe navigation to newtab.invalid is
    // silently dropped by WKWebView for reasons unrelated to CSP). The native
    // window.open triggers WKWebView's createWebViewWithConfiguration delegate
    // (Tauri's on_new_window handler), which creates a new tab and denies the
    // popup. Rust-side deduplication (last_new_tab) prevents double tabs when
    // both the iframe and the native window.open succeed.
    var __originalOpen=window.open;
    function openAsTab(url){
        if(!url||url==='about:blank'||url==='')return;
        // Primary: hidden iframe -> on_navigation handler (preserves opener)
        try{
            var f=document.createElement('iframe');
            f.style.cssText='display:none!important;width:0;height:0;border:0';
            f.src='http://newtab.invalid/?u='+encodeURIComponent(url);
            (document.body||document.documentElement).appendChild(f);
            setTimeout(function(){if(f.parentNode)f.parentNode.removeChild(f)},2000);
        }catch(e){}
        // Fallback: native window.open -> on_new_window handler.
        // This catches cases where the iframe navigation doesn't fire
        // on_navigation (zhihu.com, some other sites). The Rust handler
        // deduplicates so only one tab is created.
        try{__originalOpen(url)}catch(e){}
    }
    function makeProxyWindow(){
        var loc={};
        Object.defineProperty(loc,'href',{get:function(){return''},set:function(v){if(v)openAsTab(v)},configurable:false});
        loc.replace=function(u){if(u)openAsTab(u)};
        loc.assign=function(u){if(u)openAsTab(u)};
        var w={close:function(){},focus:function(){},postMessage:function(){},document:{write:function(){}},location:loc};
        Object.defineProperty(w,'location',{get:function(){return loc},set:function(v){if(v)openAsTab(v)},configurable:false});
        return w;
    }
    try{
        var co=function(url,target,features){
            // Signal that window.open was called
            try{
                var l=document.createElement('iframe');
                l.style.cssText='display:none!important';
                l.src='http://openlog.invalid/?u='+encodeURIComponent(url||'')+'&t='+(target||'');
                (document.body||document.documentElement).appendChild(l);
                setTimeout(function(){if(l.parentNode)l.parentNode.removeChild(l)},2000);
            }catch(e){}
            if(url&&url!=='about:blank'&&url!==''){openAsTab(url);return null}
            return makeProxyWindow();
        };
        Object.defineProperty(window,'open',{value:co,writable:false,configurable:false});
    }catch(e){window.open=function(url){if(url&&url!=='about:blank'&&url!==''){openAsTab(url);return null}return makeProxyWindow()}}
    document.addEventListener('click',function(e){
        var a=e.target.closest('a[target="_blank"]');
        if(a&&a.href){e.preventDefault();e.stopPropagation();openAsTab(a.href);return false}
    },true);
    document.addEventListener('submit',function(e){
        var form=e.target;
        if(!form||form.tagName!=='FORM')return;
        var t=form.target;
        if(t==='_blank'||t==='_new'){
            e.preventDefault();e.stopPropagation();
            try{
                var url=new URL(form.action||window.location.href,window.location.href).href;
                var m=(form.method||'get').toLowerCase();
                if(m==='get'){
                    var p=new URLSearchParams(new FormData(form)).toString();
                    if(p)url+=(url.indexOf('?')>=0?'&':'?')+p;
                }
                openAsTab(url);
            }catch(err){openAsTab(form.action)}
            return false;
        }
    },true);
})()"#;

/// JavaScript injected into content webviews that were opened by another tab
/// (via `window.open` / `target="_blank"`). Sets up a `window.opener` proxy
/// that forwards `postMessage` calls back to the opener tab through a hidden
/// iframe → `http://postmessage.invalid/?d=<json>` → Rust `on_navigation`
/// handler → `eval_js` on the opener webview.
const OPENER_PROXY_JS: &str = r#"(function(){
    function forwardToOpener(data){
        try{
            var f=document.createElement('iframe');
            f.style.cssText='display:none!important;width:0;height:0;border:0';
            f.src='http://postmessage.invalid/?d='+encodeURIComponent(JSON.stringify(data));
            (document.body||document.documentElement).appendChild(f);
            setTimeout(function(){if(f.parentNode)f.parentNode.removeChild(f)},2000);
        }catch(e){}
    }
    var fakeLoc={};
    Object.defineProperty(fakeLoc,'href',{get:function(){return''},set:function(v){
        if(v)forwardToOpener({_opener_nav:v})
    },configurable:false});
    fakeLoc.replace=function(u){if(u)forwardToOpener({_opener_nav:u})};
    fakeLoc.assign=function(u){if(u)forwardToOpener({_opener_nav:u})};
    window.opener={
        postMessage:function(data,origin){forwardToOpener({_pm:data,_origin:origin||'*'})},
        close:function(){},focus:function(){},
        location:fakeLoc
    };
    Object.defineProperty(window,'opener',{writable:false,configurable:false});
})()"#;

/// UI webview height in logical pixels (standalone link-preview window only).
/// Address bar (~38px) at top + floating glassmorphism tab bar (~52px area) at bottom.
///
/// For the inline browser panel in the main window, the content rect is
/// provided dynamically by React via `update_browser_panel_rect` — this
/// constant is NOT used for that path.
const UI_HEIGHT: f64 = 90.0;

/// Window label used when the browser is embedded as a panel in the main
/// window (instead of a standalone link-preview window). The main window's
/// `TabManager` is registered under this key.
pub const MAIN_BROWSER_LABEL: &str = "main";

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

/// Geometry of the inline browser panel's webview area, in logical pixels,
/// relative to the main window's top-left corner. Reported by the React
/// `BrowserPanel` component via `ResizeObserver` so Rust can position child
/// webviews on top of the React UI.
#[derive(Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPanelRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Debug logger - writes to /tmp/jstudio_browser_debug.log so we can
/// diagnose which handlers fire without needing a terminal.
fn debug_log(msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/jstudio_browser_debug.log")
    {
        let _ = writeln!(
            f,
            "[{}] {}",
            chrono::Local::now().format("%H:%M:%S%.3f"),
            msg
        );
    }
}

/// Per-window tab manager state.
struct TabManager {
    /// The window label this manager belongs to. Used to scope `emit_to`
    /// so events for the standalone link-preview window don't reach the
    /// main window's inline browser panel (and vice versa).
    window_label: String,
    /// Tabs by their ID.
    tabs: HashMap<String, Tab>,
    /// Tab IDs in insertion order - used for stable tab-strip ordering and
    /// for picking the adjacent tab when the active one closes. HashMap
    /// iteration is random, so we keep this vec authoritative for order.
    tab_order: Vec<String>,
    /// Currently active tab ID.
    active_tab_id: Option<String>,
    /// Deduplication: (url, timestamp) of the most recent new-tab request.
    /// Both `on_navigation` (iframe path) and `on_new_window` (native
    /// window.open path) check this to avoid creating a duplicate tab when
    /// both mechanisms fire for the same link click.
    last_new_tab: Option<(String, std::time::Instant)>,
}

/// Internal tab representation.
#[derive(Clone)]
struct Tab {
    id: String,
    webview_label: String,
    url: String,
    title: String,
    loading: bool,
    /// Webview label of the tab that opened this tab (via window.open / target=_blank).
    /// Used to forward `window.opener.postMessage()` calls back to the opener.
    opener_webview_label: Option<String>,
}

// ---------------------------------------------------------------------------
// Global registry
// ---------------------------------------------------------------------------

static TAB_MANAGERS: OnceLock<Mutex<HashMap<String, Arc<Mutex<TabManager>>>>> = OnceLock::new();
static TAB_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Geometry of the inline browser panel's webview area in the main window.
/// Set by `update_browser_panel_rect` (called from React's `ResizeObserver`)
/// and read by `get_content_rect` when positioning child webviews for the
/// `"main"` window label.
static BROWSER_PANEL_RECT: OnceLock<Mutex<Option<BrowserPanelRect>>> = OnceLock::new();

/// Whether the inline browser panel is currently visible in the main window.
/// Set by `show_browser_panel` / `hide_browser_panel`. Read by
/// `on_menu_event` in lib.rs to decide whether Cmd+T / Cmd+W should act on
/// the browser panel (vs. the main window's document tabs).
static BROWSER_PANEL_VISIBLE: AtomicBool = AtomicBool::new(false);

fn get_managers() -> &'static Mutex<HashMap<String, Arc<Mutex<TabManager>>>> {
    TAB_MANAGERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn browser_panel_rect_cell() -> &'static Mutex<Option<BrowserPanelRect>> {
    BROWSER_PANEL_RECT.get_or_init(|| Mutex::new(None))
}

/// Get the stored browser panel rect (if any).
fn get_browser_panel_rect() -> Option<BrowserPanelRect> {
    browser_panel_rect_cell().lock().ok()?.as_ref().copied()
}

/// Check whether the inline browser panel is currently visible.
pub fn is_browser_panel_visible() -> bool {
    BROWSER_PANEL_VISIBLE.load(Ordering::SeqCst)
}

/// Generate a globally unique ID (avoids timestamp collisions).
fn next_id() -> u64 {
    TAB_COUNTER.fetch_add(1, Ordering::Relaxed)
}

/// Derive the UI webview label for a given window (must be unique per window).
fn ui_webview_label(window_label: &str) -> String {
    format!("ui-{}", window_label)
}

/// Resolve the content webview geometry (x, y, w, h) for a given window.
///
/// - For the `"main"` window (inline browser panel): uses the stored
///   `BrowserPanelRect` reported by React's `ResizeObserver`. Returns
///   `None` if the rect hasn't been set yet (caller should position
///   off-screen and wait for `update_browser_panel_rect`).
/// - For standalone link-preview windows: computes from the window's inner
///   size minus `UI_HEIGHT`.
fn get_content_rect(app: &AppHandle, window_label: &str) -> Option<(f64, f64, f64, f64)> {
    if window_label == MAIN_BROWSER_LABEL {
        let r = get_browser_panel_rect()?;
        Some((r.x, r.y, r.width, r.height))
    } else {
        let window = app.get_window(window_label)?;
        let (w, h) = logical_window_size(&window).ok()?;
        Some((0.0, UI_HEIGHT, w, (h - UI_HEIGHT).max(1.0)))
    }
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
        window_label: window_label.clone(),
        tabs: HashMap::new(),
        tab_order: Vec::new(),
        active_tab_id: None,
        last_new_tab: None,
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
    add_tab_internal(&app, &manager, &window_label, url, None)?;

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
    let tab_id = add_tab_internal(&app, &manager, &window_label, url, None)?;

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

    // If this tab was showing the React start page (blank webview parked
    // off-screen), reposition the now-navigated webview into the content area.
    layout_webviews(&app, &manager, &window_label);

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
            let _ = add_tab_internal(&app, &manager, &label, "about:blank".to_string(), None);
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
    add_tab_internal(
        app,
        &manager,
        &window_label,
        "about:blank".to_string(),
        None,
    )?;
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
// Inline browser panel (embedded in the main window)
// ---------------------------------------------------------------------------

/// Show the inline browser panel in the main window. Ensures a `TabManager`
/// for the `"main"` window label exists, marks the panel as visible (so
/// `on_menu_event` routes Cmd+T / Cmd+W here instead of to document tabs),
/// and emits the current tabs state. When no tabs exist the React
/// `BrowserPanel` renders a start page (Chrome-style new tab page) instead
/// of an `about:blank` webview, so we deliberately do NOT auto-create a tab.
///
/// The React `BrowserPanel` component calls this on mount, then calls
/// `update_browser_panel_rect` via `ResizeObserver` to report the container
/// bounds so content webviews can be positioned on top of the React UI.
#[tauri::command]
pub async fn show_browser_panel(app: AppHandle) -> Result<(), String> {
    BROWSER_PANEL_VISIBLE.store(true, Ordering::SeqCst);

    // Ensure a TabManager exists for the main window. If one already exists
    // (panel was previously shown and hidden), reuse it — its tabs are
    // preserved.
    {
        let mut managers = get_managers().lock().unwrap();
        if !managers.contains_key(MAIN_BROWSER_LABEL) {
            managers.insert(
                MAIN_BROWSER_LABEL.to_string(),
                Arc::new(Mutex::new(TabManager {
                    window_label: MAIN_BROWSER_LABEL.to_string(),
                    tabs: HashMap::new(),
                    tab_order: Vec::new(),
                    active_tab_id: None,
                    last_new_tab: None,
                })),
            );
        }
    }

    let manager = get_manager(MAIN_BROWSER_LABEL)?;

    let has_tabs = {
        let m = manager.lock().unwrap();
        !m.tab_order.is_empty()
    };
    if has_tabs {
        // Tabs already exist — reposition the active one into the content
        // area (it was moved off-screen by hide_browser_panel).
        layout_webviews(&app, &manager, MAIN_BROWSER_LABEL);
    }
    // Emit the tabs state in both cases: with no tabs this pushes an empty
    // state to React so the start page renders deterministically instead of
    // relying on a separate get_browser_panel_tabs_state round-trip.
    emit_tabs_updated(&app, &manager);

    Ok(())
}

/// Hide the inline browser panel. Moves all content webviews off-screen and
/// clears the visible flag so `on_menu_event` stops routing Cmd+T / Cmd+W
/// here. The `TabManager` and its tabs are preserved so the user can return
/// to the panel with their tabs intact.
#[tauri::command]
pub async fn hide_browser_panel(app: AppHandle) -> Result<(), String> {
    BROWSER_PANEL_VISIBLE.store(false, Ordering::SeqCst);

    if let Ok(manager) = get_manager(MAIN_BROWSER_LABEL) {
        let labels: Vec<String> = {
            let m = manager.lock().unwrap();
            m.tabs.values().map(|t| t.webview_label.clone()).collect()
        };
        for label in labels {
            if let Some(wv) = app.get_webview(&label) {
                let _ = wv.set_position(LogicalPosition::new(0.0, 9999.0));
            }
        }
    }

    Ok(())
}

/// Update the inline browser panel's webview area geometry (called from
/// React's `ResizeObserver`). Stores the rect and repositions the active
/// content webview to match. This is how the native child webviews stay
/// aligned with the React-rendered panel container as the sidebar opens /
/// closes, the window resizes, etc.
#[tauri::command]
pub async fn update_browser_panel_rect(
    app: AppHandle,
    rect: BrowserPanelRect,
) -> Result<(), String> {
    // Store the rect
    {
        *browser_panel_rect_cell().lock().unwrap() = Some(rect);
    }

    // Reposition the active content webview using the new rect
    if let Ok(manager) = get_manager(MAIN_BROWSER_LABEL) {
        layout_webviews(&app, &manager, MAIN_BROWSER_LABEL);
    }

    Ok(())
}

/// Get the current tabs state for the inline browser panel (main window).
/// Convenience wrapper around `get_link_preview_tabs_state` with the main
/// window label filled in.
#[tauri::command]
pub async fn get_browser_panel_tabs_state() -> Result<TabsState, String> {
    let manager = get_manager(MAIN_BROWSER_LABEL)?;
    let m = manager.lock().unwrap();
    Ok(build_tabs_state(&m))
}

/// JavaScript snippet that performs a select-all in whichever webview it's
/// eval'd in. Used by `select_all_in_active_browser_tab` and
/// `select_all_in_link_preview` to forward Cmd+A (intercepted by the macOS
/// "Select All" menu item) into browser content webviews that don't run the
/// app's React frontend.
const SELECT_ALL_JS: &str = "(function(){\
    var el=document.activeElement;\
    if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'))el.select();\
    else document.execCommand('selectAll')\
})()";

/// Select all text in the inline browser panel's active content webview.
/// Called from the frontend's `commandRegistry` ("app.selectAll" action) when
/// the browser panel is visible and the main React webview doesn't have focus
/// (i.e. the child WKWebView loading the external page has focus). The macOS
/// "Select All" menu item intercepts Cmd+A app-wide, so the content webview's
/// own DOM never sees the keydown — we eval_js the select-all directly.
#[tauri::command]
pub async fn select_all_in_active_browser_tab(app: AppHandle) -> Result<(), String> {
    let manager = get_manager(MAIN_BROWSER_LABEL)?;
    let active_label = {
        let m = manager.lock().unwrap();
        m.active_tab_id
            .as_ref()
            .and_then(|id| m.tabs.get(id))
            .map(|t| t.webview_label.clone())
    };
    if let Some(label) = active_label {
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.eval(SELECT_ALL_JS);
        }
    }
    Ok(())
}

/// Select all text in a standalone link-preview window. Eval_js's the
/// select-all script into BOTH the UI webview (address bar) and the active
/// content webview (external page). The script checks `document.activeElement`
/// so only the webview that actually has focus performs the select-all — the
/// other is a no-op. Called from `on_menu_event` for `app.selectAll` when the
/// focused window is a link-preview window (which doesn't run ShortcutManager).
pub fn select_all_in_link_preview(app: &AppHandle, window_label: &str) -> Result<(), String> {
    // UI webview (address bar)
    let ui_label = ui_webview_label(window_label);
    if let Some(wv) = app.get_webview(&ui_label) {
        let _ = wv.eval(SELECT_ALL_JS);
    }
    // Active content webview (external page)
    if let Ok(manager) = get_manager(window_label) {
        let active_label = {
            let m = manager.lock().unwrap();
            m.active_tab_id
                .as_ref()
                .and_then(|id| m.tabs.get(id))
                .map(|t| t.webview_label.clone())
        };
        if let Some(label) = active_label {
            if let Some(wv) = app.get_webview(&label) {
                let _ = wv.eval(SELECT_ALL_JS);
            }
        }
    }
    Ok(())
}

/// Add a new (about:blank) tab to the inline browser panel. Called from
/// `on_menu_event` when Cmd+T fires while the browser panel is visible in
/// the main window.
pub fn add_tab_to_main_browser(app: &AppHandle) -> Result<(), String> {
    let manager = get_manager(MAIN_BROWSER_LABEL)?;
    add_tab_internal(
        app,
        &manager,
        MAIN_BROWSER_LABEL,
        "about:blank".to_string(),
        None,
    )?;
    Ok(())
}

/// Close the active tab in the inline browser panel. If it's the last tab,
/// emit a `browser-panel:empty` event so React can switch back to the
/// documents view (the panel shows an empty state otherwise). Called from
/// `on_menu_event` when Cmd+W fires while the browser panel is visible.
pub fn close_active_tab_in_main_browser(app: &AppHandle) -> Result<(), String> {
    let manager = get_manager(MAIN_BROWSER_LABEL)?;

    let (tab_count, active_id) = {
        let m = manager.lock().unwrap();
        (m.tab_order.len(), m.active_tab_id.clone())
    };

    if tab_count == 0 {
        return Ok(());
    }

    if tab_count <= 1 {
        // Last tab — close it and notify React to switch away from the
        // browser view. We don't close the window (unlike the standalone
        // link-preview path) because the main window hosts the editor.
        if let Some(id) = active_id.clone() {
            let (removed, _) = {
                let mut m = manager.lock().unwrap();
                let removed = m.tabs.remove(&id);
                m.tab_order.retain(|tid| tid != &id);
                (removed, None::<String>)
            };
            if let Some(tab) = removed {
                if let Some(wv) = app.get_webview(&tab.webview_label) {
                    let _ = wv.close();
                }
            }
            {
                let mut m = manager.lock().unwrap();
                m.active_tab_id = None;
            }
            emit_tabs_updated(app, &manager);
        }
        // Notify React: panel has no tabs — switch to documents view.
        let _ = app.emit_to(MAIN_BROWSER_LABEL, "browser-panel:empty", ());
        return Ok(());
    }

    if let Some(id) = active_id {
        let (removed, next_id) = {
            let mut m = manager.lock().unwrap();
            let next_id = m
                .tab_order
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
                });
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
            switch_tab_internal(app, &manager, MAIN_BROWSER_LABEL, &next_id)?;
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

/// Emit the full tabs state to the frontend, scoped to the window that owns
/// this manager. Using `emit_to` (not `emit`) prevents cross-talk when both
/// a standalone link-preview window and the inline browser panel are open —
/// each window only receives events for its own tabs.
fn emit_tabs_updated(app: &AppHandle, manager: &Arc<Mutex<TabManager>>) {
    let (state, window_label) = {
        let m = manager.lock().unwrap();
        (build_tabs_state(&m), m.window_label.clone())
    };
    let _ = app.emit_to(window_label, "link-preview:tabs-updated", state);
}

/// Re-layout the UI webview and the active content webview to fill the window.
/// Called on window resize and scale-factor changes.
///
/// For standalone link-preview windows: resizes both the UI webview (tab strip
/// + address bar, height = `UI_HEIGHT`) and the active content webview.
/// For the inline browser panel in the main window: the UI is React (not a
/// separate webview), so we only reposition the active content webview using
/// the stored `BrowserPanelRect`. The UI webview resize is skipped because
/// the main window has no `ui-main` webview.
fn layout_webviews(app: &AppHandle, manager: &Arc<Mutex<TabManager>>, window_label: &str) {
    // Resolve content geometry. For the main window this uses the stored
    // ResizeObserver rect; for standalone windows it derives from window size.
    let (content_x, content_y, content_width, content_height) =
        match get_content_rect(app, window_label) {
            Some(rect) => rect,
            None => return,
        };

    // Resize UI webview (standalone link-preview windows only — the main
    // window's UI is React, not a separate ui-* webview).
    if window_label != MAIN_BROWSER_LABEL {
        let window = match app.get_window(window_label) {
            Some(w) => w,
            None => return,
        };
        let (width, _height) = match logical_window_size(&window) {
            Ok(dims) => dims,
            Err(_) => return,
        };
        let ui_label = ui_webview_label(window_label);
        if let Some(ui_wv) = app.get_webview(&ui_label) {
            let _ = ui_wv.set_size(LogicalSize::new(width, UI_HEIGHT));
        }
    }

    // Resize + reposition the active content webview. For the inline browser
    // panel we also need the tab's URL: an active `about:blank` tab means the
    // React start page is showing, so the native webview must be parked
    // off-screen (native webviews stack above the React DOM and would
    // otherwise cover it).
    let active = {
        let m = manager.lock().unwrap();
        m.active_tab_id
            .as_ref()
            .and_then(|id| m.tabs.get(id))
            .map(|t| (t.webview_label.clone(), t.url.clone()))
    };

    if let Some((label, url)) = active {
        if let Some(wv) = app.get_webview(&label) {
            let show_start_page = window_label == MAIN_BROWSER_LABEL && is_blank_url(&url);
            if show_start_page {
                let _ = wv.set_position(LogicalPosition::new(-10000.0, -10000.0));
            } else {
                let _ = wv.set_position(LogicalPosition::new(content_x, content_y));
                let _ = wv.set_size(LogicalSize::new(content_width, content_height));
            }
        }
    }
}

/// A tab counts as "blank" (show the React start page instead of the native
/// webview) when its URL is empty or any `about:blank` variant.
fn is_blank_url(url: &str) -> bool {
    let u = url.trim();
    u.is_empty() || u.eq_ignore_ascii_case("about:blank")
}

/// Create a new tab with the given URL, add its content webview, and switch to it.
fn add_tab_internal(
    app: &AppHandle,
    manager: &Arc<Mutex<TabManager>>,
    window_label: &str,
    url: String,
    opener_label: Option<String>,
) -> Result<String, String> {
    debug_log(&format!(
        "add_tab_internal CALLED: window={}, url={}, opener={:?}",
        window_label, url, opener_label
    ));
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
            // Only inject if the cookie doesn't already exist in the webview's
            // persistent cookie store. This prevents Chrome's (potentially stale)
            // cookies from overwriting cookies set during a previous session
            // (e.g. Google's "unusual traffic" verification cookies).
            lines.push(format!(
                "if(document.cookie.indexOf('{}=')===-1){{document.cookie='{}={}; path=/; domain=.{}; SameSite=None; Secure';}}",
                safe_name, safe_name, safe_value, host
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

    // Resolve the content area geometry. For standalone link-preview windows
    // this is derived from the window size (minus UI_HEIGHT). For the inline
    // browser panel in the main window, it comes from the stored rect
    // reported by React's ResizeObserver. If the rect isn't set yet (panel
    // just opened), fall back to off-screen — update_browser_panel_rect will
    // position the webview once React reports the container bounds.
    let (content_x, content_y, content_width, content_height) =
        match get_content_rect(app, window_label) {
            Some(rect) => rect,
            None => {
                // Rect not available — create off-screen with a placeholder size.
                // The webview will be repositioned when update_browser_panel_rect
                // arrives with the real container bounds.
                let (w, _h) = logical_window_size(&window)?;
                (0.0, 9999.0, w, 600.0)
            }
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
    let app_for_nav = app.clone();
    let manager_for_nav = manager.clone();
    let window_label_for_new_window = window_label.to_string();
    let window_label_for_nav = window_label.to_string();
    let webview_label_for_nav = webview_label.clone();

    let mut webview_builder = WebviewBuilder::new(
        &webview_label,
        WebviewUrl::External(url_parsed.clone()),
    )
    .user_agent(BROWSER_UA)
    // Use a persistent data store (macOS 14+) so cookies, localStorage, and
    // session data survive app restarts. Without this, WKWebView may use an
    // ephemeral store on some configurations, losing all browsing state.
    .data_store_identifier([
        0x4a, 0x53, 0x74, 0x75, 0x64, 0x69, 0x6f, 0x42,
        0x72, 0x6f, 0x77, 0x73, 0x65, 0x72, 0x00, 0x01,
    ])
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
        debug_log(&format!("on_page_load: label={}, url={}, loading={}", label, url_str, loading));
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
    // window.open() / target="_blank" -> open as new tab instead of popup.
    //
    // This is called as a FALLBACK when the JS intercept's primary iframe
    // mechanism (on_navigation) fails on certain sites (e.g. zhihu.com
    // where the iframe navigation to newtab.invalid is silently dropped).
    // The JS saves the original window.open and calls it in openAsTab after
    // creating the iframe, so both handlers may fire. Rust-side deduplication
    // (last_new_tab in TabManager) ensures only one tab is created.
    .on_new_window(move |new_url, _features| {
        let url = new_url.as_str().to_string();
        debug_log(&format!("on_new_window FIRED: url={}", url));
        // Check deduplication AND get opener label in one lock.
        let (opener_label, should_create) = {
            let mut m = manager_for_new_window.lock().unwrap();
            let opener = m.active_tab_id
                .as_ref()
                .and_then(|id| m.tabs.get(id))
                .map(|t| t.webview_label.clone());
            let dup = match &m.last_new_tab {
                Some((last_url, last_time))
                    if last_url == &url && last_time.elapsed().as_secs() < 2 =>
                {
                    true
                }
                _ => false,
            };
            if !dup {
                m.last_new_tab = Some((url.clone(), std::time::Instant::now()));
            }
            (opener, !dup)
        };
        debug_log(&format!(
            "on_new_window: opener_label={:?}, should_create={}",
            opener_label, should_create
        ));
        if should_create {
            let app = app_for_new_window.clone();
            let manager = manager_for_new_window.clone();
            let window_label = window_label_for_new_window.clone();
            let app_handle = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(50));
                debug_log("on_new_window: thread woke, calling run_on_main_thread");
                if let Err(e) = app_handle.run_on_main_thread(move || {
                    debug_log("on_new_window: running add_tab_internal on main thread");
                    if let Err(e) = add_tab_internal(&app, &manager, &window_label, url, opener_label) {
                        debug_log(&format!("on_new_window: add_tab_internal FAILED: {}", e));
                        eprintln!("[browser] on_new_window: add_tab_internal failed: {e}");
                    } else {
                        debug_log("on_new_window: add_tab_internal OK");
                    }
                }) {
                    debug_log(&format!("on_new_window: run_on_main_thread FAILED: {}", e));
                    eprintln!("[browser] on_new_window: run_on_main_thread failed: {e}");
                }
            });
        } else {
            debug_log("on_new_window: skipping duplicate tab creation");
        }
        NewWindowResponse::Deny
    })
    // Intercept `http://newtab.invalid/?u=<encoded_url>` navigations
    // from NEW_TAB_INTERCEPT_JS. The JS creates a hidden iframe with
    // this URL; this handler extracts the real URL from the `u` query
    // param, spawns a new tab, and cancels the iframe navigation.
    // Using a real HTTP URL (with a reserved .invalid TLD) ensures
    // WKWebView fires decidePolicyForNavigationAction, unlike custom
    // URL schemes which may be silently dropped.
    .on_navigation(move |url| {
        let url_str = url.as_str();
        debug_log(&format!("on_navigation: url={}", url_str));
        if url.host_str() == Some("initlog.invalid") {
            debug_log("on_navigation: *** INIT SCRIPT IS RUNNING ***");
            return false;
        }
        if url.host_str() == Some("openlog.invalid") {
            let u = url.query_pairs().find(|(k, _)| k == "u").map(|(_, v)| v.to_string()).unwrap_or_default();
            let t = url.query_pairs().find(|(k, _)| k == "t").map(|(_, v)| v.to_string()).unwrap_or_default();
            debug_log(&format!("on_navigation: *** window.open CALLED: url='{}' target='{}'", u, t));
            return false;
        }
        if url.host_str() == Some("newtab.invalid") {
            debug_log(&format!("on_navigation: newtab.invalid detected, full_url={}", url_str));
            let real_url = url
                .query_pairs()
                .find(|(k, _)| k == "u")
                .map(|(_, v)| v.to_string());
            debug_log(&format!("on_navigation: extracted real_url={:?}", real_url));
            if let Some(real_url) = real_url
                && !real_url.is_empty()
            {
                // Get the opener label AND check deduplication in one lock
                // to prevent double-tab creation when both the iframe
                // (on_navigation) and native window.open (on_new_window)
                // fire for the same link.
                let (opener_label, should_create) = {
                    let mut m = manager_for_nav.lock().unwrap();
                    let opener = m.active_tab_id
                        .as_ref()
                        .and_then(|id| m.tabs.get(id))
                        .map(|t| t.webview_label.clone());
                    let dup = match &m.last_new_tab {
                        Some((last_url, last_time))
                            if last_url == &real_url && last_time.elapsed().as_secs() < 2 =>
                        {
                            true
                        }
                        _ => false,
                    };
                    if !dup {
                        m.last_new_tab =
                            Some((real_url.clone(), std::time::Instant::now()));
                    }
                    (opener, !dup)
                };
                debug_log(&format!(
                    "on_navigation: opener_label={:?}, should_create={}",
                    opener_label, should_create
                ));
                if should_create {
                    let app = app_for_nav.clone();
                    let manager = manager_for_nav.clone();
                    let window_label = window_label_for_nav.clone();
                    let app_handle = app.clone();
                    std::thread::spawn(move || {
                        debug_log("on_navigation: thread woke, calling run_on_main_thread");
                        let _ = app_handle.run_on_main_thread(move || {
                            debug_log("on_navigation: running add_tab_internal on main thread");
                            if let Err(e) = add_tab_internal(&app, &manager, &window_label, real_url, opener_label) {
                                debug_log(&format!("on_navigation: add_tab_internal FAILED: {}", e));
                                eprintln!(
                                    "[browser] on_navigation newtab: add_tab_internal failed: {e}"
                                );
                            } else {
                                debug_log("on_navigation: add_tab_internal OK");
                            }
                        });
                    });
                } else {
                    debug_log("on_navigation: skipping duplicate tab creation");
                }
            }
            return false;
        }
        // Forward postMessage from opened tab back to its opener
        if url.host_str() == Some("postmessage.invalid") {
            debug_log(&format!("on_navigation: postmessage.invalid detected, full_url={}", url_str));
            let data_json = url
                .query_pairs()
                .find(|(k, _)| k == "d")
                .map(|(_, v)| v.to_string());
            if let Some(data_json) = data_json {
                debug_log(&format!("on_navigation: postmessage data={}", data_json));
                let mgr = manager_for_nav.clone();
                let app_clone = app_for_nav.clone();
                let wv_label = webview_label_for_nav.clone();
                // Look up this tab's opener and forward the message
                let (opener_label, js_to_eval) = {
                    let m = mgr.lock().unwrap();
                    // Find the tab whose webview_label matches this webview
                    let tab = m.tabs.values().find(|t| t.webview_label == wv_label);
                    let opener = tab.and_then(|t| t.opener_webview_label.clone());
                    if let Some(ref opener) = opener {
                        // Parse the JSON to determine if it's a postMessage or a navigation
                        // Use serde_json or manual parsing
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data_json) {
                            if let Some(pm_data) = val.get("_pm") {
                                // postMessage: dispatch a MessageEvent on the opener's window
                                let origin = val.get("_origin").and_then(|o| o.as_str()).unwrap_or("*");
                                let js = format!(
                                    "window.dispatchEvent(new MessageEvent('message',{{data:{},origin:'{}'}}))",
                                    pm_data, origin
                                );
                                (Some(opener.clone()), Some(js))
                            } else if let Some(nav_url) = val.get("_opener_nav").and_then(|v| v.as_str()) {
                                // Navigate opener to URL
                                (Some(opener.clone()), Some(format!("window.location.href='{}'", nav_url.replace('\'', "\\'"))))
                            } else {
                                (None, None)
                            }
                        } else {
                            (None, None)
                        }
                    } else {
                        (None, None)
                    }
                };
                if let (Some(opener), Some(js)) = (opener_label, js_to_eval) {
                    debug_log(&format!("on_navigation: forwarding to opener {}, js={}", opener, js));
                    if let Some(wv) = app_clone.get_webview(&opener) {
                        let _ = wv.eval(&js);
                        debug_log("on_navigation: eval_js on opener OK");
                    } else {
                        debug_log(&format!("on_navigation: opener webview {} not found", opener));
                    }
                }
            }
            return false;
        }
        true
    })
    .initialization_script(NEW_TAB_INTERCEPT_JS);

    // If this tab was opened by another tab (via window.open / target=_blank),
    // inject a `window.opener` proxy so OAuth callback pages can communicate
    // back to the opener via postMessage. The proxy forwards postMessage calls
    // through a hidden iframe to `http://postmessage.invalid/?d=<json>`, which
    // the on_navigation handler intercepts and forwards to the opener webview.
    if let Some(ref _opener) = opener_label {
        webview_builder = webview_builder.initialization_script(OPENER_PROXY_JS);
    }

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
    // We use content_x/content_y from get_content_rect so this works for both
    // standalone link-preview windows (0, UI_HEIGHT) and the inline browser
    // panel in the main window (rect.x, rect.y from ResizeObserver).
    //
    // Exception: in the inline browser panel a fresh `about:blank` tab shows
    // the React start page, not the native webview -- keep it parked
    // off-screen (it gets positioned by layout_webviews once it navigates to
    // a real URL).
    let park_offscreen = window_label == MAIN_BROWSER_LABEL && is_blank_url(&url);
    if park_offscreen {
        new_webview
            .set_position(LogicalPosition::new(-10000.0, -10000.0))
            .map_err(|e| format!("failed to park blank webview: {e}"))?;
    } else {
        new_webview
            .set_position(LogicalPosition::new(content_x, content_y))
            .map_err(|e| format!("failed to position new webview: {e}"))?;
        new_webview
            .set_size(LogicalSize::new(content_width, content_height))
            .map_err(|e| format!("failed to size new webview: {e}"))?;
    }

    // --- Create tab record ---
    let tab = Tab {
        id: tab_id.clone(),
        webview_label: webview_label.clone(),
        url: url.clone(),
        title: initial_title.clone(),
        loading: url != "about:blank",
        opener_webview_label: opener_label.clone(),
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
    // Resolve the content area geometry. For standalone link-preview windows
    // this is derived from the window size; for the inline browser panel in
    // the main window it comes from the stored ResizeObserver rect. If the
    // rect isn't set yet (main window, panel just opened), skip positioning —
    // the webview stays off-screen and update_browser_panel_rect will place
    // it once React reports the container bounds.
    let (content_x, content_y, content_width, content_height) =
        match get_content_rect(app, window_label) {
            Some(rect) => rect,
            None => return Ok(()),
        };

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

    // Show new active tab. For the inline browser panel we delegate to
    // layout_webviews so the blank-tab / start-page rule (park about:blank
    // off-screen) is applied consistently. Standalone link-preview windows
    // don't have a start page, so position directly as before.
    if window_label == MAIN_BROWSER_LABEL {
        // active_tab_id is updated by the caller *after* switch_tab_internal
        // returns, so set it here first for layout_webviews to see the new
        // active tab.
        {
            let mut m = manager.lock().unwrap();
            m.active_tab_id = Some(tab_id.to_string());
        }
        layout_webviews(app, manager, window_label);
        return Ok(());
    }

    let wv = app
        .get_webview(&target_label)
        .ok_or_else(|| format!("webview not found for tab {}: {}", tab_id, target_label))?;
    wv.set_position(LogicalPosition::new(content_x, content_y))
        .map_err(|e| format!("failed to position webview: {e}"))?;
    wv.set_size(LogicalSize::new(content_width, content_height))
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
