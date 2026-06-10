//! 应用级命令：初始化、退出、Markdown 解析。

/// 获取应用初始状态。
#[tauri::command]
pub async fn get_initial() -> Result<crate::models::responses::InitialResp, String> {
    tokio::task::spawn_blocking(crate::services::file_service::get_initial)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// 退出应用（关闭窗口）。
#[tauri::command]
pub fn quit_reader(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

/// 解析 Markdown 源码为 IR JSON。
#[tauri::command]
pub async fn parse_markdown(source: String) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let doc = crate::markdown::parser::parse_markdown(&source, 120);
        serde_json::to_value(doc).map_err(|err| format!("Markdown IR 序列化失败：{err}"))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
