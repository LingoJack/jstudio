# 统一 Tabs 到 AppTitleBar

## 目标

把 `DocumentTabs` / `TerminalTabs` / `BrowserTabs` 三个 tab 栏统一为一个位于 `AppTitleBar` 内部的公用 tabs 区。同时：

- 加高 TitleBar，符合更丰富 UI 的容量需求（单行加高）。
- 废弃 `tabBarPosition` 设置（不再有 top/bottom 浮动位置）。
- 取消 Browser 用的独立 `tabbar-main` overlay webview，改为在主 window React 里正常渲染。
- 把 Browser 的地址栏 (`BrowserDynamicIsland`) 从 TitleBar 挪回 `BrowserPanel` 内部（作为 Browser panel 自身的一部分）。
- 在 TitleBar 中提供最多 3 个自定义 icon 槽（`trailingActions`），供不同视图（如 Terminal 的时钟历史按钮）扩展；这个槽位在 tabs 胶囊之外的 TitleBar 右侧独立区域。

## 现状

**AppTitleBar** (`src/components/layout/AppTitleBar.tsx`)：
- 高度 `h-10` (40px)，`data-tauri-drag-region` 全局拖拽。
- 左侧：macOS traffic lights 占位（80px 左内边距）+ Sidebar toggle。
- 中间：`BrowserDynamicIsland`（仅 browser 视图）或空白拖拽区。
- 右侧：搜索框、菜单按钮、Cmd+K 提示。

**DocumentTabs** (`src/components/documents/DocumentTabs.tsx`)：
- 读全局 store（`documentTabs`、`activeDocumentTabId` 等）。
- 使用 `TabBar`，`glassOpacity` / `position` 来自全局设置。
- 支持重命名、tear-off 分离到独立 window。
- 挂载点：`App.tsx` L251，位于内容区顶部。

**TerminalTabs** (`src/components/terminal/TerminalTabs.tsx`)：
- 读全局 store（`groups`、`activeGroupId`），映射 group → TabItem。
- 使用 `TabBar` + `extraActions`（历史目录 Clock 按钮）。
- 使用 terminal 主题色 `--term-fg` / `--term-accent`。
- 挂载点：`TerminalPanel.tsx` L52/73，浮在终端内容之上（`absolute` 定位 + `pointer-events` 切换）。

**BrowserTabs** (`src/components/panels/BrowserTabs.tsx`)：
- Panel-scoped：props 传入 tabs，非全局 store。
- 使用 `TabBar`；tabs 数据从 Rust `link-preview:tabs-updated` 事件推送到 `browserSlice`。
- **特殊**：目前不在主 window React 里渲染。Rust 单独创建了一个 `tabbar-main` 透明 overlay webview，把 `index.html?window=browser-tabbar-overlay` 加载进去渲染 `BrowserTabsOverlayApp` → 内嵌 `BrowserTabs`。`BrowserPanel` 通过 `updateBrowserTabBarRect` 报告 overlay 应处位置（浮在内容 webview 之上）。
- 目的：因为原生 webview 会遮挡 React 层，只有再用一个 webview 才能让 tab 浮在页面之上。

**BrowserDynamicIsland** (`src/components/layout/BrowserDynamicIsland.tsx`)：
- 目前挂在 AppTitleBar 中央（仅 browser 视图）。
- 提供地址栏 + 刷新 + 外部浏览器按钮。

## 设计决策（已与用户确认）

1. **布局**：单行加高的 TitleBar。所有元素挤在一行，包括 tabs。
2. **tabs 位置**：废弃 `tabBarPosition` 设置；tabs 固定在 TitleBar 中。
3. **Browser overlay**：取消 `tabbar-main` overlay webview。Browser tabs 也在主 window React 里渲染（就是 TitleBar 里的统一 tabs）。
4. **地址栏归位**：`BrowserDynamicIsland` 从 TitleBar 移除，改由 `BrowserPanel` 内部承担 URL/工具栏——不再"公共化"。
5. **扩展槽**：TitleBar 在 tabs 胶囊之外单独提供一个 `trailingActions` 区域，最多 3 个自定义 icon（供 TerminalTabs 的 Clock 历史按钮等使用）。

## 新架构

### AppTitleBar 新布局（单行加高）

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [traffic] [sidebar] [ tabs 胶囊（DocumentTabs / TerminalTabs / BrowserTabs）] [slots] [搜索] [菜单] [⌘K] │
└────────────────────────────────────────────────────────────────────────────┘
                 ↑                                                      ↑
                 └── 挤压区，flex-1，tabs 居中或靠左             └── 最多 3 icon
