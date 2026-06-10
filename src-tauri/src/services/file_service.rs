//! 业务逻辑层 — 文件读写、创建、删除、重命名等。

use std::path::Path;

use crate::error::{
    canonicalize_existing, display_path, ensure_file_size, ensure_regular_file, ReaderError,
    ReaderResult,
};
use crate::models::requests::CreateReq;
use crate::models::responses::{AssetResp, CreateResp, InitialResp, RenameResp};

/// 文件大小上限：8 MiB。
const MAX_FILE_SIZE: u64 = 8 * 1024 * 1024;
/// 资源大小上限：128 MiB。
const MAX_ASSET_SIZE: u64 = 128 * 1024 * 1024;
/// 目录条目数量上限。
const MAX_DIR_ENTRIES: usize = 2000;

/// 获取应用初始状态（启动参数路径 + 根目录）。
pub fn get_initial() -> ReaderResult<InitialResp> {
    let target = initial_target_path()?;
    let root = if target.is_dir() {
        target.clone()
    } else {
        target
            .parent()
            .map(std::path::PathBuf::from)
            .ok_or_else(|| ReaderError::InvalidPath("无法解析文件所在目录".to_string()))?
    };

    Ok(InitialResp {
        initial_path: target.is_file().then(|| display_path(&target)),
        root_dir: display_path(&root),
    })
}

/// 解析启动参数或使用当前目录作为初始路径。
fn initial_target_path() -> ReaderResult<std::path::PathBuf> {
    let arg = std::env::args_os()
        .nth(1)
        .map(std::path::PathBuf::from)
        .unwrap_or(std::env::current_dir()?);
    canonicalize_existing(&arg)
}

/// 读取并渲染单个文件。
pub fn read_file(path: &str) -> ReaderResult<crate::renderer::RenderedDoc> {
    let path = canonicalize_existing(path)?;
    ensure_regular_file(&path)?;
    ensure_file_size(&path, MAX_FILE_SIZE)?;
    crate::renderer::render_file(&path).map_err(ReaderError::Render)
}

