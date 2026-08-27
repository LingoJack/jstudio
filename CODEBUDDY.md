# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## 项目概览

JStudio 是一款离线优先、Notion 风格的本地笔记桌面应用，基于 **Electron（Chromium）+ Rust sidecar** 构建。所有数据存储在本地 `~/.jdata/studio/`（SQLite + 文件系统），无云端同步。

`jcli/` 是 git submodule（即 `j` CLI）。JStudio 通过 `jcli/j-agent`（Rust）集成应用内 Agent 聊天功能。

## 常用命令

| 任务 | 命令 |
|------|---------|
| 开发模式（Electron + Vite 热重载，端口 1420） | `make dev` 或 `npm run electron:dev` |
| 构建生产应用（.app/.dmg） | `make build` 或 `npm run electron:build` |
| 安装到 `/Applications`（macOS） | `make install` |
| 格式化全部代码 | `make fmt`（执行 `cargo fmt` + prettier check） |
| Lint（TS + Rust clippy） | `make lint` |
| 提交前检查门（fmt + lint + test） | `make pre-commit` |
| 仅 Rust 检查 | `make check-rust`（cargo check） |
| TypeScript 类型检查 | `npm run lint`（tsc -b）/ `npm run lint:tsc`（tsc --noEmit） |
| 死代码 / 未使用导出检查 | `npm run knip` |
| 前端测试 | `npm run test:shortcuts` 和 `npm run test:cursor` |
| Rust 测试 | `cd src-tauri && cargo test` |
| sidecar 协议冒烟（含 stdout 静默断言） | `npm run test:sidecar` |
| 递增 patch 版本号（同步 3 个文件） | `make bump-version` |
| 设置指定版本号 | `make set-version V=1.2.3` |

测试使用 Node 内置 test runner 通过 `tsx --test`（无 Jest/Vitest）。运行单个测试文件：

```bash
npx tsx --test src/lib/shortcuts/keyboardShortcuts.test.ts
```

`make help` 列出所有可用 Make 目标。

## 架构

### 三层进程模型（Electron 壳 + Rust sidecar）

- **Electron main**（`electron/*.ts`，esbuild 编译到 `dist-electron/`）— 窗口、macOS 菜单、对话框、`jstudio-asset://` 协议、globalShortcut、WebContentsView 浏览器面板、sidecar JSON-RPC 桥。`window.rs`/`menu.rs`/`link_tabs.rs` 时代替品。
- **Rust sidecar**（`src-tauri/`，bin `jstudio-sidecar`）— 全部业务后端：SQLite、PTY 终端、j-agent 集成、链接元数据 HTTP、`.jnote` bundle。经 **stdio 换行 JSON-RPC** 与 main 通信（方法名与旧 Tauri 命令一致）。`src-tauri/src/bin/sidecar.rs` 是唯一的派发表。
- **前端**（`src/`）— React 19 + TypeScript（strict）+ Vite 6 + Tailwind v4 + Zustand。TipTap v3 / ProseMirror 编辑器是最大的子系统。

**硬约束：sidecar 的 stdout 专属协议，一切日志走 stderr**（`scripts/sidecar-smoke.mjs` 有静默断言守卫）。

### IPC 边界 — `src/lib/core/ipc.ts` 是唯一闸口

前端代码禁止直接调用 `invoke()`。所有后端调用必须经过 `src/lib/core/ipc.ts`，该模块导出一个带类型的 `ipc` 对象，每个方法对应一个 sidecar 方法。`@tauri-apps/*` 导入名是历史遗留 —— vite alias（`vite.config.ts`）与 tsconfig paths（根 `tsconfig.json`）把它们重定向到 `src/lib/core/tauriShim/`（Electron 桥：contextBridge → main → sidecar / 窗口操作 / 对话框 / 剪贴板）。窗口/菜单/devtools/浏览器面板类方法在 `electron/main.ts` 的 `handleMainOnly` 拦截，不进 sidecar。Rust 命令返回 `Result<T, String>`。

### 编辑器 — 分段式 ProseMirror

