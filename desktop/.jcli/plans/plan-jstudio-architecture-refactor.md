# JStudio 架构重构计划（v2 — 基于当前代码状态）

> 目标：将 jstudio 从「localStorage 单体前端 + Tauri 空壳」重构为「Tauri 原生文件系统存储 + 轻量状态管理 + 组件按职责拆分」的可维护架构。

---

## 一、当前代码状态（更新后）

自初版计划以来，代码已有部分改进：

| 变化 | 说明 |
|------|------|
| `BlockItem.tsx` | 2142 行 → **1409 行**（已将 web-embed/attachment 抽出） |
| `WebEmbedBlock.tsx` | **新增**（204 行），`web-embed` 类型，已使用 Tauri `WebviewWindow` |
| `AttachmentBlock.tsx` | **新增**（324 行），`attachment` 类型，支持文件上传/预览/下载 |
| `CodeBlock.tsx` | 已含 HTML 渲染预览功能（Eye 按钮切换） |
| `html-render` 类型 | **已移除** |
| `web-embed`/`attachment` 类型 | **新增** |
| Rust 后端 | 仍是空壳（dialog/opener 插件，无 `#[tauri::command]`） |

**但核心架构问题依然存在**：

### 1. 数据存储（最严重 — 未变）
- **全量序列化写盘**：`App.tsx` 每次按键都 `JSON.stringify(所有文档)` → `localStorage.setItem('omninote_docs', ...)`，同步阻塞主线程
- **容量瓶颈**：localStorage 上限 5-10MB，base64 图片膨胀 33%，几篇带图文档即可撑爆
- **Tauri 空壳**：Rust 后端无任何存储命令，完全没用上 Tauri 文件系统能力
- `LocalFolder.tsx` 另有独立的 `localStorage.setItem('omninote_assets', ...)`，与文档系统割裂

### 2. 状态管理（未变）
- **上帝组件**：`App.tsx`（334 行）持有全部状态 + 全部 CRUD 逻辑，5 处 `documents.map → setDocuments → localStorage.setItem` 三段式
- **Prop drilling 3-4 层深**：`App → BlockEditor → BlockItem`
- `handleInsertAssetAsBlock(asset: any)` 仍有 `any` 类型漏洞

### 3. 组件拆分（部分改善）
- `BlockItem` 从 2142 → 1409 行，但仍是巨型文件
- 剩余 9 种 block 类型（text/heading-1/2/3/callout/image/canvas/table/toggle/whiteboard/code）+ 键盘导航 + Markdown 格式化 + canvas 绘制 + slash 菜单仍全部塞在一个文件

---

## 二、重构后目标架构

### 目录结构（新增/变更部分）

