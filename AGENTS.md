# AGENT.md — JStudio 项目规范

> 本文件供 AI 代码助手（Claude / Cursor / Copilot 等）阅读，提供项目上下文、架构约束和编码规范。

## 项目概述

**JStudio** 是一个基于 **Tauri v2 + React 19 + TypeScript** 的本地笔记应用，定位为"离线优先的 Notion 风格块编辑器"。所有数据存储在用户本地文件系统，无云端依赖。

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri v2 (Rust 后端 + WebView 前端) |
| 前端框架 | React 19 + TypeScript (strict) |
| 构建工具 | Vite 6 |
| 状态管理 | Zustand (slice 模式) |
| 样式 | Tailwind CSS v4 (`@import "tailwindcss"`, 无 JS 配置文件) |
| 图标 | lucide-react |
| 暗色模式 | 基于 `.dark` CSS 类 (非 `prefers-color-scheme`) |

## 目录结构

```
jstudio/
├── src/                        # 前端源码
│   ├── App.tsx                 # 根组件（三栏布局）
│   ├── main.tsx                # React 入口
│   ├── index.css               # Tailwind v4 入口
│   ├── types.ts                # 类型 re-export → types/index.ts
│   │
│   ├── types/
│   │   ├── index.ts            # Barrel export
│   │   ├── document.ts         # Document, Block, BlockType, BlockProperties
│   │   └── editor.ts           # 编辑器/插件/同步相关类型
│   │
│   ├── lib/
│   │   ├── storage.ts          # 存储抽象层（封装所有 Tauri invoke 调用）
│   │   └── migrate.ts          # localStorage → 文件系统迁移
│   │
│   ├── store/
│   │   ├── useStore.ts         # Zustand store 组合入口
│   │   ├── storeHelpers.ts     # StoreState 接口 + debounce 辅助
│   │   ├── documentsSlice.ts   # 文档 CRUD + init
│   │   ├── editorSlice.ts      # Block 操作 + 图片粘贴
│   │   └── uiSlice.ts          # 主题 + 面板可见性
│   │
│   ├── data/
│   │   └── defaultData.ts      # 预设文档（仅 legacy，新用户为空）
│   │
│   ├── styles/
│   │   └── vscode-theme.css    # VSCode 风格主题变量 + 全局样式
│   │
│   └── components/
│       ├── TitleBar.tsx         # 窗口标题栏（搜索 + 侧边栏切换）
│       ├── BlockEditor.tsx     # 编辑器主体（单一 contentEditable surface）
│       ├── DocumentList.tsx    # 侧边栏文档列表（含「新建文档」入口）
│       ├── LocalFolder.tsx     # 本地资源面板
│       ├── ui/                 # ── 公共 UI 组件（浮层、按钮等），新增浮层 UI 必须先查此处
│       │   ├── IconButton.tsx   # 通用图标按钮
│       │   ├── MenuList.tsx     # 菜单容器 + MenuItem + MenuDivider（所有菜单/下拉统一用此）
│       │   ├── FontDropdown.tsx
│       │   └── Toast.tsx
│       └── blocks/
│           ├── BlockRouter.tsx     # 块类型路由
│           ├── BlockLine.tsx       # surface 内的文本行
│           ├── BlockHandle.tsx     # hover 控件 ([+] [⋮⋮])
│           ├── BlockContextMenu.tsx
│           ├── SlashMenu.tsx       # / 命令菜单
│           ├── useSurfaceEditor.ts # 容器级编辑器 hook（核心）
│           ├── shared.tsx          # SLASH_COMMANDS, getDefaultProperties
│           ├── types.ts            # BaseBlockProps, BlockRouterProps
│           ├── TextBlock / HeadingBlock / CalloutBlock / ToggleBlock
│           ├── ImageBlock / TableBlock / CodeBlockWrapper
│           ├── CanvasBlock / WhiteboardBlock
│           └── WebEmbedBlock / AttachmentBlock
│
└── src-tauri/                  # Rust 后端
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── main.rs             # 入口
        ├── lib.rs              # 插件注册 + 命令绑定
        └── commands/
            └── storage.rs      # 14 个文件系统存储命令
```

## UI 布局（三栏）

```
┌──────────────────────────────────────────────────────────────┐
│ TitleBar (搜索框 + 侧边栏切换按钮)                         │
├──────┬─────────────────┬──────────────────────────────────────┤
│      │                 │  Slim action bar (品牌+删除)        │
│ Act. │  Document List  ├──────────────────────────────────────┤
│ Bar  │  (搜索/列表/    │                                      │
│      │   新建入口 [+])  │      BlockEditor                     │
│ 48px │  240px          │      (flex-1)                        │
└──────┴─────────────────┴──────────────────────────────────────┘
```

