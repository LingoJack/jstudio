//! 目录相关命令：列出目录、打开/切换根目录。

use crate::models::requests::PathReq;
use crate::services;

/// 列出目录内容。
#[tauri::command]
pub async fn list_dir(
    dir: String,
    hidden: Option<bool>,
) -> Result<crate::models::responses::ListResp, String> {
    let show_hidden = hidden.unwrap_or(false);
    tokio::task::spawn_blocking(move || services::file_service::list_dir(&dir, show_hidden))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// 打开并切换根目录。
#[tauri::command]
pub async fn open_dir(req: PathReq) -> Result<crate::models::responses::CreateResp, String> {
    tokio::task::spawn_blocking(move || services::file_service::open_dir(&req.path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