编辑器（`src/components/editor/sectionEditor/`）将每个文档切分为约 30 块一段（`SECTION_SIZE`，见 `lib/editor/sectioning.ts`），每段拥有独立的 ProseMirror 实例（`SectionEditor.tsx`）。这是为修复 WebKit 中 232KB contenteditable 卡顿的性能方案 —— 一次按键只重排当前段。`DocumentPanel.tsx` 是编排器；块级操作按文档 id 为 key 做 500ms 防抖（见 `store/storeHelpers.ts`），再重新拼装成完整 `Block[]` 写回 store。文档切换时重新分段，不做实时再均衡。

已知限制：不支持跨段选择 / Cmd+A / 跨段复制粘贴。

### 数据适配器 — `lib/editor/tiptapAdapter/`

JStudio `Block[]` 格式（`types/document.ts`）与 TipTap `JSONContent[]` 之间互相转换的唯一事实源。文件按关注点拆分：`blocks.ts`（主体）、`richText.ts`（行内）、`table.ts`、`list.ts`、`todo.ts`。编辑器与 store 互不知道对方的表示形式。

### 块类型 — 5 层新增流程

新增一个块类型需触及全部 5 层（参见 `docs/how-to-add-block-type.md` 的完整示例）：
1. `src/types/document.ts` — `BlockType` 联合类型 + `BlockProperties` 字段（字段名以块类型为前缀，如 `collapsible*`）
2. `src/lib/editor/extensions/` — TipTap `Node` 定义 + 命令
3. `src/components/editor/nodes/` — React NodeView 组件
4. `src/lib/editor/tiptapAdapter/blocks.ts` — Block ↔ TipTap JSON 双向转换
5. 在 section editor extensions + slash menu（`lib/editor/slashMenu/`）中注册

### 画板块

两套并存引擎共享同一个 `properties.diagramSnapshot` 字符串通道。`kind: 'jgraph'` magic key 选中自研 maxGraph 格式（`components/editor/nodes/graph/`）；其他可解析为 JSON 的内容回退到 Excalidraw。检测逻辑位于 `nodes/graph/graphSnapshot.ts`。Mermaid 导入会将 flowchart/sequence 语法转换为 jgraph 节点。

### 状态 — Zustand slice 模式

`src/store/useStore.ts` 将 12 个 slice（documents、init、trash、importExport、editor、ui、terminal、toast、folders、workspace、agent、browser）组合为一个 store。每个 slice 是 `createXxxSlice(set, get)` 函数，返回 `Partial<StoreState>`。完整接口在 `src/store/storeHelpers.ts`。订阅优先使用 `src/store/selectors.ts` 中的选择器 —— 始终订阅原始值/布尔值，不要订阅对象引用，避免每次防抖内容更新都触发编辑器重渲染。Slice 职责记录在 `useStore.ts` 顶部的注释块中。

按文档 id 为 key 的保存定时器（`storeHelpers.ts`）确保在防抖窗口内切换文档不会丢失待写编辑。

### 多窗口架构

`src/main.tsx` 根据 `?window=` 查询参数分发到以下根组件之一：主窗口 `App`、`DocumentWindowApp`、`TerminalWindowApp`、`DiagramWindowApp`、`PreviewWindowApp`、`CommandPaletteWindowApp`、`LinkPreviewTabsWindowApp`。Knip 入口（`knip.json`）枚举这些 `*WindowApp.tsx` 文件。detach 载荷经 `commands/detach.rs` 的进程内邮箱命令传递（走 sidecar）。主窗口关闭按钮在 `electron/main.ts` 拦截并向 JS 发送 `window-close-requested` 事件；子窗口直接关闭。

### macOS 菜单

`electron/menu.ts` 构建应用菜单；点击经 `routeNativeCommand` 路由到聚焦窗口（`native-command` 事件，payload 为命令 id 字符串，前端 commandRegistry 派发）。**Select All 必须保持 custom item**（原生 role 只会选中当前编辑宿主的一段，绕过编辑器的作用域 selectAll）；link-preview 窗口与内嵌浏览器面板的 Cmd+T/Cmd+W 在 main 侧直接操作 tab manager。退出链路：quit_app/Cmd+Q/Dock quit → `gracefulQuit`（先 `pty_kill_all` 再 stop sidecar 再 exit）。

