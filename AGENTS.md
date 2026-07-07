# AGENT.md — JStudio 项目规范

> 本文件供 AI 代码助手（Claude / Cursor / Copilot 等）阅读，提供项目上下文、架构约束和编码规范。

## 项目概述

**JStudio** 是一个基于 **Tauri v2 + React 19 + TypeScript** 的本地笔记应用，定位为"离线优先的 Notion 风格块编辑器"。所有数据存储在用户本地（SQLite 存元数据与正文 + 文件系统存二进制资源），无云端依赖。

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
│   │
│   ├── types/                  # 类型定义
│   │   ├── index.ts            # Barrel export
│   │   ├── document.ts         # Document, Block, BlockType, BlockProperties
│   │   ├── editor.ts           # 编辑器/插件/同步相关类型
│   │   └── richText.ts         # RichText, RichTextAnnotations
│   │
│   ├── lib/                    # 工具库
│   │   ├── core/               # 核心基础设施
│   │   │   ├── storage.ts      # 存储抽象层（封装所有 Tauri invoke 调用）
│   │   │   ├── i18n.ts         # 国际化
│   │   │   ├── commandRegistry.ts # 命令面板注册
│   │   │   └── index.ts        # Barrel export
│   │   │
│   │   ├── editor/             # 编辑器相关
│   │   │   ├── extensions/     # TipTap 扩展
│   │   │   ├── content/        # 内容转换（richText ↔ HTML）
│   │   │   ├── slashMenu/      # 斜杠菜单
│   │   │   ├── tiptapAdapter.ts # TipTap ↔ Block 转换
│   │   │   ├── fonts.ts        # 字体配置
│   │   │   └── upload.ts       # 文件上传
│   │   │
│   │   ├── shortcuts/          # 快捷键
│   │   ├── documents/          # 文档工具
│   │   ├── terminal/           # 终端相关
│   │   ├── windows/            # 窗口管理
│   │   └── activityMeta.ts     # Activity Bar 元数据
│   │
│   ├── store/                  # Zustand 状态管理
│   │   ├── index.ts            # Barrel export
│   │   ├── useStore.ts         # Store 组合入口
│   │   ├── storeHelpers.ts     # StoreState 接口 + debounce 辅助
│   │   ├── documentsSlice.ts   # 文档 CRUD + init
│   │   ├── editorSlice.ts      # Block 操作 + 图片粘贴
│   │   ├── uiSlice.ts          # 主题 + 面板可见性
│   │   ├── foldersSlice.ts     # 文件夹管理
│   │   ├── workspaceSlice.ts   # 工作区/标签页
│   │   ├── terminalSlice.ts    # 终端状态
│   │   └── toastSlice.ts       # 轻提示状态
│   │
│   ├── data/
│   │   └── defaultData.ts      # 预设文档（仅 legacy，新用户为空）
│   │
│   ├── styles/
│   │   └── vscode-theme.css    # VSCode 风格主题变量 + 全局样式
│   │
│   └── components/
│       ├── layout/             # 布局组件
│       │   ├── TitleBar.tsx    # 窗口标题栏
│       │   ├── ActivityBar.tsx # 左侧活动栏
│       │   └── ErrorBoundary.tsx # 错误边界
│       │
│       ├── editor/             # 编辑器组件
│       │   ├── BlockEditor.tsx # 编辑器主体
│       │   ├── CommandPalette.tsx # 命令面板
│       │   ├── nodes/          # 块节点视图
│       │   └── hooks/          # 编辑器 hooks
│       │
│       ├── documents/          # 文档相关组件
│       │   ├── DocumentList.tsx # 侧边栏文档列表
│       │   ├── DocumentTabs.tsx # 文档标签页
│       │   └── DocumentContextMenu.tsx # 文档右键菜单
│       │
│       ├── settings/           # 设置组件
│       │   ├── Settings.tsx    # 设置页框架
│       │   ├── GeneralSection.tsx # 通用设置
│       │   ├── EditorSection.tsx  # 编辑器设置
│       │   └── TerminalSection.tsx # 终端设置
│       │
│       ├── terminal/           # 终端组件
│       │
│       ├── windows/            # 窗口组件
│       │
│       └── ui/                 # 公共 UI 组件
│           ├── IconButton.tsx  # 通用图标按钮
│           ├── MenuList.tsx    # 菜单容器
│           ├── Toast.tsx       # 轻提示
│           ├── icons.tsx       # SVG 图标组件
│           └── cursor/         # 光标特效
│               ├── BaseCursorTrail.ts
│               ├── EditorCursorTrail.ts
│               └── shaders.ts
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

> **架构：SQLite（元数据）+ 文件系统（正文与资源）混合。**
> 轻量、需要排序/查询的元数据进 SQLite；体积大、需整体读写的文档正文与二进制资源留在文件系统，按文档分文件夹存放。