| 区域 | 组件 | 职责 |
|------|------|------|
| TitleBar | `TitleBar.tsx` | 窗口标题栏（全局搜索 + 侧边栏展开/收起切换） |
| Activity Bar | `App.tsx` 内联 | 文档 / 设置 入口切换（48px 固定宽） |
| Sidebar | `DocumentList.tsx` | 文档搜索 + 列表 + **新建文档**（头部 `+` 按钮） |
| Action Bar | `App.tsx` 内联 | 品牌标识 + 删除当前文档（不含新建） |
| Main | `BlockEditor.tsx` / `Settings.tsx` | 文档编辑 / 设置页（按 `isSettingsOpen` 切换） |

> **新建文档**入口位于 `DocumentList` 头部，不在顶部 action bar。
> **侧边栏收起/展开**入口位于 `TitleBar` 右侧按钮（VSCode 风格 `PanelLeft` 图标），也可通过命令面板操作。

## 数据存储

### 存储位置

```
~/.jdata/studio/
├── index.json                          # 文档元数据索引（轻量数组）
├── settings.json                       # 用户设置 ({ "theme": "dark" | "light" })
├── assets/                             # 全局共享资源（legacy）
└── documents/
    └── {docId}/                        # 每篇文档独立文件夹
        ├── document.json               # 完整文档内容（含 blocks 数组）
        └── assets/                     # 文档私有资源（粘贴的图片等）
```

### 存储规则

1. **索引与内容分离**：`index.json` 只存 `DocumentMeta[]`（无 blocks），侧边栏可瞬时渲染。完整文档按需从 `documents/{id}/document.json` 加载。
2. **每文档独立文件夹**：文档的所有资源（图片、附件）存在 `documents/{id}/assets/` 下，删除文档时整个文件夹一并删除，无残留。
3. **防抖写入**：文档和索引的保存都有 500ms debounce（`scheduleDocumentSave` / `scheduleIndexSave`），避免高频 IO。
4. **向后兼容**：`read_document` 支持旧的扁平文件 `documents/{id}.json`，`delete_document` 会同时清理两种布局。
5. **无数据库**：纯文件系统 JSON 存储，无 SQLite / IndexedDB。

### Rust 命令清单（14 个）

| 命令 | 功能 |
|------|------|
| `ensure_studio_dir` | 创建目录树，返回根路径 |
| `read_index` / `write_index` | 读写 `index.json` |
| `read_document` / `write_document` / `delete_document` | 文档 CRUD |
| `save_doc_asset` / `read_doc_asset_base64` | 文档私有资源读写 |
| `save_asset` / `delete_asset` / `read_asset_base64` / `list_assets` | 全局资源（legacy） |
| `read_settings` / `write_settings` | 应用设置读写 |

## 编辑器架构（核心）

### 统一 Surface 模式（Notion 式）

整个文档的块区域是**一个** `contentEditable` div（`data-editor-surface`）。每个文本块是其中的 `<div data-block-line>` 子节点。这是实现**跨块选中、复制、剪切**的关键——浏览器看到一个连续的可编辑区域。

```
<div data-editor-surface contentEditable>
  <div data-block-id="b1" class="block-wrapper">
    <BlockHandle />                    ← hover/active 时显示 [+] [⋮⋮]
    <div data-block-line>文本内容</div>  ← 参与选区的子节点
  </div>
  <div data-block-id="b2" class="block-wrapper">
    <BlockHandle />
    <div data-block-line>第二段</div>
  </div>
  <div data-block-id="b3" data-block-island>  ← 非文本块
    <div contentEditable={false}>图片/代码/表格</div>
  </div>
</div>
```

### 事件处理层级

| 层级 | 处理者 | 职责 |
|------|--------|------|
| Surface 容器 | `useSurfaceEditor.ts` | 所有 keydown / input / paste 事件 |
| BlockRouter | 仅渲染 | 根据 type 路由到具体块组件 |
| 块组件 | 仅展示 | TextBlock / HeadingBlock 等只负责渲染内容 |
| BlockHandle | 交互 | hover 控件、右键菜单（删除/复制/转换） |

### 文本块 vs 非文本块

- **文本块**（text, heading-1/2/3, callout, toggle）：是 surface 的直接参与节点，用 `<BlockLine>` 渲染
- **非文本块**（image, table, code, canvas, whiteboard, web-embed, attachment）：用 `contentEditable={false}` 包裹为原子岛屿

### Notion 风格键盘行为

