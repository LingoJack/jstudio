/*!
 * Native WKUIDelegate for browser-grade tab creation.
 *
 * Replaces wry's default `WKUIDelegate` on each content webview so that
 * `createWebViewWithConfiguration` returns a **real WKWebView** instead of
 * nil. This makes `window.open()`, `target="_blank"`, and
 * `<form target="_blank">` work exactly like Safari/Chrome:
 *
 *   - `window.open(url)` returns a proxy to the new tab's window (not null)
 *   - `window.opener` is set automatically by WebKit
 *   - `postMessage` works natively (no iframe proxies needed)
 *
 * The new WKWebView is created with the configuration WebKit provides
 * (same process pool, data store, cookies as the parent), added as a
 * subview of the parent window, and registered with `TabManager` via a
 * callback.
 *
 * For webviews created by `createWebViewWithConfiguration` (i.e. via
 * `window.open`), we also attach a `BrowserNavigationDelegate` (page
 * load tracking) and a KVO title observer, since these WKWebViews are
 * not managed by Tauri/wry and don't have wry's built-in delegates.
 */

#[cfg(target_os = "macos")]
use std::cell::RefCell;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
#[cfg(target_os = "macos")]
use std::ptr::null_mut;
#[cfg(target_os = "macos")]
use std::sync::OnceLock;

#[cfg(target_os = "macos")]
use block2::Block;
#[cfg(target_os = "macos")]
use objc2::{
    AllocAnyThread, DefinedClass, MainThreadOnly, define_class, msg_send, rc::Retained,
    runtime::AnyObject, runtime::NSObject,
};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSModalResponse, NSModalResponseOK, NSOpenPanel};
#[cfg(target_os = "macos")]
use objc2_foundation::{
    NSDictionary, NSKeyValueChangeKey, NSKeyValueObservingOptions,
    NSObjectNSKeyValueObserverRegistration, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString,
    ns_string,
};
#[cfg(target_os = "macos")]
use objc2_web_kit::{
    WKFrameInfo, WKMediaCaptureType, WKNavigation, WKNavigationAction, WKNavigationActionPolicy,
    WKNavigationDelegate, WKOpenPanelParameters, WKPermissionDecision, WKSecurityOrigin,
    WKUIDelegate, WKWebView, WKWebViewConfiguration, WKWindowFeatures,
};

// ── Callback type ────────────────────────────────────────────────────────

/// Called when `createWebViewWithConfiguration` creates a new WKWebView.
/// The callback registers the webview with `TabManager`, positions it,
/// and emits state to the frontend. Returns the generated tab ID.
///
/// Takes a raw `usize` pointer (not `Retained<WKWebView>`) so the callback
/// can be `Send + Sync` and stored in `OnceLock`. The callback converts the
/// pointer back to `&WKWebView` on the main thread (safe because
/// `createWebViewWithConfiguration` always runs on the main thread).
#[cfg(target_os = "macos")]
pub type NewTabCallback = Box<dyn Fn(usize, String, Option<String>) -> String + Send + Sync>;

#[cfg(target_os = "macos")]
static NEW_TAB_CALLBACK: OnceLock<NewTabCallback> = OnceLock::new();

#[cfg(target_os = "macos")]
pub fn set_new_tab_callback(callback: NewTabCallback) {
    let _ = NEW_TAB_CALLBACK.set(callback);
}

// ── BrowserUIDelegate ────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
struct BrowserUIDelegateIvars {
    /// User agent string to set on new webviews.
    user_agent: String,
}