```
src/
├── lib/
│   └── storage.ts                    # [新] 存储抽象层，封装所有 Tauri invoke 调用
├── store/
│   └── useStore.ts                   # [新] Zustand store，替代 App.tsx 中的上帝状态
├── hooks/
│   └── useAutoSave.ts                # [新] 文档防抖自动保存
├── components/
│   ├── blocks/                       # [新] BlockItem 进一步拆分
│   │   ├── BlockRouter.tsx           #      根据 block.type 分发到具体组件
│   │   ├── TextBlock.tsx             #      text 类型
│   │   ├── HeadingBlock.tsx          #      heading-1/2/3 合并（接收 level prop）
│   │   ├── CalloutBlock.tsx          #      callout 类型
│   │   ├── ImageBlock.tsx            #      image 类型
│   │   ├── TableBlock.tsx            #      table 类型（含行列增删逻辑）
│   │   ├── ToggleBlock.tsx           #      toggle 类型
│   │   ├── CanvasBlock.tsx           #      canvas 类型（含手绘逻辑）
│   │   ├── WhiteboardBlock.tsx       #      whiteboard 类型（tldraw）
│   │   ├── CodeBlockWrapper.tsx      #      code 类型（包装现有 CodeBlock）
│   │   ├── ContentEditableBlock.tsx  #      从 BlockItem 抽出的通用可编辑层（行 12-60）
│   │   └── shared.ts                 #      SLASH_COMMANDS、getDefaultProperties、Wiki 渲染、Markdown 格式化
│   ├── BlockItem.tsx                 # [改→删] 最终拆解为 BlockRouter + 上述子组件
│   ├── BlockEditor.tsx               # [改] 从 store 读数据，不再接收 documents prop
│   ├── DocumentList.tsx              # [改] 从 store 读数据
│   ├── LocalFolder.tsx               # [改] assets 改用 storage 层
│   ├── WebEmbedBlock.tsx             # [不变]
│   ├── AttachmentBlock.tsx           # [不变]
│   └── ArticleOutline.tsx            # [改] 从 store 读数据
├── App.tsx                           # [改] 瘦身为纯布局壳
└── types.ts                          # [微调] 新增 DocumentMeta 接口

src-tauri/
├── src/
│   ├── main.rs                       # [不变]
│   ├── lib.rs                        # [改] 注册 Tauri commands
│   └── commands/
│       ├── mod.rs                    # [新]
│       └── storage.rs                # [新] 文档/资产/设置的读写删除命令
├── Cargo.toml                        # [改] 新增 dirs crate
└── capabilities/
    └── default.json                  # [改] 添加 webview 权限（WebEmbedBlock 需要）
```

### 数据存储布局

```
~/.jdata/studio/
├── documents/
│   ├── {doc-id}.json                 # 单篇文档完整数据（blocks 全量）
│   └── ...
├── assets/
│   ├── {asset-id}.{ext}              # 二进制文件直接落盘（图片/PDF 等）
│   └── ...
├── settings.json                     # 用户偏好（主题等）
└── index.json                        # 文档元数据列表（id/title/emoji/createdAt/updatedAt/isFavorite）
                                      #   用于侧边栏快速渲染，无需加载所有文档正文
```

---

## 三、分步实施计划

### 阶段 1：Tauri 存储后端（Rust 侧）

**目标**：让 Tauri 具备原生文件系统读写能力，彻底替代 localStorage。

#### 1.1 `src-tauri/Cargo.toml` — 新增依赖

```toml
[dependencies]
# 现有保留...
dirs = "6"                # 跨平台获取 home 目录
```

#### 1.2 `src-tauri/src/commands/storage.rs` — 核心存储命令

实现以下 `#[tauri::command]`：

| 命令 | 签名 | 职责 |
|------|------|------|
| `ensure_studio_dir` | `() -> Result<String, String>` | 创建 `~/.jdata/studio/{documents,assets}` 目录，返回根路径 |
| `read_index` | `() -> Result<Value, String>` | 读取 `index.json`，返回所有文档元数据列表 |
| `write_index` | `(entries: Value) -> Result<(), String>` | 全量写入 `index.json` |
| `read_document` | `(doc_id: String) -> Result<Value, String>` | 读取 `documents/{doc_id}.json` |
| `write_document` | `(doc_id: String, doc: Value) -> Result<(), String>` | 写入单篇文档 JSON（pretty 格式） |
| `delete_document` | `(doc_id: String) -> Result<(), String>` | 删除文档文件 |
| `save_asset` | `(asset_id: String, data: Vec<u8>, ext: String) -> Result<String, String>` | 二进制落盘到 `assets/`，返回文件名 |
| `delete_asset` | `(file_name: String) -> Result<(), String>` | 删除资产文件 |
| `read_asset_base64` | `(file_name: String) -> Result<String, String>` | 读取资产为 base64（前端 img src 需要） |
| `list_assets` | `() -> Result<Vec<Value>, String>` | 列出 assets 目录中的所有文件信息 |
| `read_settings` | `() -> Result<Value, String>` | 读取 `settings.json` |
| `write_settings` | `(settings: Value) -> Result<(), String>` | 写入 `settings.json` |

错误处理统一返回 `Result<T, String>`，前端通过 `invoke().catch()` 捕获。

