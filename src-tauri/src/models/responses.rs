//! 响应结构体 — 返回给前端的 IPC 数据。

use serde::Serialize;

/// `/api/initial` 的 Tauri command 返回值。
#[derive(Debug, Serialize)]
pub struct InitialResp {
    pub initial_path: Option<String>,
    pub root_dir: String,
}

/// 目录项。
#[derive(Debug, Serialize)]
pub struct DirEntryResp {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

/// `/api/list` 的 Tauri command 返回值。
#[derive(Debug, Serialize)]
pub struct ListResp {
    pub dir: String,
    pub parent: Option<String>,
    pub entries: Vec<DirEntryResp>,
    pub truncated: bool,
}

/// 新建文件/目录返回值。
#[derive(Debug, Serialize)]
pub struct CreateResp {
    pub path: String,
}

/// 重命名返回值。
#[derive(Debug, Serialize)]
pub struct RenameResp {
    pub old_path: String,
    pub new_path: String,
}

/// 资源读取返回值。
#[derive(Debug, Serialize)]
pub struct AssetResp {
    pub mime: String,
    pub bytes: Vec<u8>,
}
