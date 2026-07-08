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
│   │   │   ├── tiptapAdapter.ts # TipTap ↔ Block 转换（唯一转换源）
│   │   │   ├── fonts.ts        # 字体配置
│   │   │   └── upload.ts       # 文件上传
│   │   │
│   │   ├── themes/             # 主题系统（types.ts + 4 主题单文件 + registry.ts）
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
│   │   └── helpDocument.ts     # 帮助文档内容
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
│       │   ├── BlockEditor.tsx # 编辑器主体（单 TipTap 实例）
│       │   ├── sectionEditor/  # 分段编辑器（高性能，N 个 TipTap 实例）
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
        ├── lib.rs              # 插件注册 + 命令绑定 (generate_handler!)
        ├── db.rs               # SQLite（建表/迁移/孤儿恢复）
        └── commands/
            ├── mod.rs
            ├── storage/         # 存储层（已模块化）
            │   ├── mod.rs
            │   ├── paths.rs    # 路径 helper（jdata_dir/studio_dir/documents_dir 等，全后端唯一源头）
            │   ├── documents.rs
            │   ├── folders.rs
            │   ├── assets.rs
            │   ├── settings.rs
            │   ├── markdown.rs # Markdown 导入
            │   └── cache.rs
            ├── bundle.rs       # .jnote 导出/导入
            ├── link.rs         # 链接元数据抓取
            ├── link_tabs.rs    # Link Preview 多 webview 窗口
            ├── terminal.rs
            ├── window.rs
            ├── detach.rs       # 终端分离窗口
            ├── global_shortcut.rs
            ├── jcli.rs
            └── debug.rs
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

### 双编辑器模式

项目有两种编辑器实现，通过 UI 设置 `useSectionedEditor` 切换：

| 编辑器 | 文件 | 架构 | 适用场景 |
|--------|------|------|----------|
| `BlockEditor` | `components/editor/BlockEditor.tsx` | 单个 TipTap/ProseMirror 实例 | 小文档 / 默认 |
| `SectionedBlockEditor` | `components/editor/sectionEditor/SectionedBlockEditor.tsx` | N 个独立 TipTap 实例（每 ~30 块一段） | 大文档（解决输入卡顿） |

两者共用同一套 TipTap 扩展和 `tiptapAdapter` 数据转换层，store 侧的 `Block[]` 格式完全一致。

### 数据流（tiptapAdapter 是唯一转换源）

```
store.activeDoc.blocks  →  ourBlocksToTiptapJSON()   →  editor.commands.setContent()
editor.getJSON()        →  tiptapJSONToOurBlocks()   →  store.setActiveDocBlocks()
```

- `lib/editor/tiptapAdapter.ts` 是 `Block[]` ↔ TipTap `JSONContent[]` 的**唯一**双向转换源。块类型映射、RichText 标注（bold/italic/code/color/href）↔ TipTap marks、表格/列表/待办/折叠块的嵌套结构都在这里。
- 编辑器加载内容用 `setContent(content, { emitUpdate: false })`，**不触发 onUpdate**，store 的 `activeDoc.blocks` 不会被同步——只有用户编辑后 debounce flush 才会写回 store。

### SectionedBlockEditor 分段策略

- 大文档按 `SECTION_SIZE=30` 切分为多个 `SectionEditor`，每个是独立 ProseMirror 实例。按键只重排当前 ~30 块的 section，不触发整文档重排。
- **渐进挂载**：`visibleCount` 从 0 开始，通过 `requestIdleCallback` 分批挂载（每批 2 个），避免大文档一次性创建 N 个 ProseMirror 实例阻塞主线程。
- **内容同步**：`SectionEditor` 编辑后 debounce 300ms → `handleSectionChange` → 更新 `sectionsRef.current[idx].blocks` + `setActiveDocBlocks(full, docId)`。
- `setActiveDocBlocks` 有 **ownership guard**：`docId !== activeDoc.id → return`，防止切换文档时把旧文档编辑写到新文档。
- **SectionOutline 大纲**用双源合并：store `activeDoc.blocks`（覆盖未挂载 section）+ mounted editors 的 ProseMirror doc `descendants()`（覆盖 store 过期场景），按 id 去重。