## 数据存储

规范存储是 SQLite（`~/.jdata/studio/studio.db`，WAL 模式，全局唯一 `Mutex<Connection>` 在 `src-tauri/src/db/connection.rs`）。所有 DB 访问通过 `db::db()` 进行。Schema 位于 `src-tauri/src/db/schema.rs`，通过 `ensure_column` 实现增量迁移。

数据表：`documents`（元数据 + `body` 列）、`folders`、`settings`（key/value，JSON 字符串值）、`deleted_documents`（墓碑）、`trashed_assets`（按文档的资源回收站）。

文件系统仅存二进制与备份：`documents/{docId}/assets/`（图片）、`documents/{docId}/.backups/`（写前快照）、`documents/{docId}/.trash/`（回收资源）、以及遗留 `document.json`（回退路径 / 迁移源）。

启动时 `connection.rs::open_and_init` 执行流程：建 schema → `migrate_from_json`（一次性导入遗留 `index.json`/`folders.json`/`settings.json`，重命名为 `*.json.bak`）→ `reconcile_orphan_documents`（扫描 `documents/` 找回未注册到 DB 的文件夹，跳过已墓碑的 id 与全空文档）→ `migrate_document_bodies`（从 `document.json` 回填 `body` 列）。

## 分层规则（`docs/architecture.md`）

- `src/lib/` = 逻辑层（纯函数、store 适配器、tiptap 扩展、转换、主题、快捷键、i18n、常量）。不允许放业务组件。
- `src/components/` = 视图层（所有 React 组件）。
- 依赖方向单向：`components/` → `lib/`。`lib/` 禁止从 `components/` 导入业务组件。
- 唯一例外：与 suggestion 插件紧绑定的 TipTap 扩展 UI（如 `lib/editor/slashMenu/SlashMenuList.tsx`）可放在 `lib/editor/`。
- 文件大小红线：> 400 行（组件）/ > 500 行（逻辑）应拆分。提交前运行 `npm run knip` 检查未使用导出。

## 约定

- 命令命名：Rust 侧 `snake_case`，TS 侧通过 `ipc.<camelCaseMethod>` 调用。结构体参数命令（`pty_create`/`agent_send_message`/`agent_tool_result`/`ai_graph_fetch`）的参数按 Tauri 旧约定以参数名包装（`{ params: {...} }` / `{ request: {...} }`），sidecar 派发表按名解包。
- 块属性字段以块类型为前缀（如 `codeWidthPct`、`collapsibleOpen`、`diagramSnapshot`）。
- 遗留基于 px 的尺寸（`width`、`height`）保留以向后兼容；新代码优先使用百分比变体（`widthPct`、`heightPct`）。
- 主题：使用 Tailwind v4 + `src/styles/vscode-theme.css` 中的 VSCode 风格 CSS 变量。禁止硬编码颜色。
- Rust：所有命令返回类型为 `Result<T, String>`。新增 sidecar 方法需在 `src-tauri/src/bin/sidecar.rs` 的 dispatch match 注册 **并** 在 `src/lib/core/ipc.ts` 添加带类型方法。
- 窗口拖拽：元素标 `data-tauri-drag-region`（Electron 经 `vscode-theme.css` 的映射规则转成 `-webkit-app-region: drag`）；拖拽区域内的可交互浮层必须显式加 `.no-drag`。
- Patches：`patches/prosemirror-view+1.41.9.patch` 修复了代码块内 lowlight decoration 的光标定位 bug（源自 WKWebView 时代，Chromium 下暂保留）。通过 `patch-package`（`postinstall` 钩子）应用。
- Vite manual chunks 将重型 vendor（excalidraw、mermaid、cytoscape、katex、mammoth）拆分为独立 bundle。
- 禁止 emoji：代码、注释、commit message、UI 文案中绝不使用 emoji。UI 文案面向用户，必须保持纯文本。
- 禁止魔法值：带语义的字面量（阈值、超时、尺寸、ID、key、颜色、类枚举字符串）必须命名为常量，放在 `src/lib/constants/`（或功能就近的 `constants.ts`）。不直观的内联数字/字符串是坏味道 —— 抽取它们。`lib/editor/sectioning.ts` 中的 `SECTION_SIZE` 和 `nodes/graph/graphSnapshot.ts` 中的 `kind: 'jgraph'` magic key 是规范模式。
- 文件结构：遵循上述 `lib/` 与 `components/` 分层。按功能而非类型分组 —— 功能的 logic、types、constants 就近共置。超过大小红线（> 400 行组件 / > 500 行逻辑）的文件需拆分。功能目录优先使用 barrel `index.ts`。

