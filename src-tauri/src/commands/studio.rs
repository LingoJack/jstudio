//! JStudio workspace/page/graph IPC 命令。

use crate::models::studio::{Backlink, KnowledgeGraph, PageDoc, PageSummary, PluginManifest, SyncStatus, WorkspaceMeta};
use crate::services::studio_service;

/// 打开或初始化工作区。
#[tauri::command]
pub fn open_workspace(path: Option<String>) -> Result<WorkspaceMeta, String> {
    studio_service::open_workspace(path).map_err(|err| err.to_string())
}

/// 列出页面。
#[tauri::command]
pub fn list_pages(workspace_path: String) -> Result<Vec<PageSummary>, String> {
    studio_service::list_pages(&workspace_path).map_err(|err| err.to_string())
}

/// 创建页面。
#[tauri::command]
pub fn create_page(
    workspace_path: String,
    title: Option<String>,
    parent_id: Option<String>,
) -> Result<PageDoc, String> {
    studio_service::create_page(&workspace_path, title, parent_id).map_err(|err| err.to_string())
}

/// 读取页面。
#[tauri::command]
pub fn get_page(workspace_path: String, page_id: String) -> Result<PageDoc, String> {
    studio_service::get_page(&workspace_path, &page_id).map_err(|err| err.to_string())
}

/// 保存页面。
#[tauri::command]
pub fn save_page(workspace_path: String, page: PageDoc) -> Result<PageDoc, String> {
    studio_service::save_page(&workspace_path, page).map_err(|err| err.to_string())
}

/// 删除页面。
#[tauri::command]
pub fn delete_page(workspace_path: String, page_id: String) -> Result<Vec<PageSummary>, String> {
    studio_service::delete_page(&workspace_path, &page_id).map_err(|err| err.to_string())
}

/// 重建图谱。
#[tauri::command]
pub fn rebuild_graph(workspace_path: String) -> Result<KnowledgeGraph, String> {
    studio_service::rebuild_graph(&workspace_path).map_err(|err| err.to_string())
}

/// 获取图谱。
#[tauri::command]
pub fn get_graph(workspace_path: String) -> Result<KnowledgeGraph, String> {
    studio_service::get_graph(&workspace_path).map_err(|err| err.to_string())
}

/// 获取反链。
#[tauri::command]
pub fn get_backlinks(workspace_path: String, page_id: String) -> Result<Vec<Backlink>, String> {
    studio_service::get_backlinks(&workspace_path, &page_id).map_err(|err| err.to_string())
}

/// 获取内置插件。
#[tauri::command]
pub fn list_plugins() -> Vec<PluginManifest> {
    studio_service::list_plugins()
}

/// 获取同步状态。
#[tauri::command]
pub fn get_sync_status(workspace_path: String) -> Result<SyncStatus, String> {
    studio_service::get_sync_status(&workspace_path).map_err(|err| err.to_string())
}
