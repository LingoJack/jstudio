//! JStudio workspace、页面与图谱数据模型。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 工作区元信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMeta {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub pages: Vec<PageSummary>,
}

/// 页面摘要，用于侧边栏页面树。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSummary {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub parent_id: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

/// 页面文档。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDoc {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub parent_id: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub blocks: Vec<BlockNode>,
}

/// 块节点。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockNode {
    pub id: String,
    #[serde(rename = "type")]
    pub block_type: String,
    pub props: Value,
    #[serde(default)]
    pub children: Vec<BlockNode>,
}

/// 图谱节点。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
}

/// 图谱边。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub label: String,
}

/// 知识图谱。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// 反向链接。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    pub page_id: String,
    pub title: String,
    pub block_id: String,
    pub excerpt: String,
}

/// 插件描述。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

/// 同步状态。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub strategy: String,
    pub device_id: String,
    pub last_snapshot_at: Option<u64>,
    pub message: String,
}