```

- 高度：从 40px 增到 **52px**（`h-[52px]`）。
- tabs 胶囊：从当前 `TabBar` 的 `absolute + top-0/bottom-0` 浮层模式改为 **inline 内联模式**，直接嵌进 TitleBar 的中间区域。
- traffic lights 左内边距、`data-tauri-drag-region` 全局拖拽保留（tab 胶囊自身用 `data-tauri-drag-region={false}` 关掉）。

### TabBar 组件改造

`src/components/ui/TabBar.tsx` 需要新增 "inline" 渲染模式：

- 保留原有 `position` prop（供尚未迁移或有需要的调用者继续用），但**新增** `inline?: boolean` prop。
- `inline=true` 时：
  - 不再用 `absolute left-0 right-0 top-0/bottom-0` 定位，改为 `relative` 或直接 `flex` 布局，由父容器控制位置和宽度。
  - 去掉 `pt-3` / `pb-3` 大内边距，改为 `py-1`（贴合 TitleBar）。
  - `max-w-[80%]` 改为让父容器控制（TitleBar 用 flex-1 + min-w-0）。
  - drop-shadow 减弱或去掉（TitleBar 内不需要浮层阴影）。
  - 圆角保留（capsule 视觉一致）。
  - `TAB_BAR_OVERLAY_HEIGHT` 常量保留导出但标注废弃（Rust 侧的 overlay 已取消）。
- 兼容层：`glassOpacity` / `position` prop 保留，但对 inline 模式无效。
- 新增 `trailingActions?: React.ReactNode`（就是原来 `extraActions` 的别名/复用）——继续放在 `+` 按钮右边。

### 统一 tabs 入口组件

在 `AppTitleBar` 中根据当前视图切换渲染：

```tsx
// AppTitleBar.tsx（伪代码）
const activeView = ...; // 从 store 派生：documents | terminal | browser | agent | settings

<div className="flex-1 min-w-0 flex items-center justify-center" data-tauri-drag-region={false}>
  {activeView === 'documents' && <DocumentTabs inline />}
  {activeView === 'terminal' && <TerminalTabs inline />}
  {activeView === 'browser' && <BrowserTabs inline tabs={browserTabs} activeTabId={browserActiveTabId} />}
  {/* agent/settings：无 tabs，中间是空拖拽区 */}
</div>

{/* trailingActions 区（tabs 胶囊之外） */}
<div className="flex items-center gap-1 shrink-0" data-tauri-drag-region={false}>
  {activeView === 'terminal' && <TerminalHistoryButton />}
  {/* 其他视图预留 */}