#[cfg(target_os = "macos")]
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = BrowserUIDelegateIvars]
    struct BrowserUIDelegate;

    unsafe impl NSObjectProtocol for BrowserUIDelegate {}

    unsafe impl WKUIDelegate for BrowserUIDelegate {
        /// The core method: called by WebKit when `window.open(url)`,
        /// `a[target="_blank"]`, or `<form target="_blank">` is activated.
        ///
        /// We create a new WKWebView with the **same configuration** WebKit
        /// prepared (same process pool, data store, cookies), add it as a
        /// subview of the parent window, register it with TabManager, and
        /// return it. WebKit then automatically:
        ///   - Loads the request URL in the new WKWebView
        ///   - Sets `window.opener` on the new webview
        ///   - Returns a proxy to the new window from `window.open()`
        #[unsafe(method_id(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        unsafe fn create_web_view(
            &self,
            web_view: &WKWebView,
            configuration: &WKWebViewConfiguration,
            navigation_action: &WKNavigationAction,
            _window_features: &WKWindowFeatures,
        ) -> Option<Retained<WKWebView>> {
            let mtm = objc2_foundation::MainThreadMarker::new().unwrap();

            // Extract the target URL from the navigation action
            let request = unsafe { navigation_action.request() };
            let url_nsstr = request.URL().unwrap();
            let url = url_nsstr.absoluteString().unwrap().to_string();

            // Create the new WKWebView with WebKit's configuration (shares
            // process pool, data store, cookies with the parent).
            let frame = NSRect::new(NSPoint::new(0.0, 9999.0), NSSize::new(800.0, 600.0));
            let new_webview = unsafe {
                WKWebView::initWithFrame_configuration(
                    mtm.alloc::<WKWebView>(),
                    frame,
                    configuration,
                )
            };

            // Set the custom user agent
            let ua = NSString::from_str(&self.ivars().user_agent);
            unsafe {
                new_webview.setCustomUserAgent(Some(&ua));
            }

            // Add as subview of the parent window's content view
            if let Some(window) = web_view.window() {
                if let Some(content_view) = window.contentView() {
                    content_view.addSubview(&new_webview);
                }
            }

            // Determine the opener's webview label (the parent webview).
            let opener_ptr = (web_view as *const WKWebView) as usize;

            // Register with TabManager via callback. We pass the raw pointer
            // (usize) instead of Retained<WKWebView> so the callback can be
            // Send + Sync (stored in OnceLock). The callback converts the
            // pointer back to &WKWebView on the main thread.
            let new_wv_ptr = Retained::as_ptr(&new_webview) as usize;
            let tab_id = NEW_TAB_CALLBACK.get().expect("new tab callback not set")(
                new_wv_ptr,
                url,
                Some(format!("ptr:{}", opener_ptr)),
            );

            // Set up navigation delegate + title observer for this webview
            let tab_id_for_observer = tab_id.clone();
            let nav_delegate = BrowserNavigationDelegate::new(mtm, tab_id.clone());
            let proto_nav = objc2::runtime::ProtocolObject::from_ref(&*nav_delegate);
            unsafe {
                new_webview.setNavigationDelegate(Some(proto_nav));
            }

            let title_observer = TitleObserver::new(
                new_webview.clone(),
                Box::new(move |title: String| {
                    on_title_changed(&tab_id_for_observer, title);
                }),
            );

            // Store delegates in the registry to prevent deallocation
            register_associated_delegates(&tab_id, nav_delegate, title_observer);

            Some(new_webview)
        }

        /// File upload panel (copied from wry's implementation).
        #[unsafe(method(webView:runOpenPanelWithParameters:initiatedByFrame:completionHandler:))]
        unsafe fn run_file_upload_panel(
            &self,
            _webview: &WKWebView,
            open_panel_params: &WKOpenPanelParameters,
            _frame: &WKFrameInfo,
            handler: &Block<dyn Fn(*const objc2_foundation::NSArray<objc2_foundation::NSURL>)>,
        ) {
            if let Some(mtm) = objc2_foundation::MainThreadMarker::new() {
                let open_panel = NSOpenPanel::openPanel(mtm);
                open_panel.setCanChooseFiles(true);
                let allow_multi = unsafe { open_panel_params.allowsMultipleSelection() };
                open_panel.setAllowsMultipleSelection(allow_multi);
                let allow_dir = unsafe { open_panel_params.allowsDirectories() };
                open_panel.setCanChooseDirectories(allow_dir);
                let ok: NSModalResponse = open_panel.runModal();
                if ok == NSModalResponseOK {
                    let url = open_panel.URLs();
                    (*handler).call((Retained::as_ptr(&url),));
                } else {
                    (*handler).call((null_mut(),));
                }
            }
        }

        /// Media capture permission (copied from wry's implementation).
        #[unsafe(method(webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:))]
        unsafe fn request_media_capture_permission(
            &self,
            _webview: &WKWebView,
            _origin: &WKSecurityOrigin,
            _frame: &WKFrameInfo,
            _capture_type: WKMediaCaptureType,
            decision_handler: &Block<dyn Fn(WKPermissionDecision)>,
        ) {
            (*decision_handler).call((WKPermissionDecision::Grant,));
        }
    }
);

