use serde::Serialize;
use tauri::Manager;

/// Build info exposed to the frontend (About page, Debug settings).
#[derive(Serialize)]
pub struct BuildInfo {
    /// Short git commit hash at build time (e.g. "b0e9512"), or "unknown".
    pub commit: &'static str,
    /// `true` in debug builds, `false` in release.
    pub is_dev: bool,
}

/// Return build metadata: git commit hash + whether this is a debug build.
#[tauri::command]
pub fn get_build_info() -> BuildInfo {
    BuildInfo {
        commit: env!("JSTUDIO_BUILD_COMMIT"),
        is_dev: cfg!(debug_assertions),
    }
}

/// Open the WebView inspector (devtools). In release builds this is a no-op
/// unless the app was compiled with the `devtools` feature.
#[tauri::command]
pub fn open_devtools(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
    }
}