### ⚠️ 文档切换 flush 的时序陷阱（曾导致严重数据丢失）

`SectionedBlockEditor` 切换文档时，必须把 outgoing doc 的 pending 编辑保存下来（否则被 ownership guard 丢弃）。flush 逻辑在 load effect（passive effect）里调 `flushBlocksToDoc(outgoingDocId, full)`。

**铁律：flush 必须读 `sectionsRef.current` 的 `s.blocks`，绝对不能读 `editor.getJSON()`。**

曾导致 bug 的原因（07-08 引入、07-09 修复）：

1. 切换文档时 `key=${activeDocId}:${s.id}` 变化 → React 卸载旧 SectionEditor、挂载新的
2. 新 editor 初始内容是**空 paragraph**，真正 `setContent` 被推迟到 `setTimeout(0)`（macrotask）
3. 父组件 load effect（passive effect）早于子的 `setTimeout(0)` 执行
4. 此时 `ed.getJSON()` 返回空，`tiptapJSONToOurBlocks` 转成单个空文本块
5. `flushBlocksToDoc(outgoingDocId, [空块])` 把原文档完整内容覆盖成空块 → **数据丢失**

`s.blocks` 是安全的：`SectionEditor` 的 unmount cleanup 在 commit 阶段（同步，早于 passive effect）已把 pending 编辑经 `handleSectionChange` 同步进 `sectionsRef.current[idx].blocks`；无 pending 编辑时它是初始值（= store 完整内容）。

> **对比**：`BlockEditor` 是单 editor 实例，切换时 editor 不卸载，`getJSON()` 读到的是真实内容，且有 pending guard（无编辑不 flush），所以不存在此问题。跨组件读 imperative state 前必须确认 React effect 时序，优先用已被 cleanup 同步过的 ref/state。

### 块类型

| 我们的 BlockType | TipTap 节点 | 说明 |
|-----------------|------------|------|
| `text` | `paragraph` | 普通段落 |
| `heading-1/2/3` | `heading` (attrs.level) | 标题 |
| `quote` | `blockquote` | 引用（含一个 paragraph） |
| `code` | `codeBlock` | 代码块（attrs: language/width/height 等） |
| `image` / `file` / `link` / `diagram` | `image` / `fileBlock` / `linkBlock` / `diagramBlock` | 媒体/附件/链接卡片/画图（atom 节点） |
| `table` | `table` | 表格（嵌套 tableRow/tableCell/tableHeader） |
| `bullet-list` / `ordered-list` | `bulletList` / `orderedList` | 列表（嵌套 listItem，支持多级缩进） |
| `todo-list` | `taskList` | 待办（taskItem attrs.checked） |
| `divider` | `horizontalRule` | 分割线（atom） |
| `collapsible` | `collapsible` | 折叠块（attrs.open/summary，content 为子节点 JSON） |

### Notion 风格键盘行为

| 按键 | 行为 |
|------|------|
| `Enter` | 在下方新建块 / 块内换行（依上下文） |
| `Shift+Enter` | 块内软换行（hardBreak） |
| `Backspace`（块首） | 与上一个块合并 |
| `ArrowUp`（首行） | 跳到上一个块（或标题） |
| `ArrowDown`（末行） | 跳到下一个块 |
| `Cmd/Ctrl+B/I` | 粗体 / 斜体 |
| `/` | 唤出 Slash 菜单 |
| `# ` / `## ` / `### ` | Markdown 快捷转换为标题 |

## 编码规范

### 前端

