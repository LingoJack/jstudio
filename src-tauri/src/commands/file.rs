//! 文件相关命令：读取、保存、创建、删除、重命名。

use crate::models::requests::{CreateReq, PathReq, RenameReq, SaveReq};
use crate::services;

/// 读取文件并渲染。
#[tauri::command]
pub async fn read_file(path: String) -> Result<crate::renderer::RenderedDoc, String> {
    tokio::task::spawn_blocking(move || services::file_service::read_file(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// 保存文件。
#[tauri::command]
pub async fn save_file(req: SaveReq) -> Result<(), String> {
    tokio::task::spawn_blocking(move || services::file_service::save_file(&req.path, &req.source))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// 创建新文件。
#[tauri::command]
pub async fn create_file(req: CreateReq) -> Result<crate::models::responses::CreateResp, String> {
    tokio::task::spawn_blocking(move || {
        services::file_service::create_path(&req, services::file_service::CreateKind::File)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// 创建新目录。
#[tauri::command]
pub async fn create_dir(req: CreateReq) -> Result<crate::models::responses::CreateResp, String> {
    tokio::task::spawn_blocking(move || {
        services::file_service::create_path(&req, services::file_service::CreateKind::Directory)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// 删除文件或目录。
#[tauri::command]
pub async fn delete_path(req: PathReq) -> Result<(), String> {
    tokio::task::spawn_blocking(move || services::file_service::delete_path(&req.path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// 重命名文件或目录。
#[tauri::command]
pub async fn rename_path(req: RenameReq) -> Result<crate::models::responses::RenameResp, String> {
    tokio::task::spawn_blocking(move || {
        services::file_service::rename_path(&req.path, &req.new_name)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// 在文件管理器中显示。
#[tauri::command]
pub async fn show_in_folder(req: PathReq) -> Result<(), String> {
    tokio::task::spawn_blocking(move || services::file_service::show_in_folder(&req.path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
