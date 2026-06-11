//! JStudio 本地优先 workspace 服务。

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

use crate::error::{ReaderError, ReaderResult};
use crate::models::studio::{
    Backlink, BlockNode, GraphEdge, GraphNode, KnowledgeGraph, PageDoc, PageSummary, PluginManifest,
    SyncStatus, WorkspaceMeta,
};

const STUDIO_DIR: &str = ".jstudio";
const PAGES_DIR: &str = "pages";
const WORKSPACE_FILE: &str = "workspace.json";
const GRAPH_FILE: &str = "graph.json";

/// 打开或初始化 workspace。
pub fn open_workspace(path: Option<String>) -> ReaderResult<WorkspaceMeta> {
    let root = match path {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => default_workspace_dir()?,
    };
    init_workspace(&root)
}

/// 列出页面摘要。
pub fn list_pages(workspace_path: &str) -> ReaderResult<Vec<PageSummary>> {
    let root = PathBuf::from(workspace_path);
    ensure_workspace_dirs(&root)?;
    let mut pages = Vec::new();
    for entry in fs::read_dir(root.join(PAGES_DIR))? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let page = read_page_from_path(&path)?;
        pages.push(PageSummary {
            id: page.id,
            title: page.title,
            icon: page.icon,
            parent_id: page.parent_id,
            created_at: page.created_at,
            updated_at: page.updated_at,
        });
    }
    pages.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(pages)
}

/// 创建页面。
pub fn create_page(
    workspace_path: &str,
    title: Option<String>,
    parent_id: Option<String>,
) -> ReaderResult<PageDoc> {
    let root = PathBuf::from(workspace_path);
    ensure_workspace_dirs(&root)?;
    let now = now_millis();
    let id = new_id("page");
    let page = PageDoc {
        id,
        title: title.unwrap_or_else(|| "未命名页面".to_string()),
        icon: Some("📝".to_string()),
        parent_id,
        created_at: now,
        updated_at: now,
        blocks: vec![BlockNode {
            id: new_id("block"),
            block_type: "paragraph".to_string(),
            props: json!({ "text": "输入 / 唤出块菜单，或使用 [[页面名]] 创建双向链接。" }),
            children: Vec::new(),
        }],
    };
    write_page(&root, &page)?;
    rebuild_graph(workspace_path)?;
    Ok(page)
}

/// 读取页面。
pub fn get_page(workspace_path: &str, page_id: &str) -> ReaderResult<PageDoc> {
    let root = PathBuf::from(workspace_path);
    read_page_from_path(&page_path(&root, page_id))
}

/// 保存页面。
pub fn save_page(workspace_path: &str, mut page: PageDoc) -> ReaderResult<PageDoc> {
    let root = PathBuf::from(workspace_path);
    ensure_workspace_dirs(&root)?;
    page.updated_at = now_millis();
    write_page(&root, &page)?;
    update_workspace_time(&root)?;
    rebuild_graph(workspace_path)?;
    Ok(page)
}

/// 删除页面。
pub fn delete_page(workspace_path: &str, page_id: &str) -> ReaderResult<Vec<PageSummary>> {
    let root = PathBuf::from(workspace_path);
    let path = page_path(&root, page_id);
    if path.exists() {
        fs::remove_file(path)?;
    }
    rebuild_graph(workspace_path)?;
    list_pages(workspace_path)
}

/// 重建知识图谱。
pub fn rebuild_graph(workspace_path: &str) -> ReaderResult<KnowledgeGraph> {
    let root = PathBuf::from(workspace_path);
    let pages = read_all_pages(&root)?;
    let mut title_to_id = HashMap::new();
    for page in &pages {
        title_to_id.insert(page.title.clone(), page.id.clone());
    }

    let nodes = pages
        .iter()
        .map(|page| GraphNode {
            id: page.id.clone(),
            title: page.title.clone(),
            icon: page.icon.clone(),
        })
        .collect::<Vec<_>>();

    let mut seen = HashSet::new();
    let mut edges = Vec::new();
    for page in &pages {
        let refs = collect_page_refs(page, &title_to_id);
        for target in refs {
            if target == page.id {
                continue;
            }
            let key = format!("{}->{target}", page.id);
            if seen.insert(key) {
                edges.push(GraphEdge {
                    source: page.id.clone(),
                    target,
                    label: "link".to_string(),
                });
            }
        }
    }

    let graph = KnowledgeGraph { nodes, edges };
    let graph_path = root.join(STUDIO_DIR).join(GRAPH_FILE);
    fs::write(graph_path, serde_json::to_string_pretty(&graph)?)?;
    Ok(graph)
}