#### 1.3 `src-tauri/src/lib.rs` — 注册命令

```rust
mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::storage::ensure_studio_dir,
            commands::storage::read_index,
            commands::storage::write_index,
            commands::storage::read_document,
            commands::storage::write_document,
            commands::storage::delete_document,
            commands::storage::save_asset,
            commands::storage::delete_asset,
            commands::storage::read_asset_base64,
            commands::storage::list_assets,
            commands::storage::read_settings,
            commands::storage::write_settings,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jstudio");
}
```

---

### 阶段 2：前端存储抽象层

**目标**：封装所有 Tauri invoke 调用，提供干净的 async API，组件不直接碰 `invoke`。

#### 2.1 `src/lib/storage.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { Document } from '../types';

// DocumentMeta = Document 的轻量版本（不含 blocks），用于侧边栏渲染
export interface DocumentMeta {
  id: string;
  title: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
}

export interface AppSettings {
  theme: 'dark' | 'light';
}

export interface AssetInfo {
  fileName: string;
  name: string;
  type: string;
  size: string;
  createdAt: string;
}

export const storage = {
  init: () => invoke<string>('ensure_studio_dir'),

  loadIndex: () => invoke<DocumentMeta[]>('read_index'),
  saveIndex: (entries: DocumentMeta[]) => invoke('write_index', { entries }),

  loadDocument: (docId: string) => invoke<Document>('read_document', { docId }),
  saveDocument: (doc: Document) =>
    invoke('write_document', { docId: doc.id, doc }),
  deleteDocument: (docId: string) => invoke('delete_document', { docId }),

  saveAsset: (id: string, data: number[], ext: string) =>
    invoke<string>('save_asset', { assetId: id, data, ext }),
  deleteAsset: (fileName: string) => invoke('delete_asset', { fileName }),
  readAssetBase64: (fileName: string) =>
    invoke<string>('read_asset_base64', { fileName }),
  listAssets: () => invoke<AssetInfo[]>('list_assets'),

  loadSettings: () => invoke<AppSettings>('read_settings'),
  saveSettings: (settings: AppSettings) => invoke('write_settings', { settings }),
};
```

#### 2.2 localStorage 数据迁移（一次性）

在 store 的 `init()` 中：
1. 调用 `storage.init()` 创建目录
2. 检查 `index.json` 是否存在（通过 `read_index` 捕获错误判断）
3. 若不存在但 localStorage 有旧数据（`omninote_docs`）→ 批量迁移：
   - 遍历旧文档数组，每篇调用 `write_document`
   - 生成 `index.json` 并调用 `write_index`
   - assets 同理迁移（`omninote_assets` → `save_asset`）
4. 迁移完成后可选清理 localStorage（保留备份更安全）

---

### 阶段 3：状态管理（Zustand Store）

**目标**：用 Zustand 替代 App.tsx 的上帝状态 + prop drilling。

#### 3.1 安装依赖

```bash
npm install zustand
```

#### 3.2 `src/store/useStore.ts`

```typescript
import { create } from 'zustand';
import { storage, DocumentMeta } from '../lib/storage';
import { Document, Block, BlockType } from '../types';
import { DEFAULT_DOCUMENTS } from '../data/defaultData';

interface StoreState {
  // —— 数据 ——
  docList: DocumentMeta[];         // 侧边栏列表（轻量，无 blocks）
  activeDoc: Document | null;       // 当前打开的完整文档
  activeDocId: string;

  // —— UI 状态 ——
  isDarkMode: boolean;
  isSidebarOpen: boolean;
  isOutlineOpen: boolean;
  isFolderOpen: boolean;

  // —— 初始化 ——
  init: () => Promise<void>;

  // —— 文档操作 ——
  createDocument: () => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  updateDocumentMeta: (fields: Partial<Document>) => void;

