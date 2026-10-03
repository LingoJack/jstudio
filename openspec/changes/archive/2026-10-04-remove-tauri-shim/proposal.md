# Proposal

## Why

GUI 壳已完成 Electron 迁移，但渲染层仍穿着 Tauri 的"戏服"：44 个文件以 `@tauri-apps/*` 路径 import，经 Vite alias 落到 `src/lib/core/tauriShim/` 兼容层；窗口拖拽用 shim 注入脚本模拟的 `data-tauri-drag-region` 判定（沿 DOM 回溯 + 字符串值 opt-out），语义不透明且已实际造成标题栏图标点击被吞的 bug；`tauri://*` 生命周期事件、`toTauriAccelerator` 等 Tauri 习语继续存在。这些兼容层没有存在的理由——运行时没有任何 Tauri 代码——却持续产生认知与调试成本。

## What Changes

- **拆除 `tauriShim` 兼容层**：渲染层 import 从 `@tauri-apps/api/*`、`@tauri-apps/plugin-*` 全部改为应用自有平台模块（`src/lib/core/tauriShim/` 重命名重组为 `src/lib/platform/*`，按 core / event / window / dialog / clipboard / opener 分域导出），删除 Vite alias，`@tauri-apps/*` 字样从源码消失。
- **窗口拖拽区原生化的 BREAKING（内部 API）**：`data-tauri-drag-region` + shim 注入脚本整套替换为 Electron 原生 CSS `-webkit-app-region: drag / no-drag`；删除注入的拖拽判定脚本。标题栏、标签条、侧边栏标题条等拖拽热区改用纯 CSS 声明。这直接消除"点击被拖拽区吞掉"一类问题。
- **生命周期事件去 Tauri 化**：`tauri://created` / `tauri://error` / `tauri://destroyed` 改为显式命名（`jstudio://window-created` 等），由 preload/main 直接派发；`getCurrentWindow()` 等 shim 面收敛为更薄的 `window.jstudioNative` 直通类型。
- **加速器转换更名**：`toTauriAccelerator` 更名为 Electron 语义（`toElectronAccelerator`，或并入菜单模块），行为不变（"mod+shift+f" → "CmdOrCtrl+Shift+F" 形态）。
- **不改变**：`invoke` 命令面（95 个命令名与语义）、事件通道名、`jstudio-asset://` 协议、多窗口 label/查询参数机制、BrowserPanel 的 WebContentsView 架构、PTY 数据流。全部用户可见行为不变。

### Non-goals

- **Rust agent 宿主 sidecar 保留不动**（`agent_*` 九法仍由瘦身后的 Rust sidecar 承载，是 2026-10-01 迁移时确认的共享引擎约束）。本变更只针对渲染层与壳层 Tauri 习语。
- 不引入自动更新、签名公证、跨平台打包。

## Capabilities

### New Capabilities

- `renderer-platform`: 渲染层平台接入层的行为契约——自有平台模块的模块面与职责、原生 CSS 拖拽区语义、窗口生命周期事件契约、平台类型来源；验收原则是删除 shim 后所有用户可见行为不变。

### Modified Capabilities

（无——`backend-runtime` 与 `preview-window` 的需求面不受影响。）

## Impact

- **修改（约 44 文件）**：`src/` 下所有 `@tauri-apps/*` import 点 → `src/lib/platform/*`（机械替换，调用形态不变）；标题栏系组件（`AppTitleBar`、`TabBar`、`BrowserTabStrip`、`DocumentSidebar`、`ChildWindowDragBar` 等）的拖拽属性 → CSS app-region。
- **重组**：`src/lib/core/tauriShim/` → `src/lib/platform/`（core/event/window/webviewWindow/dialog/clipboard/opener 分域文件相应更名）；`vite.config.ts` 删除 alias；`electron/preload.ts` 暴露面微调（若 shim 依赖其注入的拖拽脚本，则删除该脚本）。
- **删除**：`src/lib/core/tauriShim/` 目录、注入的拖拽判定脚本、`toTauriAccelerator` 命名。
- **不涉及**：`electron/backend/`（Node sidecar）、`src-tauri/`（Rust agent 宿主）、`electron/browserTabs.ts`、存储与文档格式。
- **风险**：拖拽热区从 JS 判定改为 CSS 后，原 `data-tauri-drag-region` 的每一处 opt-out（`=false`）都必须有对应的 `no-drag` 覆盖，遗漏处会从"可点"变"拖窗口"——需要逐点核对（清单见 design）。