1. **禁止组件直接调用 `invoke`**：所有 Tauri IPC 必须通过 `lib/storage.ts` 的 `storage` 对象。
2. **Store 操作通过 slice**：新增状态/方法时，判断属于哪个 slice（documents / editor / ui），在对应 slice 文件中添加，并在 `storeHelpers.ts` 的 `StoreState` 接口中声明类型。
3. **块组件只做展示**：文本块不处理自己的键盘事件，所有编辑逻辑在 `useSurfaceEditor` 中统一处理。
4. **Tailwind CSS v4**：使用 CSS 变量 `var(--vscode-*)` 保持与 VSCode 主题一致，不要硬编码颜色值。**多主题适配要点**：
   - 项目有 **4 个主题**（JStudio Light/Dark、Ink Light/Dark），每个主题的配色完全不同（如 `widget-border` 在不同主题下是 `#E5E5E5`、`#313131`、`#ddd4c8`、`#2f334d`）。
   - 主题定义在 `lib/themes/` 目录（`types.ts` + 4 个主题单文件 `jstudio-light/dark.ts`、`ink-light/dark.ts` + `registry.ts` + `index.ts` barrel），运行时通过 `applyAppTheme()` 将颜色注入到 CSS 变量。
   - **所有颜色相关样式必须用 CSS 变量**，如 `var(--vscode-widget-border, #E5E5E5)`，fallback 值作为默认兜底。
   - **不要用 `.dark` 类区分主题**：`.dark` 只区分 light/dark 模式，无法区分同模式下不同配色（如 Ink Light 与 JStudio Light 都是浅色，但边框颜色不同）。
   - 正确示例：`border: 1px solid var(--vscode-widget-border, #E5E5E5)` → 自动适配所有主题。
   - 错误示例：`.dark` 下写 `border-color: #3C3C3C` → 只适配了 JStudio Dark，Ink Dark 的边框是 `#2f334d`（紫色调），会不一致。
   - **Tailwind 任意值类禁止嵌套 `var()` fallback**：`border-[var(--vscode-menu-border, var(--vscode-widget-border))]` **不会被 Tailwind v4 编译成 CSS 规则**（嵌套括号导致解析失败），该 `border-color` 类不存在 → 浏览器回退到 `currentColor`（文字色）→ dark 主题下文字近白，边框显示为"白色框"。正确写法用单变量 `border-[var(--vscode-menu-border)]`（项目主题变量在所有 4 主题 + `:root` + `.dark` 都有定义，无需 fallback）。注意：**CSS 原生规则**（`vscode-theme.css` 里的 `var(--a, var(--b))`）不受此限制，可保留 fallback。排查存量：`grep -rn '\[var(--vscode-[a-z-]*,\s*var(--vscode-' src/`。
   - **三层边框语义**（醒目度从高到低，新增浮窗组件须遵守）：`menu-border`（浮窗/弹窗/菜单：斜杠菜单、气泡菜单、下拉、对话框、Toast 等一切"浮在内容之上"的临时面板）> `block-border`（内容块：代码块外框、表格网格线）> `widget-border`（内嵌分隔/静态卡片：设置页分隔线、卡片轮廓）。背景同理：浮窗统一用 `menu-background`，勿混用 `quickInput-background`/`editorWidget-background`/`editor-background`。主题色值定义见 `lib/themes/` 各主题单文件，静态默认值（仅 jstudio-light/dark）见 `vscode-theme.css` 的 `:root`/`.dark`。