#[cfg(target_os = "macos")]
impl BrowserUIDelegate {
    pub fn new(_mtm: objc2_foundation::MainThreadMarker, user_agent: String) -> Retained<Self> {
        let delegate = _mtm
            .alloc::<BrowserUIDelegate>()
            .set_ivars(BrowserUIDelegateIvars { user_agent });
        unsafe { msg_send![super(delegate), init] }
    }
}

// ── BrowserNavigationDelegate ────────────────────────────────────────────

#[cfg(target_os = "macos")]
struct BrowserNavDelegateIvars {
    tab_id: String,
}

#[cfg(target_os = "macos")]
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = BrowserNavDelegateIvars]
    struct BrowserNavigationDelegate;

    unsafe impl NSObjectProtocol for BrowserNavigationDelegate {}

    unsafe impl WKNavigationDelegate for BrowserNavigationDelegate {
        /// Allow all navigations.
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        unsafe fn decide_policy(
            &self,
            _webview: &WKWebView,
            _action: &WKNavigationAction,
            handler: &Block<dyn Fn(WKNavigationActionPolicy)>,
        ) {
            (*handler).call((WKNavigationActionPolicy::Allow,));
        }

        /// Page load started.
        #[unsafe(method(webView:didStartProvisionalNavigation:))]
        unsafe fn did_start(&self, _webview: &WKWebView, _navigation: Option<&WKNavigation>) {
            let tab_id = &self.ivars().tab_id;
            on_page_load_changed(tab_id, true);
        }

        /// Page load finished.
        #[unsafe(method(webView:didFinishNavigation:))]
        unsafe fn did_finish(&self, webview: &WKWebView, _navigation: Option<&WKNavigation>) {
            let tab_id = &self.ivars().tab_id;
            on_page_load_changed(tab_id, false);
            // Update URL from the webview
            if let Some(url) = unsafe { webview.URL() } {
                let url_str = url.absoluteString().unwrap().to_string();
                on_url_changed(tab_id, url_str);
            }
        }
    }
);

#[cfg(target_os = "macos")]
impl BrowserNavigationDelegate {
    pub fn new(_mtm: objc2_foundation::MainThreadMarker, tab_id: String) -> Retained<Self> {
        let delegate = _mtm
            .alloc::<BrowserNavigationDelegate>()
            .set_ivars(BrowserNavDelegateIvars { tab_id });
        unsafe { msg_send![super(delegate), init] }
    }
}

// ── TitleObserver (KVO) ──────────────────────────────────────────────────

#[cfg(target_os = "macos")]
struct TitleObserverIvars {
    webview: Retained<WKWebView>,
    handler: Box<dyn Fn(String)>,
}