| 按键 | 行为 |
|------|------|
| `Enter` | 在下方新建文本块 |
| `Shift+Enter` | 块内换行 |
| `Backspace`（块首） | 与上一个块合并 |
| `ArrowUp`（首行） | 跳到上一个块（或标题） |
| `ArrowDown`（末行） | 跳到下一个块 |
| `Cmd/Ctrl+B` | 粗体 |
| `Cmd/Ctrl+I` | 斜体 |
| `Cmd/Ctrl+D` | 复制当前块 |
| `/` | 唤出 Slash 菜单 |
| `# ` / `## ` / `### ` | Markdown 快捷转换为标题 |

## 编码规范

### 前端

1. **禁止组件直接调用 `invoke`**：所有 Tauri IPC 必须通过 `lib/storage.ts` 的 `storage` 对象。
2. **Store 操作通过 slice**：新增状态/方法时，判断属于哪个 slice（documents / editor / ui），在对应 slice 文件中添加，并在 `storeHelpers.ts` 的 `StoreState` 接口中声明类型。
3. **块组件只做展示**：文本块不处理自己的键盘事件，所有编辑逻辑在 `useSurfaceEditor` 中统一处理。
4. **Tailwind CSS v4**：使用 CSS 变量 `var(--vscode-*)` 保持与 VSCode 主题一致，不要硬编码颜色值。
5. **非受控 DOM**：surface 内的 DOM 内容由浏览器管理，React 不在元素聚焦时重写 `innerHTML`。
6. **图标**：使用 `lucide-react`，图标大小统一用 `w-4 h-4` 或 `w-3.5 h-3.5`。
7. **路径别名**：`@/*` 映射到 `src/*`（tsconfig 配置），但项目中主要使用相对路径导入。
8. **复用 UI 公共组件，不要重复造样式**：新增任何浮层 UI（菜单、下拉、上下文菜单等）之前，**先检查 `components/ui/` 下是否已有对应组件**。如果已有，直接引用；如果没有，先提取为公共组件再使用。详见下方「UI 组件复用规范」。

### Rust 后端

1. **命令注册**：新增 `#[tauri::command]` 后，必须在 `src/lib.rs` 的 `generate_handler!` 中注册。
2. **错误处理**：所有命令返回 `Result<T, String>`，用 `.map_err(|e| e.to_string())` 转换。
3. **路径辅助函数**：`storage.rs` 顶部有 `studio_dir()` / `doc_dir()` 等辅助函数，新增命令时复用。

### 命名约定

| 对象 | 约定 | 示例 |
|------|------|------|
| 文档 ID | `doc-{timestamp}` | `doc-1781372359797` |
| 块 ID | `block-{timestamp}` | `block-1781372360001` |
| Tauri 命令 | snake_case | `save_doc_asset` |
| TS 类型/接口 | PascalCase | `BlockProperties` |
| TS 函数/变量 | camelCase | `scheduleDocumentSave` |
| React 组件 | PascalCase | `BlockEditor` |
| CSS 变量 | `--vscode-*` | `--vscode-editor-background` |
| 文件名 | PascalCase(组件) / camelCase(工具) | `BlockEditor.tsx` / `storage.ts` |

### UI 组件复用规范

> **核心原则**：先查 `components/ui/`，再写新代码。

新增任何浮层 UI（菜单、下拉、上下文菜单等）之前，**必须先检查 `components/ui/` 下是否已有对应组件**：

- **已有** → 直接引用，不要重复写 inline 样式。
- **没有** → 先提取为公共组件放到 `components/ui/`，然后在业务代码中引用。

`components/ui/` 现有组件：

| 组件 | 用途 |
|------|------|
| `IconButton` | 通用图标按钮（hover 态、active 态统一） |
| `MenuList` + `MenuItem` + `MenuDivider` | 所有菜单、下拉、上下文菜单的容器和子项（样式统一） |
| `FontDropdown` | 字体下拉 |
| `Toast` | 轻提示 |

**为什么这条规范很重要**：

历史上 `DocumentContextMenu` 和 `TerminalTabContextMenu` 是复制粘贴的，样式重复但散落在各自的文件里。当新增第三个菜单时，如果没有意识到应该用公共组件，就会手写一套 CSS 变量组合（用了不同的 `--vscode-*` 变量名），导致同一类 UI 视觉风格不一致。公共组件的意义在于**让一致性由结构保证，而非靠人记**。

## 构建与运行

```bash
# 前端开发（仅 Vite dev server）
npm run dev

# Tauri 桌面应用开发（前端 + Rust 后端）
npm run tauri dev

# 生产构建
npm run build          # 前端
npm run tauri build    # 完整桌面应用

# 类型检查
npx tsc --noEmit
```

- **前端 dev port**: `1420`
- **前端 dist**: `dist/`
- **Tauri 配置**: `src-tauri/tauri.conf.json`