/// 获取知识图谱。
pub fn get_graph(workspace_path: &str) -> ReaderResult<KnowledgeGraph> {
    let root = PathBuf::from(workspace_path);
    let path = root.join(STUDIO_DIR).join(GRAPH_FILE);
    if path.exists() {
        let source = fs::read_to_string(path)?;
        serde_json::from_str(&source).map_err(ReaderError::from)
    } else {
        rebuild_graph(workspace_path)
    }
}

/// 获取页面反链。
pub fn get_backlinks(workspace_path: &str, page_id: &str) -> ReaderResult<Vec<Backlink>> {
    let root = PathBuf::from(workspace_path);
    let pages = read_all_pages(&root)?;
    let title_to_id = pages
        .iter()
        .map(|page| (page.title.clone(), page.id.clone()))
        .collect::<HashMap<_, _>>();
    let mut backlinks = Vec::new();
    for page in pages {
        if page.id == page_id {
            continue;
        }
        collect_backlinks_from_blocks(&page, &page.blocks, page_id, &title_to_id, &mut backlinks);
    }
    Ok(backlinks)
}

/// 内置插件列表。
pub fn list_plugins() -> Vec<PluginManifest> {
    vec![
        PluginManifest {
            id: "word-count".to_string(),
            name: "字数统计".to_string(),
            description: "统计当前页面块数量、字符数和链接数量。".to_string(),
            enabled: true,
        },
        PluginManifest {
            id: "html-presentation".to_string(),
            name: "HTML Presentation".to_string(),
            description: "为 HTML 块提供演示文稿模板和沙箱预览。".to_string(),
            enabled: true,
        },
        PluginManifest {
            id: "folder-sync".to_string(),
            name: "文件夹同步兼容".to_string(),
            description: "通过 iCloud、OneDrive、Dropbox、Syncthing 等同步 workspace 文件夹。".to_string(),
            enabled: true,
        },
    ]
}

/// 获取同步状态。
pub fn get_sync_status(workspace_path: &str) -> ReaderResult<SyncStatus> {
    let root = PathBuf::from(workspace_path);
    ensure_workspace_dirs(&root)?;
    Ok(SyncStatus {
        strategy: "folder".to_string(),
        device_id: device_id(),
        last_snapshot_at: None,
        message: "当前采用本地文件夹同步兼容模式，可放入 iCloud/OneDrive/Dropbox/Syncthing。".to_string(),
    })
}

fn init_workspace(root: &Path) -> ReaderResult<WorkspaceMeta> {
    ensure_workspace_dirs(root)?;
    let meta_path = root.join(STUDIO_DIR).join(WORKSPACE_FILE);
    let now = now_millis();
    let mut meta = if meta_path.exists() {
        let source = fs::read_to_string(&meta_path)?;
        serde_json::from_str::<WorkspaceMeta>(&source)?
    } else {
        WorkspaceMeta {
            id: new_id("workspace"),
            name: root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("JStudio Workspace")
                .to_string(),
            path: root.display().to_string(),
            created_at: now,
            updated_at: now,
            pages: Vec::new(),
        }
    };
    meta.path = root.display().to_string();
    meta.pages = list_pages(&meta.path)?;
    if meta.pages.is_empty() {
        let welcome = create_page(&meta.path, Some("欢迎使用 JStudio".to_string()), None)?;
        meta.pages = vec![PageSummary {
            id: welcome.id,
            title: welcome.title,
            icon: welcome.icon,
            parent_id: welcome.parent_id,
            created_at: welcome.created_at,
            updated_at: welcome.updated_at,
        }];
    }
    fs::write(meta_path, serde_json::to_string_pretty(&meta)?)?;
    Ok(meta)
}

fn ensure_workspace_dirs(root: &Path) -> ReaderResult<()> {
    fs::create_dir_all(root.join(STUDIO_DIR).join("attachments"))?;
    fs::create_dir_all(root.join(STUDIO_DIR).join("plugins"))?;
    fs::create_dir_all(root.join(STUDIO_DIR).join("sync"))?;
    fs::create_dir_all(root.join(PAGES_DIR))?;
    Ok(())
}

