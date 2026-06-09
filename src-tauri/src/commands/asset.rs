//! 资源读取命令。

use crate::services;

/// 读取本地资源（图片等）。
#[tauri::command]
pub async fn read_asset(path: String) -> Result<crate::models::responses::AssetResp, String> {
    tokio::task::spawn_blocking(move || services::file_service::read_asset(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