  // —— Block 操作 ——
  updateBlock: (blockId: string, fields: Partial<Block>) => void;
  deleteBlock: (blockId: string, mergeContent?: string) => void;
  insertBlockBelow: (blockId: string, type: BlockType) => void;
}
```

**关键设计决策**：
- `docList` 只存元数据（无 blocks），侧边栏秒开
- `activeDoc` 按需加载完整数据（切换文档时 `invoke('read_document')`）
- Block 编辑直接修改 `activeDoc.blocks`，配合 **防抖自动保存**（500ms）写盘——仅序列化当前单篇文档，而非全量所有文档
- 所有组件通过 `useStore(s => s.xxx)` 选择性订阅，避免无关重渲染

#### 3.3 防抖自动保存

在 store 内部实现：监听 `activeDoc` 变化，500ms 防抖后调用 `storage.saveDocument(activeDoc)`。同时更新 `index.json` 中对应条目的 `updatedAt`/`title`。

---

### 阶段 4：组件瘦身与接入 Store

#### 4.1 `App.tsx` — 从 334 行瘦身到 ~100 行

- 删除全部 `useState`（迁移到 store）
- 删除全部 handler 函数（迁移到 store actions）
- 保留纯布局：顶栏 + 侧边栏 + 编辑器 + 大纲 + 文件夹
- `useEffect` 中只调用 `useStore.getState().init()`

#### 4.2 `DocumentList.tsx`

```typescript
// 改前：接收 8 个 props
// 改后：直接从 store 读取
const documents = useStore(s => s.docList);
const activeDocId = useStore(s => s.activeDocId);
const onSelect = useStore(s => s.openDocument);
const onDelete = useStore(s => s.deleteDocument);
const onToggleFavorite = useStore(s => s.toggleFavorite);
```

#### 4.3 `BlockEditor.tsx`

```typescript
// 改前：接收 document + documents + onSelectDocument + onUpdateDocument（4 个 props）
// 改后：从 store 直接取
const activeDoc = useStore(s => s.activeDoc);
const docList = useStore(s => s.docList);  // 用于 backlinks 计算
const updateBlock = useStore(s => s.updateBlock);
const openDocument = useStore(s => s.openDocument);
```

#### 4.4 `LocalFolder.tsx`

- assets 状态迁移到 store 或独立 store slice
- 上传文件改为调用 `storage.saveAsset()`（二进制落盘），不再 base64 塞 localStorage
- 列表加载改为 `storage.listAssets()`
- `handleInsertAssetAsBlock` 的 `any` 类型修复为 `LocalAsset`

#### 4.5 `ArticleOutline.tsx`

```typescript
// 改前：接收 document prop
// 改后：
const activeDoc = useStore(s => s.activeDoc);
```

---

### 阶段 5：BlockItem 进一步拆分（1409 行 → ~11 个文件）

**目标**：将剩余的 block 类型从 BlockItem 中拆出为独立组件。共享逻辑抽到公共模块。

> 注：`WebEmbedBlock`、`AttachmentBlock`、`CodeBlock` 已经是独立组件，无需变动。

#### 5.1 共享部分抽取

| 抽取内容 | 目标文件 | 当前 BlockItem 行号 |
|----------|----------|---------------------|
| `ContentEditableBlock` 组件 | `blocks/ContentEditableBlock.tsx` | 12-60 |
| `SLASH_COMMANDS` 列表 | `blocks/shared.ts` | 85-95 |
| 键盘导航工具函数（caret 检测、跨块移动、inline escape） | `blocks/keyboard.ts` | 183-407 |
| `handleKeyDown` 主函数 | `blocks/keyboard.ts` | 481-596 |
| Markdown 自动格式化（`handleBlur`） | `blocks/shared.ts` | 602-645 |
| Wiki 链接渲染（`renderFormattedText`） | `blocks/shared.tsx` | 738-809 |
| `getDefaultProperties` | `blocks/shared.ts` | 705-735 |
| `handleTextChange` + slash 菜单逻辑 | `blocks/shared.ts` | 648-703 |

#### 5.2 按类型拆分（剩余 9 种）

| 组件 | 对应 type | 核心逻辑来源（当前 BlockItem 行号） |
|------|-----------|-------------------------------------|
| `TextBlock` | `text` | 1019-1043（含 contentEditable + onBlur 格式化） |
| `HeadingBlock` | `heading-1/2/3` | 980-1016（合并为一个组件，接收 level prop） |
| `CalloutBlock` | `callout` | 1046-1062 |
| `ImageBlock` | `image` | 1081-1125（含拖放 base64） |
| `TableBlock` | `table` | 1209-1286 + 887-932（行列编辑逻辑） |
| `ToggleBlock` | `toggle` | 1289-1344 |
| `CanvasBlock` | `canvas` | 1128-1206 + 812-884（canvas 绘制逻辑） |
| `WhiteboardBlock` | `whiteboard` | 1357-1361（tldraw） |
| `CodeBlockWrapper` | `code` | 1065-1078（包装现有 CodeBlock） |

#### 5.3 `BlockRouter.tsx`

```typescript
const BLOCK_COMPONENTS: Partial<Record<BlockType, React.FC<BlockComponentProps>>> = {
  'text':           TextBlock,
  'heading-1':      (p) => <HeadingBlock {...p} level={1} />,
  'heading-2':      (p) => <HeadingBlock {...p} level={2} />,
  'heading-3':      (p) => <HeadingBlock {...p} level={3} />,
  'callout':        CalloutBlock,
  'image':          ImageBlock,
  'table':          TableBlock,
  'toggle':         ToggleBlock,
  'canvas':         CanvasBlock,
  'whiteboard':     WhiteboardBlock,
  'code':           CodeBlockWrapper,
  'web-embed':      WebEmbedBlock,    // 已有
  'attachment':     AttachmentBlock,  // 已有
};