fn default_workspace_dir() -> ReaderResult<PathBuf> {
    let base = std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
        .ok_or_else(|| ReaderError::InvalidPath("无法确定默认工作区路径".to_string()))?;
    Ok(base.join("JStudio Workspace"))
}

fn read_all_pages(root: &Path) -> ReaderResult<Vec<PageDoc>> {
    ensure_workspace_dirs(root)?;
    let mut pages = Vec::new();
    for summary in list_pages(&root.display().to_string())? {
        pages.push(get_page(&root.display().to_string(), &summary.id)?);
    }
    Ok(pages)
}

fn read_page_from_path(path: &Path) -> ReaderResult<PageDoc> {
    let source = fs::read_to_string(path)?;
    serde_json::from_str(&source).map_err(ReaderError::from)
}

fn write_page(root: &Path, page: &PageDoc) -> ReaderResult<()> {
    let path = page_path(root, &page.id);
    fs::write(path, serde_json::to_string_pretty(page)?)?;
    Ok(())
}

fn page_path(root: &Path, page_id: &str) -> PathBuf {
    root.join(PAGES_DIR).join(format!("{page_id}.json"))
}

fn update_workspace_time(root: &Path) -> ReaderResult<()> {
    let meta_path = root.join(STUDIO_DIR).join(WORKSPACE_FILE);
    if !meta_path.exists() {
        return Ok(());
    }
    let source = fs::read_to_string(&meta_path)?;
    let mut meta = serde_json::from_str::<WorkspaceMeta>(&source)?;
    meta.updated_at = now_millis();
    meta.pages = list_pages(&meta.path)?;
    fs::write(meta_path, serde_json::to_string_pretty(&meta)?)?;
    Ok(())
}

fn collect_page_refs(page: &PageDoc, title_to_id: &HashMap<String, String>) -> HashSet<String> {
    let mut refs = HashSet::new();
    collect_refs_from_blocks(&page.blocks, title_to_id, &mut refs);
    refs
}

fn collect_refs_from_blocks(
    blocks: &[BlockNode],
    title_to_id: &HashMap<String, String>,
    refs: &mut HashSet<String>,
) {
    for block in blocks {
        for text in prop_text_values(&block.props) {
            collect_refs_from_text(&text, title_to_id, refs);
        }
        collect_refs_from_blocks(&block.children, title_to_id, refs);
    }
}

fn collect_backlinks_from_blocks(
    page: &PageDoc,
    blocks: &[BlockNode],
    target_id: &str,
    title_to_id: &HashMap<String, String>,
    backlinks: &mut Vec<Backlink>,
) {
    for block in blocks {
        let texts = prop_text_values(&block.props);
        let mut refs = HashSet::new();
        for text in &texts {
            collect_refs_from_text(text, title_to_id, &mut refs);
        }
        if refs.contains(target_id) {
            backlinks.push(Backlink {
                page_id: page.id.clone(),
                title: page.title.clone(),
                block_id: block.id.clone(),
                excerpt: texts.first().cloned().unwrap_or_default(),
            });
        }
        collect_backlinks_from_blocks(page, &block.children, target_id, title_to_id, backlinks);
    }
}

fn prop_text_values(value: &Value) -> Vec<String> {
    let mut values = Vec::new();
    match value {
        Value::String(text) => values.push(text.clone()),
        Value::Array(items) => {
            for item in items {
                values.extend(prop_text_values(item));
            }
        }
        Value::Object(map) => {
            for item in map.values() {
                values.extend(prop_text_values(item));
            }
        }
        _ => {}
    }
    values
}

fn collect_refs_from_text(
    text: &str,
    title_to_id: &HashMap<String, String>,
    refs: &mut HashSet<String>,
) {
    let mut rest = text;
    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        if let Some(end) = after.find("]]") {
            let title = &after[..end];
            if let Some(id) = title_to_id.get(title) {
                refs.insert(id.clone());
            }
            rest = &after[end + 2..];
        } else {
            break;
        }
    }
    for token in text.split_whitespace() {
        if let Some(id) = token.strip_prefix("@page-") {
            refs.insert(format!("page-{id}"));
        }
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", now_millis())
}

fn device_id() -> String {
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "local-device".to_string());
    format!("{}-{}", hostname, std::env::consts::OS)
}
