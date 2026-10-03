# Design

## Context

壳层已是 Electron（main / preload / renderer，见 `electron/`），但渲染层保留着 Tauri 兼容层：

- `desktop/src/lib/core/tauriShim/`（8 文件：core / event / window / webviewWindow / plugin-dialog / plugin-clipboard-manager / plugin-opener / native），44 个渲染层文件以 `@tauri-apps/*` 路径 import，经 `vite.config.ts` alias 无条件落到 shim，运行时委托 `window.jstudioNative`（`electron/preload.ts` 注入）。
- 窗口拖拽是"双壳桥梁"：`vscode-theme.css:4579` 用属性选择器把 `data-tauri-drag-region`（含 `"false"` opt-out）映射成 `-webkit-app-region: drag / no-drag`。属性语义来自已死的 Tauri 脚本，opt-out 规则（最近祖先命中）不直观，已实际造成标题栏图标点击被吞且难以排查。
- Tauri 习语残留：`tauri://created|error|destroyed` 生命周期事件（shim 的 window/webviewWindow 模块派发）、`toTauriAccelerator`（`keyboardShortcuts.ts`）、`getCurrentWindow` 等 Tauri 命名。

## Goals / Non-Goals

**Goals:**

- 渲染层平台调用收敛到自有模块 `src/lib/platform/*`，`@tauri-apps/*` 与 vite alias 彻底消失，并加防回归 guard。
- 拖拽区改为纯 CSS 声明（`.drag-region` / `.no-drag`），删除属性映射桥与注入语义；顺带以确定性 CSS 修复标题栏图标点击问题。
- `tauri://*` 事件更名、accelerator 函数更名，行为不变。
- 全程用户可见行为零变化（spec 红线）。

**Non-Goals:**

- 不动 `electron/backend/`（Node sidecar）、`src-tauri/`（Rust agent 宿主）、`electron/browserTabs.ts` 的实现与协议。
- 不改 `invoke` 命令面、事件通道名、`jstudio-asset://`、多窗口机制。
- 不引入新依赖。

## Decisions

### D1：shim 重命名为 `src/lib/platform/*`，调用点直接改 import（不留 alias）

- 8 个文件按职责更名：`core.ts→invoke.ts`、`event.ts→events.ts`、`window.ts→window.ts`、`webviewWindow.ts→webviewWindow.ts`、`plugin-dialog.ts→dialog.ts`、`plugin-clipboard-manager.ts→clipboard.ts`、`plugin-opener.ts→opener.ts`、`native.ts→native.ts`；桶文件 `index.ts` 分域再导出。
- 44 个调用点机械替换：`@tauri-apps/api/core` → `lib/platform`（invoke/convertFileSrc）、`@tauri-apps/api/event` → `lib/platform`、`@tauri-apps/api/window` / `api/webviewWindow` → `lib/platform`、`@tauri-apps/plugin-dialog` → `lib/platform`（open/save）、`@tauri-apps/plugin-clipboard-manager` → `lib/platform`（clipboard 分域）、`@tauri-apps/plugin-opener` → `lib/platform`（opener 分域）。
- 删除 `vite.config.ts` 的 alias 与 `resolve.conditions` 相关残留。
- 备选"保留 alias、只改 shim 内容"被否：import 路径继续说谎（写着 tauri 实为自有层），认知成本正是本次要消除的。

### D2：拖拽区从"属性 + 映射桥"换成显式 CSS 工具类

- 新增 `.drag-region { -webkit-app-region: drag; }`（放入 `index.css`，与既有 `.no-drag`（line 61）并列）；删除 `vscode-theme.css:4579` 的属性映射桥整块。
- 迁移映射（实施期修正：drag 收敛为"每窗口单一 drag 根"，消除区域重覆盖）：
  - `AppTitleBar.tsx`：**仅 bar 根** `.drag-region`（全宽覆盖，子元素一律不加——Chromium 按 DOM 先序累加可拖拽矩形，drag 加 / no-drag 减；若后序兄弟（如 inset-x-0 全宽 center slot）再带 drag，会把先序 no-drag（左侧图标组）刚减掉的面积加回去，导致点击静默失效。这正是迁移前"点击被吞" bug 的最终根因）。
  - `TabBar.tsx`：titlebar 模式胶囊 `.no-drag`（保留 `pointer-events-auto`，机制已被生产验证）。
  - `BrowserTabStrip.tsx`：根不再自带 drag（bar 已覆盖）；tabs/new-tab `.no-drag`。
  - `ChildWindowDragBar.tsx`、`DiagramWindowApp.tsx`：子窗口无 bar 根，拖拽条自身 `.drag-region`（无重叠兄弟，安全）。
  - `DocumentSidebar.tsx`：headerActions 组 `.no-drag`（同时修复其点击被吞问题）。
  - 收尾以 `rg data-tauri-drag-region desktop/src` 清零为准（CODEBUDDY.md 等文档类提及不改）。
