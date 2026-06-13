# JStudio 架构重构计划

> 目标：将 jstudio 从「localStorage 单体前端 + Tauri 空壳」重构为「Tauri 原生文件系统存储 + 轻量状态管理 + 组件按职责拆分」的可维护架构。

---

## 一、当前痛点回顾

### 1. 数据存储（最严重）
- **全量序列化写盘**：用户每打一个字，`App.tsx` 都会 `JSON.stringify(所有文档)` 后写入 localStorage（同步阻塞主线程）
- **容量瓶颈**：localStorage 上限 5-10MB，base64 图片膨胀 33%，几篇带图文档即可撑爆
- **Tauri 空壳**：Rust 后端仅注册了 dialog/opener 插件，没有提供任何 `#[tauri::command]`，完全没用上 Tauri 的核心能力（原生文件系统、SQLite）

### 2. 状态管理
- **上帝组件**：`App.tsx`（329 行）持有全部状态 + 全部 CRUD 逻辑，6 处重复的 `documents.map → setDocuments → localStorage.setItem` 三段式
- **Prop drilling 3-4 层深**：`App → BlockEditor → BlockItem`，BlockItem 需接收 7 个回调 prop
- **LocalFolder 状态孤岛**：assets 独立维护自己的 useState + localStorage，与文档系统完全割裂

### 3. 组件拆分
- **BlockItem.tsx 2142 行**：一个组件处理 12 种 block 类型的全部渲染 + 键盘导航 + 沙盒编译 + Markdown 格式化 + canvas 绘制
- 违反单一职责，任何 block 类型的修改都要在这一个巨型文件里定位

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
│   ├── useBlockKeyboard.ts           # [新] 从 BlockItem 抽出的键盘导航逻辑
│   └── useAutoSave.ts                # [新] 文档防抖自动保存
├── components/
│   ├── blocks/                       # [新] BlockItem 拆分
│   │   ├── BlockRouter.tsx           #      根据 block.type 分发到具体组件
│   │   ├── TextBlock.tsx
│   │   ├── HeadingBlock.tsx
│   │   ├── CalloutBlock.tsx
│   │   ├── ImageBlock.tsx
│   │   ├── TableBlock.tsx
│   │   ├── ToggleBlock.tsx
│   │   ├── CanvasBlock.tsx
│   │   ├── WhiteboardBlock.tsx
│   │   ├── CodeBlockWrapper.tsx
│   │   ├── HtmlSandboxBlock.tsx      #      含 sandbox 预设、iframe 编译、源码编辑
│   │   ├── ContentEditableBlock.tsx  #      从 BlockItem 抽出的通用可编辑层
│   │   └── shared.ts                 #      SLASH_COMMANDS、inline format 工具函数
│   ├── BlockEditor.tsx               # [改] 从 store 读数据，不再接收 documents prop
│   ├── DocumentList.tsx              # [改] 从 store 读数据
│   ├── LocalFolder.tsx               # [改] assets 改用 storage 层
│   └── ArticleOutline.tsx            # [改] 从 store 读数据
├── App.tsx                           # [改] 瘦身为纯布局壳
└── types.ts                          # [微调] Document 拆分为 DocumentMeta + Document

src-tauri/
├── src/
│   ├── lib.rs                        # [改] 注册 Tauri commands
│   └── commands/
│       ├── mod.rs
│       └── storage.rs                # [新] 文档/资产/设置的读写删除命令
├── Cargo.toml                        # [改] 新增 dirs crate
└── capabilities/
    └── default.json                  # [改] 如需要添加 fs 权限
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
├── settings.json                     # 用户偏好（主题、侧边栏状态等）
└── index.json                        # 文档元数据列表（id/title/emoji/createdAt/updatedAt/isFavorite）
                                      #   用于侧边栏快速渲染，无需加载所有文档正文