</div>
```

三个 XxxTabs 组件都接受一个新的 `inline?: boolean` prop 并透传到 `TabBar`。TerminalTabs 原本内嵌的 `extraActions`（历史 Clock）从 TabBar 内部拆出：

- 方案 A（选定）：**从 TabBar 内部拆出**——由 AppTitleBar 直接渲染 `TerminalHistoryButton` 到 trailingActions 槽。这样：
  - 每个视图专属的自定义 icon 集中在同一处管理（用户要求的 3 槽扩展点）。
  - `TerminalTabs` 更纯粹，只映射 tab 数据。
  - Clock 按钮需要独立为 `TerminalHistoryButton.tsx`（把当前 `TerminalTabs.tsx` 的 clock/history 状态相关代码抽出）。

### BrowserPanel 内部承载地址栏

- 新增或将 `BrowserDynamicIsland.tsx` 移入 `src/components/panels/BrowserAddressBar.tsx`（重命名，语义更准确）。
- `BrowserPanel.tsx` 顶部渲染 `BrowserAddressBar`：
  ```
  ┌───────────────────────────────┐
  │ BrowserAddressBar (~36px)     │
  ├───────────────────────────────┤
  │ 内容 webview 区                │
  └───────────────────────────────┘
  ```
- `updateBrowserPanelRect` 上报给 Rust 的 `containerRef` 应仅是内容区（不含地址栏），保持原有原生 webview 定位逻辑。
- `AppTitleBar` 里移除 `BrowserDynamicIsland` 引用。

### Rust 侧：取消 tabbar-main overlay

`src-tauri/src/commands/link_tabs.rs` 及 `src-tauri/src/lib.rs` 中所有与 `tabbar-main` overlay webview 相关的代码需要清理。具体：

- 移除 `update_browser_tabbar_rect` command（前端和 Rust 都不再调用）。
- 移除 `add_tab_internal` 里"每新增一个内容 webview 就重新把 overlay webview 加到最上层"的逻辑。
- 保留内容 webview 的定位（`update_browser_panel_rect`）不动。

前端配套：

- `src/lib/core/storage.ts` 里移除 `updateBrowserTabBarRect`。
- `src/main.tsx` 里移除 `BrowserTabsOverlayApp` 挂载分支。
- 删除 `src/components/windows/BrowserTabsOverlayApp.tsx`。
- 保留 `BrowserTabs.tsx` 组件本身（现在直接由 TitleBar 挂载 + 主 window 里的 `browserSlice` 数据驱动）。
- 移除 `BrowserTabs.tsx` 的 `glassOpacity` / `position` props 及 overlay 相关注释。
- `BrowserPanel.tsx` 里去掉 `updateBrowserTabBarRect` 调用及 `TAB_BAR_OVERLAY_HEIGHT` 引用。
- `index.html` / `vite.config` 如果有多入口配置需要清理 browser-tabbar-overlay 入口。
- Tauri 配置 `tauri.conf.json`/`Cargo.toml` 中如果有相关 window 定义也要清理。

**注意**：Rust 现在原生 webview 会遮挡 React 层。取消 overlay 后，tabs 直接在主 window React 里渲染——而主 window 的 UI 全部会被内容 webview 遮挡吗？需要**验证**：TitleBar 位于 `BrowserPanel` 内容 webview 的上方（Rust `updateBrowserPanelRect` 上报的 rect 从 TitleBar 底部开始，而不是从窗口顶部开始），所以 TitleBar 天然不会被内容 webview 遮挡。

从当前 `BrowserPanel.tsx` L145 看，`containerRef.current.getBoundingClientRect()` 已经是相对于窗口的绝对坐标，而 `containerRef` 是位于 React 布局中 TitleBar 之下的 `<div ref={containerRef} className="absolute inset-0">`。所以 tabs 从 overlay 迁到 TitleBar 后，天然位于内容 webview 的上方（视口顶部），**不会被遮挡**。✅

### 废弃 tabBarPosition 设置

- `src/store/uiSlice.ts`：移除 `tabBarPosition` / `setTabBarPosition`。
- `src/store/storeHelpers.ts`：移除 hydrate 相关行。
- `src/components/settings/GeneralSection.tsx`：移除 tab bar position 设置 UI。
- `src/lib/core/i18n/translations.ts`：移除对应文案。
- 所有 `useStore((s) => s.tabBarPosition)` 调用清理。
- `tabBarGlassOpacity` **保留**：TitleBar 内 tabs 胶囊仍需玻璃效果（视觉一致）；设置里"tab bar glass opacity"仍然有意义。

### App.tsx 布局调整

- 移除 L251 `<DocumentTabs />`。
- 移除 `TerminalPanel.tsx` L50-54 / L71-75 中的 `<TerminalTabs />` 浮层容器（tabs 已挪到 TitleBar）。

## 影响文件清单

**修改**：
- `src/components/layout/AppTitleBar.tsx`——加高 + 统一 tabs 挂载 + trailingActions 槽 + 移除 BrowserDynamicIsland。
- `src/components/ui/TabBar.tsx`——新增 inline 模式。
- `src/components/documents/DocumentTabs.tsx`——透传 `inline` prop。
- `src/components/terminal/TerminalTabs.tsx`——拆出 Clock 历史按钮；透传 inline。
- `src/components/panels/BrowserTabs.tsx`——移除 overlay 相关 props；透传 inline。
- `src/components/panels/BrowserPanel.tsx`——顶部渲染 BrowserAddressBar；移除 updateBrowserTabBarRect 调用；`containerRef` rect 计算方式不变（getBoundingClientRect 已自动排除地址栏）。
- `src/App.tsx`——移除 DocumentTabs 挂载。
- `src/components/terminal/TerminalPanel.tsx`——移除内部 TerminalTabs 挂载。
- `src/store/uiSlice.ts` / `storeHelpers.ts`——移除 tabBarPosition。
- `src/components/settings/GeneralSection.tsx`——移除相关设置 UI。
- `src/lib/core/i18n/translations.ts`——移除文案。
- `src/lib/core/storage.ts`——移除 updateBrowserTabBarRect。
- `src/main.tsx`——移除 BrowserTabsOverlayApp 挂载分支。
- `src-tauri/src/commands/link_tabs.rs`——移除 tabbar-main overlay 相关逻辑。
- `src-tauri/src/lib.rs`——移除相关 command 注册。
- `tauri.conf.json` / `index.html` / `vite.config`——如果 browser-tabbar-overlay 有独立入口配置则清理。

**新增**：
- `src/components/panels/BrowserAddressBar.tsx`——从 BrowserDynamicIsland 重命名/迁移。
- `src/components/terminal/TerminalHistoryButton.tsx`——从 TerminalTabs 拆出 Clock 历史按钮。

**删除**：
- `src/components/windows/BrowserTabsOverlayApp.tsx`。
- `src/components/layout/BrowserDynamicIsland.tsx`（内容迁移到 BrowserAddressBar）。

## 实施顺序

1. **TabBar inline 模式**（`TabBar.tsx`）——新增 `inline` prop 及分支渲染。
2. **地址栏归位**——新建 `BrowserAddressBar.tsx`；`BrowserPanel` 顶部挂载；`AppTitleBar` 移除 `BrowserDynamicIsland`。
3. **TerminalTabs 拆分**——抽出 `TerminalHistoryButton.tsx`。
4. **AppTitleBar 加高 + 统一 tabs**——`h-[52px]`；根据视图渲染对应 XxxTabs（inline）+ trailingActions 槽。
5. **移除旧挂载点**——`App.tsx` 里 `<DocumentTabs />`；`TerminalPanel.tsx` 里内嵌 `<TerminalTabs />` 浮层。
6. **BrowserTabs overlay 拆除**（前端）——`BrowserPanel` 停止上报 tabbar rect；`main.tsx` 移除 overlay 入口；删 `BrowserTabsOverlayApp.tsx`；`storage.ts` 移除 API；`BrowserTabs.tsx` 精简 props。
7. **Rust 侧清理**——`link_tabs.rs` 移除 `tabbar-main` overlay 创建/定位/重叠逻辑；`lib.rs` 移除对应 command 注册。
8. **废弃 tabBarPosition**——store / settings UI / i18n / 各处 `useStore` 引用清理。
9. **验证**：`pnpm tsc --noEmit` + `cargo check`；手动切换四种视图（documents / terminal / browser / agent / settings）确认 tabs 正常渲染与切换，地址栏工作正常，Cmd+T / Cmd+W / Cmd+L 等快捷键仍然可用。

## 风险与验证点

- **Rust overlay 相关代码耦合**：`add_tab_internal` 里"每次创建内容 webview 都要 raise overlay"的顺序敏感逻辑必须彻底删掉，否则残留调用会因 tabbar-main 不存在而报错。→ 在 Rust 修改后跑 `cargo check`。
- **BrowserPanel 内容 webview 定位**：地址栏改到 panel 内部后，`containerRef` 从 TitleBar 底下开始变成"TitleBar + AddressBar"底下开始。Rust 收到的 rect 会自动缩小（因为 `getBoundingClientRect()` 依然基于视口坐标），不需要额外改 Rust——需要**目测确认内容 webview 位置正确**。
- **Cmd+L 焦点**：从 TitleBar 迁到 BrowserPanel 内部后仍应能全局激活。地址栏组件内部注册的 window keydown listener 是全局的，切换视图后 BrowserPanel 是 CSS-hide（mount-once），listener 仍然存在，可能出现 hidden panel 也响应 Cmd+L 的问题。→ 在 BrowserAddressBar 里根据 `hidden`/`isBrowserView` 决定是否 attach listener，或改由 command palette 分发。
- **tabBarGlassOpacity 保留**：TitleBar 内 tabs 胶囊仍应用该值，视觉体验不降级。
- **TitleBar 加高**：需要检查所有依赖 `h-10` 的下游代码（例如 sidebar 顶部对齐、resize handle 位置等），必要时调整。用 grep 搜 `h-10` / `40px` / `titlebar` 相关坐标计算。
- **Traffic lights 交互**：加高后 macOS traffic lights 依然由系统绘制在窗口左上角，需要确认 `titleBarStyle` 配置以及左侧 80px 内边距是否仍与红绿灯位置对齐（若 traffic lights 在 20px 附近，加高不影响 X 坐标，只影响 Y——按 macOS 惯例红绿灯会自动垂直居中于自定义 title bar 高度）。