- 备选"保留 data 属性、仅修桥的语义"被否：命中规则仍是非显式行为，同类 bug 还会再来；显式类是 Electron 的第一公民，问题可直接从 CSS 定位。

### D3：生命周期事件更名，派发点不变

- `tauri://created|error|destroyed` → `jstudio://window-created|window-error|window-destroyed`；派发逻辑在 platform 的 window/webviewWindow 模块内（原 shim 同位置），只改事件名与消费方（`lib/windows/*.ts` 的 detach/preview 模块、`diagramWindow.ts`）。
- 主窗口 `window-closed`、`native-command` 等业务事件名不变。

### D4：accelerator 转换函数更名

- `toTauriAccelerator` → `toElectronAccelerator`，函数体不动（"mod+shift+f" → Electron 菜单加速器形态）；更新 `keyboardShortcuts.ts` 内部与调用方（`App.tsx`、`electron/menu.ts` 若有镜像命名）。

### D5：防回归 guard

- 在 lint 流程追加三个 grep 断言（`npm run lint` 内或独立 script）：`src/` 中 `@tauri-apps`、`data-tauri-drag-region`、`tauri://` 零命中（注释也计）。这是"化石路径"不再复活的机制保障。

## Risks / Trade-offs

- **拖拽热区遗漏 → 元素从可点变拖窗口**：逐点映射表（D2）+ 手工点击清单（tasks 验收节）兜底；`.no-drag` 需落在与 `.drag-region` 相邻的交互容器上，样式链路与 TabBar 胶囊同构（生产验证过的形态）。
- **`hiddenInset` 子窗口依赖渲染层拖拽条**：`ChildWindowDragBar` 迁移后需在 预览/文档/终端/图表 四类子窗口逐一手测拖动与关闭。
- **事件更名遗漏消费方**：`rg "tauri://"` 清零 + 图表窗口关闭→轮询停止的手测。
- **改名的机械替换噪声大**：44 文件纯机械、可一次性完成并依赖 tsc 兜底；不引入行为 diff。

## Migration Plan

一次性切换（用户已拍板）：分支上按 D1→D5 顺序推进，每步 tsc + 冒烟；全部完成后按 tasks.md 验收清单手工过一遍标题栏/子窗口/浏览器面板，期间 Tauri 时代的最近可用构建保留作对照。回滚策略 = git revert（无数据/格式迁移）。

## Open Questions

（无——Rust agent 宿主去留已由既有决策锁定为保留；本变更不触及其面。）

## 实施期修正：header actions 回迁侧边栏（用户拍板）

标题栏 placements（slot portal / 直接 JSX）在 Electron `hiddenInset` 下被原生
draggable-region 命中表吞掉物理点击（CDP 合成点击绕过原生表所以一直"看起来能用"），
多轮修复（属性 opt-out / CSS 类 / 单一 drag 根 / 首帧定位 / 按钮级 no-drag）均未
在物理点击上生效。最终按用户决定放弃标题栏 placement：

- 三个图标（搜索/固定/更多）回迁**侧边栏内部**的 header 行——目录树/文档大纲切换行
  下方（embedded）或侧边栏首行（standalone，mt-9 让位标题栏）。行首显示版本标识
  `JStudio v{__APP_VERSION__}`。侧边栏内部无拖拽区域，点击是普通 DOM 点击。
- 标题栏恢复为纯拖拽空间（仅 bar 根 `.drag-region`）。
- `SidebarHeaderButtons` 组件承载三键 + 更多菜单 + TrashDialog，由 DocumentSidebar
  直接渲染；`titlebarSlot` 的 left slot 注册器删除（center slot 保留）。
- 教训：`hiddenInset` 窗口的标题栏内放置交互元素时，原生 draggable-region 表与
  渲染层 computed style 可能不一致（CDP 合成点击绕过原生命中表，无法作为验证手段），
  交互控件应优先放在非拖拽区域。