/// 列出目录内容。
pub fn list_dir(dir: &str, show_hidden: bool) -> ReaderResult<crate::models::responses::ListResp> {
    use crate::models::responses::{DirEntryResp, ListResp};

    let dir = canonicalize_existing(dir)?;
    if !dir.is_dir() {
        return Err(ReaderError::InvalidPath("路径不是目录".to_string()));
    }

    let mut entries = Vec::with_capacity(128);
    for item in std::fs::read_dir(&dir)? {
        let item = item?;
        let path = item.path();
        let name = item.file_name().to_string_lossy().to_string();
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        let metadata = item.metadata()?;
        entries.push(DirEntryResp {
            name,
            path: display_path(&path),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
        if entries.len() >= MAX_DIR_ENTRIES {
            break;
        }
    }

    entries.sort_by(|left, right| match (left.is_dir, right.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        (true, true) | (false, false) => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
    });

    Ok(ListResp {
        parent: dir.parent().map(display_path),
        dir: display_path(&dir),
        truncated: entries.len() >= MAX_DIR_ENTRIES,
        entries,
    })
}

/// 保存文件内容。
pub fn save_file(path: &str, source: &str) -> ReaderResult<()> {
    let path = canonicalize_existing(path)?;
    ensure_regular_file(&path)?;
    std::fs::write(path, source)?;
    Ok(())
}

/// 创建类型：文件或目录。
#[derive(Debug, Clone, Copy)]
pub enum CreateKind {
    File,
    Directory,
}

/// 创建文件或目录。
pub fn create_path(req: &CreateReq, kind: CreateKind) -> ReaderResult<CreateResp> {
    let dir = canonicalize_existing(&req.dir)?;
    if !dir.is_dir() {
        return Err(ReaderError::InvalidPath("目标父路径不是目录".to_string()));
    }
    let name = validate_leaf_name(&req.name)?;
    let target = dir.join(name);
    if target.exists() {
        return Err(ReaderError::InvalidInput("目标已存在".to_string()));
    }
    match kind {
        CreateKind::File => {
            std::fs::File::create(&target)?;
        }
        CreateKind::Directory => {
            std::fs::create_dir(&target)?;
        }
    }
    let path = canonicalize_existing(target)?;
    Ok(CreateResp {
        path: display_path(&path),
    })
}

/// 删除文件或目录。
pub fn delete_path(path: &str) -> ReaderResult<()> {
    let path = canonicalize_existing(path)?;
    if path.is_dir() {
        std::fs::remove_dir_all(path)?;
    } else if path.is_file() {
        std::fs::remove_file(path)?;
    } else {
        return Err(ReaderError::InvalidPath("路径不是文件或目录".to_string()));
    }
    Ok(())
}

/// 重命名文件或目录。
pub fn rename_path(path: &str, new_name: &str) -> ReaderResult<RenameResp> {
    let source = canonicalize_existing(path)?;
    let parent = source
        .parent()
        .ok_or_else(|| ReaderError::InvalidPath("无法解析父目录".to_string()))?;
    let name = validate_leaf_name(new_name)?;
    let target = parent.join(name);
    if target.exists() {
        return Err(ReaderError::InvalidInput("目标已存在".to_string()));
    }
    std::fs::rename(&source, &target)?;
    let target = canonicalize_existing(target)?;
    Ok(RenameResp {
        old_path: display_path(&source),
        new_path: display_path(&target),
    })
}

/// 在系统文件管理器中显示路径。
pub fn show_in_folder(path: &str) -> ReaderResult<()> {
    let path = canonicalize_existing(path)?;
    let mut command = show_in_folder_command(&path)?;
    let status = command.status()?;
    if status.success() {
        Ok(())
    } else {
        Err(ReaderError::InvalidInput(format!(
            "打开文件管理器失败，退出状态：{status}"
        )))
    }
}

/// 打开并切换根目录。
pub fn open_dir(path: &str) -> ReaderResult<CreateResp> {
    let path = canonicalize_existing(path)?;
    if !path.is_dir() {
        return Err(ReaderError::InvalidPath("路径不是目录".to_string()));
    }
    Ok(CreateResp {
        path: display_path(&path),
    })
}

/// 读取本地资源（图片等）。
pub fn read_asset(path: &str) -> ReaderResult<AssetResp> {
    let path = canonicalize_existing(path)?;
    ensure_regular_file(&path)?;
    ensure_file_size(&path, MAX_ASSET_SIZE)?;
    let mime = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();
    let bytes = std::fs::read(path)?;
    Ok(AssetResp { mime, bytes })
}

/// 校验文件/目录名合法性。
fn validate_leaf_name(name: &str) -> ReaderResult<&str> {
    let name = name.trim();
    if name.is_empty() || name.contains('/') || name.contains('\\') {
        return Err(ReaderError::InvalidInput(
            "名称不能为空，且不能包含路径分隔符".to_string(),
        ));
    }
    Ok(name)
}

#[cfg(target_os = "macos")]
fn show_in_folder_command(path: &Path) -> ReaderResult<std::process::Command> {
    let mut command = std::process::Command::new("open");
    if path.is_dir() {
        command.arg(path);
    } else {
        command.arg("-R").arg(path);
    }
    Ok(command)
}

#[cfg(target_os = "windows")]
fn show_in_folder_command(path: &Path) -> ReaderResult<std::process::Command> {
    let mut command = std::process::Command::new("explorer");
    if path.is_dir() {
        command.arg(path);
    } else {
        command.arg(format!("/select,{}", path.display()));
    }
    Ok(command)
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn show_in_folder_command(path: &Path) -> ReaderResult<std::process::Command> {
    let dir = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()
            .map(std::path::PathBuf::from)
            .ok_or_else(|| ReaderError::InvalidPath("无法解析父目录".to_string()))?
    };
    let mut command = std::process::Command::new("xdg-open");
    command.arg(dir);
    Ok(command)
}