### 存储位置

```
~/.jdata/studio/
├── studio.db                           # SQLite 数据库（元数据：文档/文件夹/设置）
├── studio.db-wal / studio.db-shm       # WAL 日志（自动生成）
├── index.json.bak                      # 旧 JSON 迁移后的备份（一次性，仅恢复用）
├── settings.json.bak                   # 同上
├── folders.json.bak                    # 同上
├── assets/                             # 全局共享资源（legacy）
└── documents/
    └── {docId}/                        # 每篇文档独立文件夹
        ├── document.json               # 完整文档正文（含 blocks 数组）—— 仍是文件
        └── assets/                     # 文档私有资源（粘贴的图片等）
```

### SQLite 表结构（`src-tauri/src/db.rs`）

数据库文件 `~/.jdata/studio/studio.db`，使用 `rusqlite`，开启 **WAL** 模式（`journal_mode=WAL`、`synchronous=NORMAL`、`foreign_keys=ON`），允许主窗口与预览窗口并发读。共 3 张表：

| 表 | 取代的旧文件 | 字段 | 说明 |
|----|------------|------|------|
| `documents` | `index.json` | `id`(PK), `title`, `emoji`, `folder_id`, `is_favorite`, `created_at`, `updated_at` | 文档**元数据**（不含 blocks）。索引：`folder_id`、`updated_at DESC` |
| `folders` | `folders.json` | `id`(PK), `name`, `parent_id`, `sort_order`, `collapsed` | 文件夹树，`parent_id` 自引用，`sort_order` 决定同级排序 |
| `settings` | `settings.json` | `key`(PK), `value` | 每行一个设置项，`value` 为 JSON 编码字符串（前端组装回单个对象） |

### 三者如何关联运作

- **元数据在库、正文在盘，靠 `id` 关联**：`documents` 表的 `id` 即文档文件夹名 `documents/{id}/`。侧边栏从 `documents` 表读列表（`read_index`，按 `updated_at DESC` 排序），点开某篇时再用同一个 `id` 去读盘上的 `documents/{id}/document.json`（`read_document`）。
- **文件夹归属**：`documents.folder_id` 指向 `folders.id`；`folders.parent_id` 指向上级文件夹，构成树。
- **`documents` 表里**没有 blocks 正文——正文只存在于盘上的 `document.json`，删除文档时连整个 `documents/{id}/` 文件夹（含 assets）一并删除。

### 存储规则

1. **元数据/正文分离**：列表元数据走 SQLite（`read_index`/`write_index` 实为读写 `documents` 表），正文按需从 `documents/{id}/document.json` 加载。
2. **每文档独立文件夹**：文档的所有资源（图片、附件）存在 `documents/{id}/assets/` 下，删除文档时整个文件夹一并删除，无残留。
3. **防抖写入**：文档和索引的保存都有 debounce（`scheduleDocumentSave` / `scheduleIndexSave`），避免高频 IO。
4. **一次性 JSON → SQLite 迁移**：首次启动时 `db.rs::migrate_from_json` 把旧的 `index.json`/`folders.json`/`settings.json` 导入对应表（仅当目标表为空时执行，幂等），成功后把原文件重命名为 `*.json.bak` 留作人工恢复。
5. **孤儿文档恢复**：`db.rs::reconcile_orphan_documents` 在启动时扫描 `documents/` 目录，把盘上存在但未登记进 `documents` 表的非空文档补录回表（按 `id` 升序、按正文指纹去重），修复迁移可能遗漏的文档。
6. **向后兼容**：`read_document` 支持旧的扁平文件 `documents/{id}.json`，`delete_document` 会同时清理两种布局。

### Rust 命令清单

> 命令是稳定的 IPC 接口，**底层实现已从 JSON 文件切换到 SQLite**（命令名保留未变）。

