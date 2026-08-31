# SQLite 迁移计划

## 目标

将 JStudio 的结构化数据从分散的 JSON 文件迁移到单一 SQLite 数据库（`~/.jdata/studio/studio.db`），提升查询能力、数据一致性和写入原子性。**排除 Agent 配置**（继续使用独立 JSON 文件）。

---

## 当前状态分析

| 数据 | 当前存储 | 格式 | 读写模式 |
|------|----------|------|----------|
| 文档元数据 | `index.json` | `DocumentMeta[]` | 全量读写，500ms 防抖 |
| 文件夹树 | `folders.json` | `FolderMeta[]` | 全量读写，300ms 防抖 |
| 应用设置 | `settings.json` | 扁平 JSON 对象 | 部分字段 merge 写入 |
| 文档内容 | `documents/{id}/document.json` | 完整 Document JSON | 单文档读写，500ms 防抖 |
| 二进制资源 | `documents/{id}/assets/` | 文件 | 单文件读写 |
| Agent 配置 | `~/.jdata/agent/data/agent_config.json` | JSON | **不迁移** |

**已有依赖**：`rusqlite = { version = "0.31", features = ["bundled"] }` 已在 `Cargo.toml` 中（被 `commands/link.rs` 的 Chrome cookie 解密使用）。

---

## 迁移范围

### 迁移到 SQLite

| 数据 | 新表 | 替代的旧文件 |
|------|------|-------------|
| 文档元数据 | `documents` | `index.json` |
| 文件夹树 | `folders` | `folders.json` |
| 应用设置（标量） | `settings` (KV) | `settings.json` 的标量字段 |
| 终端模板 | `settings` (KV, key=`terminalTemplates`) | settings.json 中的数组 |
| 终端最近目录 | `settings` (KV, key=`terminalRecentDirs`) | settings.json 中的数组 |
| 键盘快捷键 | `settings` (KV, key=`keyboardShortcuts`) | settings.json 中的对象 |
| 全局快捷键 | `settings` (KV, key=`globalShortcuts`) | settings.json 中的数组 |

### 保留为文件（不迁移）

| 数据 | 原因 |
|------|------|
| `documents/{id}/document.json` | 大 JSON blob，按文档独立加载，SQLite 存储无优势；保留文件方便导出/备份 |
| `documents/{id}/assets/*` | 二进制资源（图片、附件），文件系统天然适合 |
| Agent 配置 | 用户明确排除 |

---

## 表结构设计

```sql
-- 文档元数据（替代 index.json）
CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    emoji       TEXT NOT NULL DEFAULT '',
    folder_id   TEXT,                          -- NULL = 根级
    is_favorite INTEGER NOT NULL DEFAULT 0,    -- 0/1
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);

-- 文件夹树（替代 folders.json）
CREATE TABLE IF NOT EXISTS folders (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    parent_id  TEXT,                           -- NULL = 顶层
    sort_order INTEGER NOT NULL DEFAULT 0,
    collapsed  INTEGER NOT NULL DEFAULT 0      -- 0/1
);

-- 应用设置（替代 settings.json 的所有字段）
-- value 列存储 JSON 编码后的值，保持与现有 partial-merge 语义一致
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL                        -- JSON-encoded: '"dark"', '14', '["a","b"]', '{"x":1}'
);
```

**设计决策**：

1. **文档元数据用独立表**而非 KV：这是侧边栏的核心数据，需要按 `folder_id` 分组、按 `updated_at` 排序，独立表 + 索引可支持未来 SQL 查询优化。

2. **文件夹用独立表**：有 `parent_id` 层级关系和 `sort_order` 排序，关系型存储天然适合。

3. **设置用 KV 表而非拆分多表**：前端始终以"完整对象"读写设置（`saveSettings({ theme: 'dark' })` 做 partial merge），KV 表的 `INSERT OR REPLACE` 天然等价于 shallow merge。终端模板、快捷键等虽然内部是数组/对象，但前端始终整体读写，拆分独立表不会带来查询优势，反而增加 Rust 侧的组装/拆解复杂度。

---

## 架构设计

### 核心原则：Tauri 命令接口不变，只换 Rust 内部实现

