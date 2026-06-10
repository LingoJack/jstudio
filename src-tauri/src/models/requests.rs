//! 请求结构体 — 从前端接收的 IPC 参数。

use serde::Deserialize;

/// 保存文件请求。
#[derive(Debug, Deserialize)]
pub struct SaveReq {
    pub path: String,
    pub source: String,
}

/// 新建文件/目录请求。
#[derive(Debug, Deserialize)]
pub struct CreateReq {
    pub dir: String,
    pub name: String,
}

/// 路径操作请求。
#[derive(Debug, Deserialize)]
pub struct PathReq {
    pub path: String,
}

/// 重命名请求。
#[derive(Debug, Deserialize)]
pub struct RenameReq {
    pub path: String,
    pub new_name: String,
}