| 命令 | 功能 | 底层 |
|------|------|------|
| `ensure_studio_dir` | 创建目录树并初始化 SQLite（建表 + 迁移），返回根路径 | 文件系统 + DB |
| `read_index` / `write_index` | 读写文档元数据（旧名沿用） | **SQLite `documents` 表** |
| `read_folders` / `write_folders` | 读写文件夹树 | **SQLite `folders` 表** |
| `read_settings` / `write_settings` | 读写应用设置（`write_settings` 为按 key 的局部 upsert） | **SQLite `settings` 表** |
| `read_document` / `write_document` / `delete_document` | 文档正文 CRUD | 文件系统 `document.json` |
| `save_doc_asset` / `read_doc_asset_base64` / `list_doc_assets` | 文档私有资源读写 | 文件系统 `documents/{id}/assets/` |
| `save_asset` / `delete_asset` / `read_asset_base64` / `list_assets` | 全局资源（legacy） | 文件系统 |
| `get_doc_path` / `open_doc_dir` / `open_studio_dir` | 路径查询 / 在文件管理器中打开 | 文件系统 |

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
4. **Tailwind CSS v4**：使用 CSS 变量 `var(--vscode-*)` 保持与 VSCode 主题一致，不要硬编码颜色值。**多主题适配要点**：
   - 项目有 **4 个主题**（JStudio Light/Dark、Ink Light/Dark），每个主题的配色完全不同（如 `widget-border` 在不同主题下是 `#E5E5E5`、`#313131`、`#ddd4c8`、`#2f334d`）。
   - 主题定义在 `lib/themes/appThemes.ts`，运行时通过 `applyAppTheme()` 将颜色注入到 CSS 变量。
   - **所有颜色相关样式必须用 CSS 变量**，如 `var(--vscode-widget-border, #E5E5E5)`，fallback 值作为默认兜底。
   - **不要用 `.dark` 类区分主题**：`.dark` 只区分 light/dark 模式，无法区分同模式下不同配色（如 Ink Light 与 JStudio Light 都是浅色，但边框颜色不同）。
   - 正确示例：`border: 1px solid var(--vscode-widget-border, #E5E5E5)` → 自动适配所有主题。
   - 错误示例：`.dark` 下写 `border-color: #3C3C3C` → 只适配了 JStudio Dark，Ink Dark 的边框是 `#2f334d`（紫色调），会不一致。
5. **非受控 DOM**：surface 内的 DOM 内容由浏览器管理，React 不在元素聚焦时重写 `innerHTML`。
6. **图标**：使用 `lucide-react`，图标大小统一用 `w-4 h-4` 或 `w-3.5 h-3.5`。
7. **路径别名**：`@/*` 映射到 `src/*`（tsconfig 配置），但项目中主要使用相对路径导入。
8. **复用 UI 公共组件，不要重复造样式**：新增任何浮层 UI（菜单、下拉、上下文菜单等）之前，**先检查 `components/ui/` 下是否已有对应组件**。如果已有，直接引用；如果没有，先提取为公共组件再使用。详见下方「UI 组件复用规范」。
9. **列表选中项高亮只用单一状态驱动，禁止 CSS `:hover`**：命令面板、斜杠菜单等"鼠标 + 键盘双模式选择"的列表，选中高亮**只能**由一个状态变量（如 `selectedIndex` / `activeIndex`）驱动。鼠标 hover 通过 `onMouseEnter={() => setSelectedIndex(index)}` 更新该状态，键盘方向键也更新同一状态。**禁止**在非选中行上使用 CSS `:hover` 伪类（如 `hover:bg-*`）作为高亮手段——否则鼠标物理位置所在行会与键盘选中行同时出现高亮。正确做法参考 `SlashMenuList`（`lib/tiptapExtensions.tsx`）和 `CommandPalette`（`components/CommandPalette.tsx`）。

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
| `Toast` | 轻提示 |
| `icons.tsx` | SVG 图标组件（UploadIcon、AlignLeftIcon、AlignCenterIcon） |
| `cursor/` | 光标特效组件（BaseCursorTrail、EditorCursorTrail、shaders） |

**为什么这条规范很重要**：

历史上 `DocumentContextMenu` 和 `TerminalTabContextMenu` 是复制粘贴的，样式重复但散落在各自的文件里。当新增第三个菜单时，如果没有意识到应该用公共组件，就会手写一套 CSS 变量组合（用了不同的 `--vscode-*` 变量名），导致同一类 UI 视觉风格不一致。公共组件的意义在于**让一致性由结构保证，而非靠人记**。

## Tauri WebView 已知陷阱

> Tauri 使用系统原生 WebView（macOS = WKWebView, Windows = WebView2, Linux = WebKitGTK），行为与 Chrome/Firefox 不完全一致。以下是已踩过的坑。

### 1. macOS WKWebView 会吞掉 `Cmd+Arrow` 键事件

**现象**：`Cmd+Left` / `Cmd+Right` 等组合键的 `keydown` 事件在到达 ProseMirror 之前就被原生层 `preventDefault()` 了。

**根因**：WKWebView 原生层用 `Cmd+Arrow` 实现行首/行尾跳转，在 JS 事件派发前就标记了 `defaultPrevented = true`。而 ProseMirror 的 `editHandlers.keydown` 开头有 `if (event.defaultPrevented) return;`，直接跳过所有 handler。

**影响**：以下注册方式**全部无效**：
- TipTap `addKeyboardShortcuts`（被 ProseMirror keymap 插件跳过）
- ProseMirror `editorProps.handleKeyDown`（同样被跳过）
- 任何依赖事件冒泡到 editor DOM 的监听器