前端的 `storage` 对象（`lib/storage.ts`）方法签名 **零改动**。迁移完全在 Rust 侧完成。

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React/Zustand)                                   │
│  storage.loadIndex()  storage.saveSettings({...})  ...      │
│  ↓ invoke()                                                 │
├─────────────────────────────────────────────────────────────┤
│  Tauri Commands (接口不变)                                   │
│  read_index / write_index / read_settings / write_settings  │
│  read_folders / write_folders / ...                         │
├─────────────────────────────────────────────────────────────┤
│  Rust DB Layer (新增)                                        │
│  db.rs: 全局 Mutex<Connection> + 初始化 + 迁移              │
│  ↓ rusqlite                                                  │
├─────────────────────────────────────────────────────────────┤
│  SQLite: ~/.jdata/studio/studio.db                          │
│  documents / folders / settings                             │
└─────────────────────────────────────────────────────────────┘

  文件系统 (保留):
  documents/{id}/document.json   ← 文档内容
  documents/{id}/assets/*        ← 二进制资源
```

### 新增文件：`src-tauri/src/db.rs`

```rust
use rusqlite::Connection;
use std::sync::{LazyLock, Mutex};

/// 全局数据库连接（与 PREVIEW_CACHE 同模式）。
static DB: LazyLock<Mutex<Connection>> = LazyLock::new(|| {
    // 1. 确定 db 路径: ~/.jdata/studio/studio.db
    // 2. open connection
    // 3. PRAGMA journal_mode=WAL  (提升并发读性能)
    // 4. 执行建表 DDL (CREATE TABLE IF NOT EXISTS ...)
    // 5. 返回 connection
    Mutex::new(conn)
});

/// 获取全局连接的 lock guard。
pub fn db() -> Result<std::sync::MutexGuard<'static, Connection>, String> { ... }

/// 初始化数据库 + 一次性 JSON 迁移。
/// 在 ensure_studio_dir 中调用。
pub fn init_db() -> Result<(), String> {
    // 1. 确保表存在
    // 2. 检查旧 JSON 文件是否存在 (index.json / folders.json / settings.json)
    // 3. 若存在 → 读取并导入 → 重命名为 .bak
}
```

### 改动文件：`src-tauri/src/commands/storage.rs`

所有被迁移的命令，内部实现从文件 I/O 改为 SQL 查询：

| 命令 | 当前实现 | 新实现 |
|------|---------|--------|
| `ensure_studio_dir` | 创建目录 + 种子 index.json | 创建目录 + 调用 `db::init_db()` |
| `read_index` | 读 index.json → parse JSON | `SELECT * FROM documents` → 组装 JSON 数组 |
| `write_index` | 序列化 → 覆写 index.json | 事务：`DELETE FROM documents` + 批量 `INSERT` |
| `read_folders` | 读 folders.json → parse JSON | `SELECT * FROM folders ORDER BY sort_order` → 组装 JSON 数组 |
| `write_folders` | 序列化 → 覆写 folders.json | 事务：`DELETE FROM folders` + 批量 `INSERT` |
| `read_settings` | 读 settings.json → parse JSON | `SELECT key, value FROM settings` → 组装 JSON 对象 |
| `write_settings` | 读旧 → shallow merge → 覆写 | 遍历 partial 对象的每个 key → `INSERT OR REPLACE` |

**不变的命令**（继续用文件 I/O）：
- `read_document` / `write_document` / `delete_document`
- `save_doc_asset` / `delete_doc_asset` / `list_doc_assets`
- `read_agent_config` / `write_agent_config`
- `read_file_bytes` / `list_markdown_files` / 等工具命令

### 改动文件：`src-tauri/src/lib.rs`

```rust
mod db;  // 新增
// generate_handler! 列表不变（命令签名不变）
```

---

## 一次性数据迁移

在 `init_db()` 中自动执行（应用启动时）：

```
init_db():
    1. 创建/打开 studio.db
    2. PRAGMA journal_mode = WAL
    3. 执行建表 DDL (IF NOT EXISTS)
    4. 迁移检查：
       a. 若 index.json 存在 且 documents 表为空：
          - 读取 JSON 数组
          - 逐条 INSERT INTO documents
          - 重命名 index.json → index.json.bak
       b. 若 folders.json 存在 且 folders 表为空：
          - 读取 JSON 数组
          - 逐条 INSERT INTO folders
          - 重命名 folders.json → folders.json.bak
       c. 若 settings.json 存在 且 settings 表为空：
          - 读取 JSON 对象
          - 逐 key INSERT INTO settings
          - 重命名 settings.json → settings.json.bak
    5. 完成
```

**安全措施**：
- 迁移在单个事务中执行，失败则回滚
- 旧文件重命名为 `.bak` 而非删除，用户可手动恢复
- 迁移只在表为空时执行（幂等），避免重复导入

---

## 前端改动

**零改动。** `lib/storage.ts` 的 `storage` 对象方法签名完全不变。Store 层（`uiSlice.ts`、`documentsSlice.ts`、`foldersSlice.ts`、`terminalSlice.ts`）完全不变。

---

## 实施步骤

### Step 1: 新建 `src-tauri/src/db.rs`
- 全局 `Mutex<Connection>` 管理
- `init_db()` — 建表 + WAL + 迁移
- 辅助函数：`db()` 获取连接 guard

### Step 2: 改写 `commands/storage.rs` 中的 7 个命令
- `ensure_studio_dir` — 加入 `db::init_db()` 调用
- `read_index` / `write_index` — 改为 SQL
- `read_folders` / `write_folders` — 改为 SQL
- `read_settings` / `write_settings` — 改为 SQL

### Step 3: 注册 `db` 模块
- `src-tauri/src/lib.rs` 添加 `mod db;`
- `commands/mod.rs` 不变

### Step 4: 编译验证
- `cargo build` 确认 Rust 编译通过
- `npm run tauri dev` 手动测试

### Step 5: 功能测试清单
- [ ] 新用户首次启动：数据库创建，空表，无旧文件
- [ ] 老用户首次启动（有旧 JSON）：迁移成功，数据完整
- [ ] 文档 CRUD：新建、编辑、删除、重命名、收藏
- [ ] 文件夹 CRUD：新建、重命名、删除、折叠/展开
- [ ] 文档移动到文件夹
- [ ] 设置修改：主题、字体、字号、终端配置等
- [ ] 终端模板增删改
- [ ] 终端最近目录记录
- [ ] 键盘快捷键自定义
- [ ] 全局快捷键配置
- [ ] Agent 配置读写（不受影响）

---

## 风险与回退

| 风险 | 缓解 |
|------|------|
| 迁移后数据丢失 | 旧文件保留为 `.bak`，可手动恢复 |
| SQLite 锁竞争 | WAL 模式 + 单 Mutex 序列化所有访问 |
| 表结构与前端类型不匹配 | Rust 侧手动组装 camelCase JSON，与现有 serde 行为一致 |
| rusqlite 编译问题 | 依赖已在项目中，link.rs 已验证可用 |