#[cfg(target_os = "macos")]
define_class!(
    #[unsafe(super(NSObject))]
    #[ivars = TitleObserverIvars]
    struct TitleObserver;

    impl TitleObserver {
        #[unsafe(method(observeValueForKeyPath:ofObject:change:context:))]
        fn observe_value(
            &self,
            key_path: Option<&NSString>,
            _of_object: Option<&AnyObject>,
            _change: Option<&NSDictionary<NSKeyValueChangeKey, AnyObject>>,
            _context: *mut c_void,
        ) {
            if let Some(key_path) = key_path {
                unsafe {
                    if key_path.isEqualToString(ns_string!("title")) {
                        let title: Retained<NSString> =
                            msg_send![&self.ivars().webview, title];
                        (self.ivars().handler)(title.to_string());
                    }
                }
            }
        }
    }

    unsafe impl NSObjectProtocol for TitleObserver {}
);

#[cfg(target_os = "macos")]
impl TitleObserver {
    pub fn new(webview: Retained<WKWebView>, handler: Box<dyn Fn(String)>) -> Retained<Self> {
        let observer = Self::alloc().set_ivars(TitleObserverIvars {
            webview: webview.clone(),
            handler,
        });
        let observer: Retained<Self> = unsafe { msg_send![super(observer), init] };
        unsafe {
            webview.addObserver_forKeyPath_options_context(
                &observer,
                ns_string!("title"),
                NSKeyValueObservingOptions::New,
                null_mut(),
            );
        }
        observer
    }
}

#[cfg(target_os = "macos")]
impl Drop for TitleObserver {
    fn drop(&mut self) {
        unsafe {
            self.ivars()
                .webview
                .removeObserver_forKeyPath(self, ns_string!("title"));
        }
    }
}

// ── Delegate registry ────────────────────────────────────────────────────
//
// We must retain the navigation delegate and title observer for the
// lifetime of the WKWebView, otherwise they'll be deallocated and the
// delegate methods won't fire. WKWebView only holds a weak reference to
// its delegates.

#[cfg(target_os = "macos")]
#[allow(dead_code)]
struct AssociatedDelegates {
    nav_delegate: Retained<BrowserNavigationDelegate>,
    title_observer: Retained<TitleObserver>,
}

#[cfg(target_os = "macos")]
thread_local! {
    static DELEGATE_REGISTRY: RefCell<std::collections::HashMap<String, AssociatedDelegates>> =
        RefCell::new(std::collections::HashMap::new());
}

#[cfg(target_os = "macos")]
fn register_associated_delegates(
    tab_id: &str,
    nav_delegate: Retained<BrowserNavigationDelegate>,
    title_observer: Retained<TitleObserver>,
) {
    DELEGATE_REGISTRY.with(|r| {
        r.borrow_mut().insert(
            tab_id.to_string(),
            AssociatedDelegates {
                nav_delegate,
                title_observer,
            },
        );
    });
}

#[cfg(target_os = "macos")]
pub fn unregister_associated_delegates(tab_id: &str) {
    DELEGATE_REGISTRY.with(|r| {
        r.borrow_mut().remove(tab_id);
    });
}

// ── Callbacks to TabManager ──────────────────────────────────────────────
//
// These are set at startup by `link_tabs.rs` via `set_callbacks`.

#[cfg(target_os = "macos")]
struct Callbacks {
    on_title_changed: Box<dyn Fn(&str, String) + Send + Sync>,
    on_page_load_changed: Box<dyn Fn(&str, bool) + Send + Sync>,
    on_url_changed: Box<dyn Fn(&str, String) + Send + Sync>,
}

#[cfg(target_os = "macos")]
static CALLBACKS: OnceLock<Callbacks> = OnceLock::new();

#[cfg(target_os = "macos")]
pub fn set_callbacks(
    on_title_changed: Box<dyn Fn(&str, String) + Send + Sync>,
    on_page_load_changed: Box<dyn Fn(&str, bool) + Send + Sync>,
    on_url_changed: Box<dyn Fn(&str, String) + Send + Sync>,
) {
    let _ = CALLBACKS.set(Callbacks {
        on_title_changed,
        on_page_load_changed,
        on_url_changed,
    });
}

#[cfg(target_os = "macos")]
fn on_title_changed(tab_id: &str, title: String) {
    if let Some(cb) = CALLBACKS.get() {
        (cb.on_title_changed)(tab_id, title);
    }
}