## 关键入口

| 文件 | 职责 |
|------|------|
| `src/main.tsx` | 根挂载；按 `?window=` 分发多窗口 |
| `src/App.tsx` | 主窗口布局（title bar、activity bar、sidebar、tabs、editor、terminal、agent、settings） |
| `src/lib/core/ipc.ts` | **唯一** 后端 IPC 表面（带类型的 `ipc` 对象） |
| `src/lib/core/tauriShim/` | `@tauri-apps/*` → Electron 桥（invoke/event/window/dialog/clipboard/opener） |
| `electron/main.ts` | Electron 主进程：窗口/菜单/协议/快捷键/浏览器面板/事件总线 |
| `electron/sidecar.ts` | main ↔ Rust sidecar stdio JSON-RPC 桥 |
| `src-tauri/src/bin/sidecar.rs` | sidecar 入口 + 全部方法派发表 |
| `src/store/useStore.ts` | Zustand store 组合（12 个 slice） |
| `src/store/storeHelpers.ts` | `StoreState` 接口、防抖保存定时器 |
| `src/components/editor/sectionEditor/DocumentPanel.tsx` | 编辑器编排器 |
| `src/components/editor/sectionEditor/SectionEditor.tsx` | 每段一个 ProMirror 实例 |
| `src/lib/editor/tiptapAdapter/index.ts` | Block ↔ TipTap 转换 barrel |
| `src/lib/editor/sectioning.ts` | `SECTION_SIZE` / `splitIntoSections` |
| `src/types/document.ts` | `Block`、`BlockType`、`BlockProperties`、`Document` |
| `src-tauri/src/db/connection.rs` | 全局 SQLite `Mutex<Connection>` + 初始化流水线 |
| `src-tauri/src/db/schema.rs` | 表 DDL + `ensure_column` 增量迁移 |
| `src-tauri/src/commands/storage/mod.rs` | 存储命令模块（paths/documents/folders/settings/assets/backups/cache/markdown） |

## 陷阱

- 在父组件中订阅 `activeDoc`（对象引用）会导致 ProseMirror 光标卡顿 —— 订阅 `hasActiveDoc`（布尔值）或使用选择器。参见 `src/App.tsx:33-38` 的注释。
- 开发模式有意禁用 React `StrictMode`（`src/main.tsx:21`）—— React 19 的开发模式 DOM 遍历会在沙箱 iframe 上触发 SecurityError。
- 原生右键菜单在 `src/main.tsx` 全局禁用；需要自定义右键菜单的组件必须自行调用 `e.preventDefault()`。
- Electron `app-region: drag` 区域会吞掉命中区域内的点击 —— 拖拽区域内的可交互浮层必须加 `.no-drag`（参见 index.css）。
- sidecar 结构体参数命令的参数包装约定（`{ params: {...} }`）见「约定」节；漏包装会报 `missing field` 并导致功能静默空白（终端/Agent 曾中招）。
- `src-tauri/resources/bin/` 被 gitignore —— 打包时放入的 `j` 二进制不在仓库中。
- `jcli/` 是 submodule；Cargo workspace 通过 `path = "../jcli/j-agent"` 引用 `jcli/j-agent`。更新 `jcli` 需提交新的 submodule 指针。
- 历史：WKWebView 时代的怪癖记录在 `docs/bug-graveyard.md`（Cmd+Arrow 拦截、Live Text、232KB 卡顿等）；Electron 下部分 workaround 已无效但保留（分节编辑器、PM patch、imeCapsLockFix），待逐项验证后再删。