**正确做法**：在 `window` 级别用 **capture 阶段** 拦截，这是 JS 能接触到的最早时机，在系统默认行为之前截胡：

```ts
window.addEventListener('keydown', handler, true); // ← capture: true 是关键
```

详见 `docs/bug-graveyard.md` #001。

### 2. 调试键盘事件的方法论

当键盘快捷键"注册了但没反应"时，按以下顺序排查：

1. **先加 `console.log`，不要假设注册了就一定生效。**
2. **在 `editorProps.handleKeyDown` 加 log** → 有输出说明 ProseMirror 收到了事件，问题在逻辑；无输出说明事件没到达。
3. **在 `window.addEventListener('keydown', fn, true)` 加 log** → 检查 `event.defaultPrevented` 字段。如果为 `true`，说明原生层拦截了，需要用 window capture 方案。

> 关键心态：ProseMirror 的事件链有多层拦截（`defaultPrevented` 检查 → keymap 插件 → `handleKeyDown` → `handleKeyPress`），任何一层拦截都会导致后续层收不到事件。逐层加 log 确认事件到底走到哪一步被吞了。

### 3. WKWebView 快捷键拦截策略（不要使用原生菜单）

> **关键设计决策**：本项目**不使用** Tauri 的原生菜单（`@tauri-apps/api/menu`）来拦截快捷键，而是依赖纯 JavaScript 的全局快捷键处理器 + TipTap/ProseMirror 的内置事件处理。

**为什么不用原生菜单**：

曾经尝试用 `PredefinedMenuItem` 注册 Edit 菜单（Copy/Cut/Paste/SelectAll）和 Quit 菜单，但带来严重问题：

1. **`PredefinedMenuItem` 的 SelectAll 会选中整个 WebView 内容**，包括侧边栏、标题栏等，完全绕过 TipTap 的 `SelectAllText` 扩展。而我们的扩展有自定义逻辑：在代码块内只选中代码块内容，避免 WebKit 绘制全宽选中条。
2. **原生菜单是全局的**，无法区分当前焦点是在编辑器还是普通 `<input>`。TipTap 的 copy/paste 处理需要配合编辑器状态（如处理 Markdown 解析、图片粘贴等），原生菜单会绕过这些逻辑。
3. **Cmd+Q 交给 macOS 系统处理即可**，不需要手动注册 Quit 菜单项。

**正确的方案**：

- **Cmd+C/V/X**：不在全局快捷键注册表中注册，让事件自然传递给 TipTap/ProseMirror，它们有内置的 clipboard 处理（会触发 `copy`/`paste`/`cut` 事件）。
- **Cmd+A**：不在全局快捷键注册表中注册，由 `SelectAllText` TipTap 扩展处理（`addKeyboardShortcuts` 注册 `Mod-a`）。
- **Cmd+Q**：不在全局快捷键注册表中注册，macOS 系统会默认处理（退出应用）。
- **Cmd+W**：这个是特例！WKWebView 原生层会拦截 Cmd+W 并直接关闭窗口，JavaScript 收不到事件。**解决方案**：在全局快捷键注册表中注册 `app.closeTab` = `mod+w`，用 `window.addEventListener('keydown', handler, true)` 在 capture 阶段拦截。

**全局快捷键处理器**（`App.tsx`）：

```ts
// capture 阶段拦截 — JS 能接触到的最早时机
window.addEventListener('keydown', handler, true);

// handler 逻辑：
// 1. 解析 event → binding 字串（如 "mod+w"）
// 2. 查 SHORTCUTS 注册表 → 找到 action
// 3. 执行 action
// 4. 如果不在注册表中，不做任何处理，让事件继续传递
```

**注册表设计**（`lib/shortcuts/keyboardShortcuts.ts`）：

```ts
export const SHORTCUTS = {
  'app.closeTab': { action: 'app.closeTab', binding: 'mod+w' },
  'app.toggleSidebar': { action: 'app.toggleSidebar', binding: 'mod+b' },
  // ...
};

// 注意：mod+c、mod+v、mod+a、mod+q 都不在注册表中
// 这些快捷键由系统/TipTap 自然处理
```

**EDITOR_RESERVED 集合**：

```ts
const EDITOR_RESERVED = new Set([
  'mod+b', // bold
  'mod+i', // italic
  'mod+s', // strike
  'mod+e', // code
]);
```

当焦点在编辑器内且快捷键在 `EDITOR_RESERVED` 中时，全局处理器**不拦截**，让 TipTap 自己处理。这是为了让格式化快捷键（Bold/Italic 等）走 TipTap 的 `addKeyboardShortcuts`，而不是全局处理器（后者会触发 store action，绕过编辑器事务）。

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