#[cfg(target_os = "macos")]
fn on_page_load_changed(tab_id: &str, loading: bool) {
    if let Some(cb) = CALLBACKS.get() {
        (cb.on_page_load_changed)(tab_id, loading);
    }
}

#[cfg(target_os = "macos")]
fn on_url_changed(tab_id: &str, url: String) {
    if let Some(cb) = CALLBACKS.get() {
        (cb.on_url_changed)(tab_id, url);
    }
}

// ── Public API: install custom UIDelegate on a Tauri webview ─────────────

/// Replaces wry's default `WKUIDelegate` with our `BrowserUIDelegate` on
/// the given Tauri webview. Call this after `window.add_child(...)`.
///
/// The `on_create_webview` callback is invoked synchronously inside
/// `createWebViewWithConfiguration` when a new tab is requested via
/// `window.open` / `target="_blank"`. It receives the new `WKWebView`,
/// the URL, and an optional opener identifier.
#[cfg(target_os = "macos")]
pub fn install_browser_ui_delegate(webview: &tauri::Webview, user_agent: String) {
    let _ = webview.with_webview(move |platform_webview| {
        let mtm = objc2_foundation::MainThreadMarker::new().unwrap();
        let wkwebview: &WKWebView = unsafe { &*platform_webview.inner().cast() };

        let delegate = BrowserUIDelegate::new(mtm, user_agent);

        // Store the delegate in a static registry to prevent deallocation.
        // WKWebView holds only a weak/assign reference to its UIDelegate.
        let ptr = (wkwebview as *const WKWebView) as usize;
        store_ui_delegate(ptr, delegate.clone());

        let proto = objc2::runtime::ProtocolObject::from_ref(&*delegate);
        unsafe {
            wkwebview.setUIDelegate(Some(proto));
        }
    });
}

// ── UI delegate registry ─────────────────────────────────────────────────

#[cfg(target_os = "macos")]
thread_local! {
    static UI_DELEGATE_REGISTRY: RefCell<std::collections::HashMap<usize, Retained<BrowserUIDelegate>>> =
        RefCell::new(std::collections::HashMap::new());
}

#[cfg(target_os = "macos")]
fn store_ui_delegate(ptr: usize, delegate: Retained<BrowserUIDelegate>) {
    UI_DELEGATE_REGISTRY.with(|r| {
        r.borrow_mut().insert(ptr, delegate);
    });
}

#[cfg(target_os = "macos")]
pub fn remove_ui_delegate(ptr: usize) {
    UI_DELEGATE_REGISTRY.with(|r| {
        r.borrow_mut().remove(&ptr);
    });
}

// ── Helper: position a raw WKWebView ─────────────────────────────────────

/// Sets the frame (position + size) of a raw WKWebView that is a subview
/// of the main window. Used for webviews created by
/// `createWebViewWithConfiguration` (not managed by Tauri).
#[cfg(target_os = "macos")]
pub fn set_webview_frame(webview: &WKWebView, x: f64, y: f64, width: f64, height: f64) {
    let frame = NSRect::new(NSPoint::new(x, y), NSSize::new(width, height));
    webview.setFrame(frame);
}

/// Moves a raw WKWebView off-screen (used when hiding a tab).
#[cfg(target_os = "macos")]
pub fn hide_webview(webview: &WKWebView) {
    let frame = NSRect::new(NSPoint::new(0.0, 9999.0), NSSize::new(1.0, 1.0));
    webview.setFrame(frame);
}

/// Removes a raw WKWebView from its superview and cleans up delegates.
#[cfg(target_os = "macos")]
pub fn destroy_webview(webview: &WKWebView, tab_id: &str) {
    webview.removeFromSuperview();
    unregister_associated_delegates(tab_id);
    let ptr = (webview as *const WKWebView) as usize;
    remove_ui_delegate(ptr);
}