5. **非受控 DOM**：surface 内的 DOM 内容由浏览器管理，React 不在元素聚焦时重写 `innerHTML`。
6. **图标**：使用 `lucide-react`，图标大小统一用 `w-4 h-4` 或 `w-3.5 h-3.5`。
7. **路径别名**：`@/*` 映射到 `src/*`（tsconfig 配置），但项目中主要使用相对路径导入。
8. **复用 UI 公共组件，不要重复造样式**：新增任何浮层 UI（菜单、下拉、上下文菜单等）之前，**先检查 `components/ui/` 下是否已有对应组件**。如果已有，直接引用；如果没有，先提取为公共组件再使用。详见下方「UI 组件复用规范」。
9. **列表选中项高亮只用单一状态驱动，禁止 CSS `:hover`**：命令面板、斜杠菜单等"鼠标 + 键盘双模式选择"的列表，选中高亮**只能**由一个状态变量（如 `selectedIndex` / `activeIndex`）驱动。鼠标 hover 通过 `onMouseEnter={() => setSelectedIndex(index)}` 更新该状态，键盘方向键也更新同一状态。**禁止**在非选中行上使用 CSS `:hover` 伪类（如 `hover:bg-*`）作为高亮手段——否则鼠标物理位置所在行会与键盘选中行同时出现高亮。正确做法参考 `SlashMenuList`（`lib/tiptapExtensions.tsx`）和 `CommandPalette`（`components/CommandPalette.tsx`）。
10. **视觉令牌统一在 `vscode-theme.css`，不要 inline 写死样式**：圆角、组件间距、阴影、卡片边框等"跨组件需要保持一致"的视觉属性，统一在 `src/styles/vscode-theme.css` 里以类选择器定义（如 `.code-block-figure`、`.tableWrapper`）。当某组件的视觉要和其它组件对齐（例如让代码块圆角与表格一致）时，**改 CSS 里的令牌**，不要往 TSX 加 `style={{ borderRadius: ... }}`。例：代码块 `.code-block-figure` 与表格 `.tableWrapper` 的外圆角都应是 `16px`，改动时两处一起调、保持单一事实来源。inline 只用于真正动态的值（如尺寸拖拽）。

### Rust 后端

1. **命令注册**：新增 `#[tauri::command]` 后，必须在 `src/lib.rs` 的 `generate_handler!` 中注册。
2. **错误处理**：所有命令返回 `Result<T, String>`，用 `.map_err(|e| e.to_string())` 转换。
3. **路径辅助函数**：路径 helper 统一收敛在 `commands/storage/paths.rs`（`jdata_dir()` / `studio_dir()` / `documents_dir()` / `doc_dir()` 等），全后端唯一源头。`db.rs`、`bundle.rs` 等都 `use crate::commands::storage::paths::{...}` 复用，不要在各命令文件里重复定义。
4. **避免 `unused_variables` 警告（也往往是更合理的设计）**：如果一个值只在某个块（block）内部使用，就不要把它解构/绑定到外层作用域。例：`link_tabs` 里 `ui_height` 只用来在块内算 `content_height`，原本写成 `let (ui_height, content_width, content_height) = {...}` 会触发 warning；正确做法是从返回元组剔除 `ui_height`，让它在块内 `let ui_height = m.ui_height` 局部生效。此外，如果一个值本应从"最新状态"实时读取（如 `show_tab` 每次都重新 `lock()` 取 `m.ui_height`），就不要复用别处算好的旧快照——局部现取始终最新，避免过期值。`cargo build` 默认把 `#[warn(unused_variables)]` 显示为 warning（不阻断 build，但应保持 clean）。

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

## 国际化（i18n）规范

> 文件：`src/lib/core/i18n.ts`。**这是构建门禁最易触发的区域之一**——`t()` 的形参是 `TranslationKey`（严格字面量联合类型），任何类型不匹配都会让 `npm run build` 的 tsc 阶段失败。

### 核心机制

