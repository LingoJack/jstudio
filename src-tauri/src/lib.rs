//! OmniNote 后端 — 提供最小 Tauri 启动壳。

/// 启动 Tauri 桌面应用。
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .inspect_err(|e| eprintln!("OmniNote 启动失败：{e}"))
        .ok();
}