```

---

## 三、分步实施计划

### 阶段 1：Tauri 存储后端（Rust 侧）

**目标**：让 Tauri 具备原生文件系统读写能力。

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
| `read_index` | `() -> Result<Vec<DocumentMeta>, String>` | 读取 `index.json`，返回所有文档元数据列表 |
| `write_index` | `(entries: Vec<DocumentMeta>) -> Result<(), String>` | 全量写入 `index.json` |
| `read_document` | `(doc_id: String) -> Result<Value, String>` | 读取 `documents/{doc_id}.json` |
| `write_document` | `(doc_id: String, doc: Value) -> Result<(), String>` | 写入单篇文档 JSON |
| `delete_document` | `(doc_id: String) -> Result<(), String>` | 删除文档文件（index 由前端同步） |
| `save_asset` | `(asset_id: String, data: Vec<u8>, ext: String) -> Result<String, String>` | 二进制落盘到 `assets/`，返回文件名 |
| `delete_asset` | `(file_name: String) -> Result<(), String>` | 删除资产文件 |
| `read_asset_base64` | `(file_name: String) -> Result<String, String>` | 读取资产为 base64（前端 img src 需要） |
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

export const storage = {
  init: () => invoke<string>('ensure_studio_dir'),

  loadIndex: () => invoke<DocumentMeta[]>('read_index'),
  saveIndex: (entries: DocumentMeta[]) => invoke('write_index', { entries }),

  loadDocument: (docId: string) => invoke<Document>('read_document', { docId }),
  saveDocument: (doc: Document) =>
    invoke('write_document', { docId: doc.id, doc: doc }),
  deleteDocument: (docId: string) => invoke('delete_document', { docId }),

  saveAsset: (id: string, data: number[], ext: string) =>
    invoke<string>('save_asset', { assetId: id, data, ext }),
  deleteAsset: (fileName: string) => invoke('delete_asset', { fileName }),

  loadSettings: () => invoke<AppSettings>('read_settings'),
  saveSettings: (settings: AppSettings) => invoke('write_settings', { settings }),
};
```

#### 2.2 localStorage 数据迁移（一次性）

