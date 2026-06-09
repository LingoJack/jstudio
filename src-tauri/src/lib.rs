use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt;
use std::path::{Path, PathBuf};

mod markdown;
mod renderer;

const MAX_FILE_SIZE: u64 = 8 * 1024 * 1024;
const MAX_ASSET_SIZE: u64 = 128 * 1024 * 1024;
const MAX_DIR_ENTRIES: usize = 2000;

/// Reader 后端错误。
#[derive(Debug)]
enum ReaderError {
    Io(std::io::Error),
    InvalidPath(String),
    InvalidInput(String),
    Render(String),
}

impl ReaderError {
    fn message(&self) -> String {
        self.to_string()
    }
}

impl fmt::Display for ReaderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(err) => write!(f, "{err}"),
            Self::InvalidPath(message) | Self::InvalidInput(message) | Self::Render(message) => {
                write!(f, "{message}")
            }
        }
    }
}

impl Error for ReaderError {}

impl From<std::io::Error> for ReaderError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<String> for ReaderError {
    fn from(value: String) -> Self {
        Self::Render(value)
    }
}

type ReaderResult<T> = Result<T, ReaderError>;

/// `/api/initial` 的 Tauri command 返回值。
#[derive(Debug, Serialize)]
struct InitialResp {
    initial_path: Option<String>,
    root_dir: String,
}

/// 目录项。
#[derive(Debug, Serialize)]
struct DirEntryResp {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

/// `/api/list` 的 Tauri command 返回值。
#[derive(Debug, Serialize)]
struct ListResp {
    dir: String,
    parent: Option<String>,
    entries: Vec<DirEntryResp>,
    truncated: bool,
}

/// 保存文件请求。
#[derive(Debug, Deserialize)]
struct SaveReq {
    path: String,
    source: String,
}

/// 新建文件/目录请求。
#[derive(Debug, Deserialize)]
struct CreateReq {
    dir: String,
    name: String,
}

/// 新建文件/目录返回值。
#[derive(Debug, Serialize)]
struct CreateResp {
    path: String,
}

/// 资源读取返回值。
#[derive(Debug, Serialize)]
struct AssetResp {
    mime: String,
    bytes: Vec<u8>,
}

/// Reader 初始状态。
#[tauri::command]
fn get_initial() -> Result<InitialResp, String> {
    get_initial_inner().map_err(|err| err.message())
}

/// 渲染单个文件。
#[tauri::command]
fn read_file(path: String) -> Result<renderer::RenderedDoc, String> {
    read_file_inner(&path).map_err(|err| err.message())
}

/// 列出目录。
#[tauri::command]
fn list_dir(dir: String, hidden: Option<bool>) -> Result<ListResp, String> {
    list_dir_inner(&dir, hidden.unwrap_or(false)).map_err(|err| err.message())
}

/// 解析 Markdown source。
#[tauri::command]
fn parse_markdown(source: String) -> Result<serde_json::Value, String> {
    let doc = markdown::parser::parse_markdown(&source, 120);
    serde_json::to_value(doc).map_err(|err| format!("Markdown IR 序列化失败：{err}"))
}

/// 保存文件。
#[tauri::command]
fn save_file(req: SaveReq) -> Result<(), String> {
    save_file_inner(&req.path, &req.source).map_err(|err| err.message())
}

/// 新建文件。
#[tauri::command]
fn create_file(req: CreateReq) -> Result<CreateResp, String> {
    create_path_inner(&req.dir, &req.name, CreateKind::File).map_err(|err| err.message())
}

/// 新建目录。
#[tauri::command]
fn create_dir(req: CreateReq) -> Result<CreateResp, String> {
    create_path_inner(&req.dir, &req.name, CreateKind::Directory).map_err(|err| err.message())
}

/// 读取本地图片/资源。
#[tauri::command]
fn read_asset(path: String) -> Result<AssetResp, String> {
    read_asset_inner(&path).map_err(|err| err.message())
}

/// 关闭当前窗口。
#[tauri::command]
fn quit_reader(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|err| err.to_string())
}

fn get_initial_inner() -> ReaderResult<InitialResp> {
    let target = initial_target_path()?;
    let root = if target.is_dir() {
        target.clone()
    } else {
        target
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| ReaderError::InvalidPath("无法解析文件所在目录".to_string()))?
    };

    Ok(InitialResp {
        initial_path: target.is_file().then(|| display_path(&target)),
        root_dir: display_path(&root),
    })
}

fn initial_target_path() -> ReaderResult<PathBuf> {
    let arg = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or(std::env::current_dir()?);
    canonicalize_existing(&arg)
}

fn read_file_inner(path: &str) -> ReaderResult<renderer::RenderedDoc> {
    let path = canonicalize_existing(path)?;
    ensure_regular_file(&path)?;
    ensure_file_size(&path, MAX_FILE_SIZE)?;
    renderer::render_file(&path).map_err(ReaderError::Render)
}

fn list_dir_inner(dir: &str, show_hidden: bool) -> ReaderResult<ListResp> {
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

fn save_file_inner(path: &str, source: &str) -> ReaderResult<()> {
    let path = canonicalize_existing(path)?;
    ensure_regular_file(&path)?;
    std::fs::write(path, source)?;
    Ok(())
}

#[derive(Debug, Clone, Copy)]
enum CreateKind {
    File,
    Directory,
}

fn create_path_inner(dir: &str, name: &str, kind: CreateKind) -> ReaderResult<CreateResp> {
    let dir = canonicalize_existing(dir)?;
    if !dir.is_dir() {
        return Err(ReaderError::InvalidPath("目标父路径不是目录".to_string()));
    }
    let name = name.trim();
    if name.is_empty() || name.contains('/') || name.contains('\\') {
        return Err(ReaderError::InvalidInput(
            "名称不能为空，且不能包含路径分隔符".to_string(),
        ));
    }
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

fn read_asset_inner(path: &str) -> ReaderResult<AssetResp> {
    let path = canonicalize_existing(path)?;
    ensure_regular_file(&path)?;
    ensure_file_size(&path, MAX_ASSET_SIZE)?;
    let mime = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();
    let bytes = std::fs::read(path)?;
    Ok(AssetResp { mime, bytes })
}

fn canonicalize_existing(path: impl AsRef<Path>) -> ReaderResult<PathBuf> {
    let path = path.as_ref();
    path.canonicalize().map_err(|err| {
        ReaderError::InvalidPath(format!("路径不存在或不可访问：{} ({err})", path.display()))
    })
}

fn ensure_regular_file(path: &Path) -> ReaderResult<()> {
    if path.is_file() {
        Ok(())
    } else {
        Err(ReaderError::InvalidPath("路径不是普通文件".to_string()))
    }
}

fn ensure_file_size(path: &Path, max: u64) -> ReaderResult<()> {
    let size = std::fs::metadata(path)?.len();
    if size <= max {
        Ok(())
    } else {
        Err(ReaderError::InvalidInput(format!(
            "文件过大：{size} 字节，超过上限 {max} 字节"
        )))
    }
}

fn display_path(path: &Path) -> String {
    path.display().to_string()
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_initial,
            read_file,
            list_dir,
            parse_markdown,
            save_file,
            create_file,
            create_dir,
            read_asset,
            quit_reader,
        ])
        .run(tauri::generate_context!())
        .expect("error while running jstudio reader");
}