- 两个字典 `zh` 和 `en`，都用 `as const` 声明。
- `export type TranslationKey = keyof typeof translations.zh;` —— **联合类型只取自 `zh` 块**。新增 key 必须先在 `zh` 写入，才会成为合法的 `TranslationKey`。
- `useI18n()` 返回 `{ t, language }`（`language` 为 `'zh' | 'en'`，来自 Zustand UI slice）。组件用 `t('some.key')` 取值，语言切换时自动重渲染。
- `t(key, vars?)` 支持占位符：`t('doclist.batchSelected', { count: 5 })` 会替换 `{count}`。占位符替换由导出的 `interpolate()` 完成。
- **回退规则**（重要）：`t()` 的实现是 `dict[key] ?? translations.zh[key] ?? key`。如果某 key 只在 `zh` 写了、`en` 漏写，`dict[key]`（en）为 `undefined`，会**静默回退到中文**——英文界面显示中文，且不报任何错误。

### 硬性规则

1. **新增 key 必须 zh、en 同时写。** 漏写 en 不会触发 TS 报错，但会在英文模式下显示中文（静默 bug）。写完用 `npx tsc --noEmit` 确认，并人工核对英文字符串。
2. **禁止重复 key。** 同一字典内重复定义同一 key 会触发 `TS1117`（Duplicate identifier）。i18n.ts 历史上曾因 `// ── PreviewWindow ──` 与 `// ── Preview Window ──` 两块重复定义 `preview.*` 而构建失败——新增 key 前先 grep 确认没有已存在的同名 key。
3. **key 命名用点分前缀，按功能分组**：`pdf.*`、`code.*`、`image.*`、`preview.*`、`palette.*`、`linkPreview.*`、`mermaid.*`、`doclist.*`、`error.*` 等。新增一组功能时沿用已有前缀，不要造新前缀。
4. **`interpolate` 必须保持 `export`。** `ErrorBoundary`（class 组件）无法用 hook，自己实现了 `t`，依赖这个导出函数。改 i18n.ts 时不要去掉它的 `export`。
5. **class 组件的国际化**：class 组件拿不到 `useI18n()`，参考 `ErrorBoundary.tsx`——导入 `interpolate`，在类内部用 `translations[lang][key]` 自行实现 `t`。

### 编译期校验映射表（推荐模式）

当把"外部字符串 → i18n key"做映射时（例如斜杠菜单命令标题），**把 value 类型标注为 `TranslationKey`**，这样 TS 会在编译期校验每个 key 确实存在：

```ts
import { useI18n, type TranslationKey } from '../../core/i18n';

const SLASH_I18N_KEYS: Record<string, { title: TranslationKey; description: TranslationKey }> = {
  'Heading 1': { title: 'slash.heading1', description: 'slash.heading1Desc' },
  // 若某个 key 拼错或在字典里漏掉，这里会立刻 TS 报错
};
```

（示例见 `src/lib/editor/slashMenu/SlashMenuList.tsx`。）

### 接 i18n 的标准流程

1. 先在 `i18n.ts` 的 `zh` 和 `en` 两块里各加 key（同一前缀、同一含义）。
2. 在组件里 `import { useI18n } from '../../core/i18n'`，调用 `const { t } = useI18n()`。
3. 把硬编码中/英文字符串替换为 `t('your.key')` 或 `t('your.key', { var })`。
4. 运行 `npx tsc --noEmit` 确认零错误。

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

### 类型检查是构建门禁

- `tauri.conf.json` 的 `beforeBuildCommand` 是 `npm run build`，而 `npm run build` 会先跑 `tsc` 严格类型检查。**任何 TS 错误都会让 `npm run build` 非零退出，进而 `tauri build` / `make` 失败**（`Found N errors. beforeBuildCommand ... failed`）。
- 因此：**完成任何改动后，先跑 `npx tsc --noEmit`（或 `npx tsc --noEmit -p tsconfig.app.json`）确认 0 错误，再宣布完成。** 不要只靠"运行时没报错"判断。
- 前端改动若涉及 i18n、类型映射、跨文件签名，尤其容易漏过 `tsc`——参见上方「国际化（i18n）规范」。
- Rust 侧：`cargo build` 会把 `#[warn(unused_variables)]` 等输出为 warning（不阻断 build，但应保持 clean，见 Rust 编码规范第 4 条）。