在 `App.tsx` 初始化逻辑中：
1. 检查 `~/.jdata/studio/index.json` 是否存在
2. 若不存在但 localStorage 有旧数据 → 批量迁移到文件系统
3. 清理 localStorage 中的旧 key（可选，保留作为备份）

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
  docList: DocumentMeta[];         // 侧边栏列表（轻量）
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
  updateDocumentMeta: (fields: Partial<Document>) => Promise<void>;

  // —— Block 操作 ——
  updateBlock: (blockId: string, fields: Partial<Block>) => void;
  deleteBlock: (blockId: string, mergeContent?: string) => void;
  insertBlockBelow: (blockId: string, type: BlockType) => void;

  // —— 设置 ——
  toggleDarkMode: () => void;
}
```

**关键设计决策**：
- `docList` 只存元数据（无 blocks），侧边栏秒开
- `activeDoc` 按需加载完整数据（切换文档时 `invoke('read_document')`）
- Block 编辑直接操作 `activeDoc.blocks`，配合 **防抖自动保存**（500ms）写盘，不再每次按键都 `JSON.stringify` 全量
- 所有组件通过 `useStore(s => s.xxx)` 选择性订阅，避免无关重渲染

#### 3.3 `src/hooks/useAutoSave.ts` — 防抖保存

```typescript
// 在 store 内部使用：activeDoc 变化后 500ms 防抖写盘
// 仅序列化当前文档（一篇），而非全量
```

---

### 阶段 4：组件瘦身与接入 Store

#### 4.1 `App.tsx` — 从 329 行瘦身到 ~120 行

- 删除全部 `useState`（迁移到 store）
- 删除全部 handler 函数（迁移到 store actions）
- 保留纯布局：顶栏 + 侧边栏 + 编辑器 + 大纲 + 文件夹
- `useEffect` 中只调用 `useStore.getState().init()`

#### 4.2 `DocumentList.tsx`

```typescript
// 改前：接收 6 个 props
// 改后：
const documents = useStore(s => s.docList);
const activeDocId = useStore(s => s.activeDocId);
const onSelect = useStore(s => s.openDocument);
const onDelete = useStore(s => s.deleteDocument);
```

#### 4.3 `BlockEditor.tsx`

```typescript
// 改前：接收 document + documents + onUpdateDocument + onSelectDocument
// 改后：从 store 直接取
const activeDoc = useStore(s => s.activeDoc);
const updateBlock = useStore(s => s.updateBlock);
```

#### 4.4 `LocalFolder.tsx`

- assets 状态迁移到 store 或独立 store slice
- 上传文件改为调用 `storage.saveAsset()`（二进制落盘），不再 base64 塞 localStorage
- 列表加载改为读取 assets 目录

---

### 阶段 5：BlockItem 拆分（2142 行 → ~12 个文件）

**目标**：按 block 类型拆分为独立组件，共享逻辑抽到 hooks。

#### 5.1 共享部分抽取

| 抽取内容 | 目标文件 | 来源行数 |
|----------|----------|----------|
| `ContentEditableBlock` | `blocks/ContentEditableBlock.tsx` | 321-369 |
| `SLASH_COMMANDS` 列表 | `blocks/shared.ts` | 401-410 |
| 键盘导航（caret 检测、跨块移动、inline escape） | `hooks/useBlockKeyboard.ts` | 686-916, 990-1105 |
| Markdown 自动格式化 | `blocks/shared.ts` | 1111-1154 |
| `getDefaultProperties` | `blocks/shared.ts` | 1214-1241 |
| Wiki 链接渲染 | `blocks/shared.tsx` | 1243-1315 |

#### 5.2 按类型拆分

| 组件 | 对应 type | 核心逻辑来源 |
|------|-----------|-------------|
| `TextBlock` | `text` | 1591-1616 |
| `HeadingBlock` | `heading-1/2/3` | 1552-1589（合并为一个组件，接收 level prop） |
| `CalloutBlock` | `callout` | 1618-1635 |
| `ImageBlock` | `image` | 1653-1698 |
| `TableBlock` | `table` | 1782-1859 + 1459-1505 |
| `ToggleBlock` | `toggle` | 1862-1917 |
| `CanvasBlock` | `canvas` | 1700-1779 + 1317-1390 |
| `WhiteboardBlock` | `whiteboard` | 2088-2093 |
| `CodeBlockWrapper` | `code` | 1637-1651 |
| `HtmlSandboxBlock` | `html-render` | 1919-2086 + sandbox 预设(15-133) + 编译(1392-1457) |

#### 5.3 `BlockRouter.tsx`

```typescript
const BLOCK_COMPONENTS: Record<BlockType, React.FC<BlockComponentProps>> = {
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
  'html-render':    HtmlSandboxBlock,
};

export function BlockRouter({ block }: { block: Block }) {
  const Component = BLOCK_COMPONENTS[block.type] ?? TextBlock;
  return <Component block={block} />;
}
```

`BlockEditor` 渲染时用 `BlockRouter` 替代直接引用 2142 行的 `BlockItem`。

---

## 四、实施顺序与依赖关系

```
阶段1 (Rust存储后端)
  │
  ├──→ 阶段2 (前端storage抽象层)     ← 依赖阶段1的命令
  │      │
  │      └──→ 阶段3 (Zustand Store)  ← 依赖阶段2的API
  │             │
  │             └──→ 阶段4 (组件瘦身) ← 依赖阶段3的store
  │                    │
  │                    └──→ 阶段5 (BlockItem拆分) ← 最后做，纯内部重构，不改外部接口
  │
  └──→ localStorage 迁移逻辑          ← 依赖阶段2，可在阶段3的 init() 中实现
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

- [ ] **阶段1**：`cargo build` 通过；Tauri dev 能创建 `~/.jdata/studio/` 目录
- [ ] **阶段2**：前端能通过 `storage.loadDocument()` 读取数据；localStorage 旧数据成功迁移
- [ ] **阶段3**：App.tsx 中无 `localStorage` 调用；BlockItem 不再接收 7 个回调 prop
- [ ] **阶段4**：全部组件从 store 读数据；手动测试创建/编辑/删除文档正常
- [ ] **阶段5**：`BlockItem.tsx` 文件删除或仅保留 BlockRouter；所有 12 种 block 类型渲染正常
