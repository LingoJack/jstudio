//! JStudio 后端统一错误类型。

use std::path::{Path, PathBuf};

/// Reader 后端错误。
#[derive(Debug, thiserror::Error)]
pub enum ReaderError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    InvalidPath(String),
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    Render(String),
}

/// 内部使用的 Result 别名。
pub type ReaderResult<T> = Result<T, ReaderError>;

/// 将路径规范化为绝对路径，路径不存在时报错。
pub fn canonicalize_existing(path: impl AsRef<Path>) -> ReaderResult<PathBuf> {
    let path = path.as_ref();
    path.canonicalize().map_err(|err| {
        ReaderError::InvalidPath(format!("路径不存在或不可访问：{} ({err})", path.display()))
    })
}

/// 校验路径指向普通文件。
pub fn ensure_regular_file(path: &Path) -> ReaderResult<()> {
    if path.is_file() {
        Ok(())
    } else {
        Err(ReaderError::InvalidPath("路径不是普通文件".to_string()))
    }
}

/// 校验文件大小不超过 `max` 字节。
pub fn ensure_file_size(path: &Path, max: u64) -> ReaderResult<()> {
    let size = std::fs::metadata(path)?.len();
    if size <= max {
        Ok(())
    } else {
        Err(ReaderError::InvalidInput(format!(
            "文件过大：{size} 字节，超过上限 {max} 字节"
        )))
    }
}

/// 将 `Path` 转换为显示用字符串。
pub fn display_path(path: &Path) -> String {
    path.display().to_string()
}