export function BlockRouter({ block, ...props }: BlockRouterProps) {
  const Component = BLOCK_COMPONENTS[block.type] ?? TextBlock;
  return <Component block={block} {...props} />;
}
```

`BlockEditor` 渲染时用 `BlockRouter` 替代直接引用 1409 行的 `BlockItem`。

---

## 四、实施顺序与依赖关系

```
阶段1 (Rust 存储后端)
  │
  └──→ 阶段2 (前端 storage 抽象层 + 迁移逻辑)  ← 依赖阶段1的命令
         │
         └──→ 阶段3 (Zustand Store)             ← 依赖阶段2的API
                │
                └──→ 阶段4 (组件瘦身，接入 store)  ← 依赖阶段3
                       │
                       └──→ 阶段5 (BlockItem 拆分)  ← 最后，纯内部重构
```

**建议**：严格按 1→2→3→4→5 顺序执行，每完成一个阶段做一次编译验证 + 手动冒烟测试。

---

## 五、不在本次范围内（未来可做）

- **全文搜索**：有了文件系统后，可在 Rust 侧用 tantivy 做本地索引
- **SQLite 迁移**：若文档量增大到数千篇，可将 index.json 升级为 SQLite
- **多窗口/多标签**：Tauri 多窗口编辑不同文档
- **云同步**：基于文件系统的增量同步
- **AI 功能**：package.json 有 `@google/genai` 依赖但代码中未使用，可后续接入

---

## 六、验证清单

每个阶段完成后的检查点：

- [ ] **阶段1**：`cargo build` 通过；Tauri dev 能创建 `~/.jdata/studio/` 目录结构
- [ ] **阶段2**：前端能通过 `storage.loadDocument()` 读取数据；localStorage 旧数据（`omninote_docs`/`omninote_assets`）成功迁移到文件系统
- [ ] **阶段3**：`App.tsx` 中无 `localStorage` 调用；store 的 `init()` 正确加载文档列表
- [ ] **阶段4**：全部组件从 store 读数据；手动测试创建/编辑/删除文档正常；附件上传走文件系统
- [ ] **阶段5**：`BlockItem.tsx` 拆解完毕；所有 block 类型（含 web-embed/attachment）渲染正常；键盘导航/canvas/slash 菜单功能不回归
