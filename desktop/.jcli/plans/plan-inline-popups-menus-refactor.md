# 弹窗与菜单内联组件整改计划

## 背景

项目要求：所有弹窗（Dialog/Modal/Popover）和菜单（ContextMenu/Dropdown/BubbleMenu）都应作为**独立文件组件**存在，不能作为"内联组件"定义在业务组件内部。

项目已有的浮层约定：
- 基础原语：`src/components/ui/MenuList.tsx` 提供 `MenuList` / `MenuItem` / `SubMenu` / `MenuDivider`。
- z-index 体系：`z-dropdown`(50) / `z-popover`(70) / `z-modal`(100) / `z-toast`(110)。
- 已有独立组件范例：`DocumentContextMenu`、`BrowserTabContextMenu`、`AgentWorkspaceMenu`、`OpenDocumentDialog`、`BackupRestoreDialog`、`TrashDialog`、`FormatBubbleMenu`、`TableSizeSelector`、`AIGraphImportDialog`、`MermaidImportDialog`、`SelectDropdown`、`FontDropdown`、`code-block/LanguageDropdown` 等。

---

## 一、不符合规范的内联弹窗/菜单清单

### A. 内联 Modal Dialog（弹窗定义在大组件文件内）

| # | 文件 | 内联组件 | 类型 | 行数 | 说明 |
|---|------|---------|------|------|------|
| A1 | `components/panels/BrowserStartPage.tsx` | `ShortcutDialog` | Modal | L44–135 | 添加/编辑浏览器起始页快捷方式的弹窗 |
| A2 | `components/agent/AgentSidebar.tsx` | `WorkspaceSelectModal` | Modal | L57–188 | 选择/新建 Agent 工作空间的弹窗 |
| A3 | `components/agent/WorkspaceList.tsx` | `WorkspaceExpandModal` | Modal | L562–633 | 展开工作空间会话列表的弹窗（已 export 但定义在同文件） |

### B. 内联 Context Menu（右键菜单内容内联）

| # | 文件 | 内联内容 | 行数 | 说明 |
|---|------|---------|------|------|
| B1 | `components/terminal/TerminalTabs.tsx` | `renderContextMenu` 回调 | L228–271 | 终端标签右键菜单（Rename/Detach/Close），已用 MenuList 但内容内联 |
| B2 | `components/documents/DocumentTabs.tsx` | `renderContextMenu` 回调 | L68–110 | 文档标签右键菜单（Detach/Close/CloseOthers），已用 MenuList 但内容内联 |
| B3 | `components/windows/LinkPreviewTabsApp.tsx` | `renderContextMenu` 回调 | L232–281 | 链接预览标签右键菜单（Refresh/OpenBrowser/Close），已用 MenuList 但内容内联 |
| B4 | `components/agent/WorkspaceList.tsx` | `WorkspaceGroupMenu` | L388–422 | 工作空间分组右键菜单，已用 MenuList 但组件未独立成文件 |
| B5 | `components/panels/BrowserStartPage.tsx` | 快捷方式右键菜单 | L390–416 | 编辑/删除快捷方式，已用 MenuList 但内容内联 |

### C. 内联 Dropdown / Popover（下拉面板完全内联自实现）

| # | 文件 | 内联内容 | 行数 | 说明 | 重复情况 |
|---|------|---------|------|------|---------|
| C1 | `components/terminal/TerminalTabs.tsx` | 历史目录下拉浮层 | L319–387 | `createPortal` 自实现 recent-dirs dropdown | **与 C2 完全重复** |
| C2 | `components/terminal/TerminalHistoryButton.tsx` | 历史目录下拉浮层 | L97–161 | `createPortal` 自实现 recent-dirs dropdown | **与 C1 完全重复** |
| C3 | `components/agent/ContextSwitchCard.tsx` | 模型选择下拉面板 | L207–245 | 内联 providers dropdown + 键盘导航 | **与 ModelSelector 几乎完全重复** |
| C4 | `components/editor/nodes/TableControls.tsx` | `Dropdown`/`DropdownItem`/`DropdownSep` | L406–468 | 内联了一套 dropdown 基础组件，未复用 MenuList | 无重复，但应统一到 MenuList |
| C5 | `components/panels/BrowserStartPage.tsx` | 搜索引擎选择菜单 | L300–327 | 内联 MenuList 内容 | 无重复 |
| C6 | `components/editor/nodes/graph/GraphToolbar.tsx` | 形状菜单 / 填充色选择器 / 更多菜单 | 3 处 | 三个 dropdown 面板内联渲染 | 无重复 |

---

## 二、整改方案

### 总原则
1. 所有弹窗/菜单抽成独立 `.tsx` 文件组件。
2. 菜单统一复用 `ui/MenuList` 原语；弹窗统一复用 `fixed inset-0 z-modal` 遮罩模式。
3. 优先消除重复代码（C1/C2、C3），再做其余抽取。

### P0 — 消除重复（最高优先级）

**任务 1：提取 `TerminalRecentDirsDropdown` 共享组件**
- 新建 `components/terminal/TerminalRecentDirsDropdown.tsx`
- 封装 hover 触发 + `createPortal` 定位 + recent dirs 列表 + clear 按钮
- 支持向上/向下展开（`position` prop，供 tabBar 在 top/bottom 时使用）
- `TerminalTabs.tsx`：删除内联的 history dropdown（L155–198 状态 + L319–387 渲染），改用 `<TerminalRecentDirsDropdown position={tabBarPosition} />`
- `TerminalHistoryButton.tsx`：删除内联 dropdown（L36–161），改用 `<TerminalRecentDirsDropdown position="top" />`，本文件仅保留按钮触发壳

**任务 2：提取 `ModelDropdown` 共享组件**
- 新建 `components/agent/ModelDropdown.tsx`
- 封装模型列表 + 选中态 + 键盘导航 + 外部点击关闭
- `ModelSelector.tsx`：改用 `ModelDropdown` 作为渲染核心
- `ContextSwitchCard.tsx`：删除内联 dropdown（L36–132 状态/逻辑 + L207–245 面板），改用 `ModelDropdown`，仅保留卡片外壳 + 操作按钮

### P1 — 内联 Modal Dialog 独立化

**任务 3：`ShortcutDialog` 独立化**
- 新建 `components/panels/ShortcutDialog.tsx`，迁移 `BrowserStartPage.tsx` L44–135 的 `ShortcutDialog`
- `BrowserStartPage.tsx` 改为 import 使用

**任务 4：`WorkspaceSelectModal` 独立化**
- 新建 `components/agent/WorkspaceSelectModal.tsx`，迁移 `AgentSidebar.tsx` L57–188
- `AgentSidebar.tsx` 改为 import 使用

**任务 5：`WorkspaceExpandModal` 独立化**
- 新建 `components/agent/WorkspaceExpandModal.tsx`，迁移 `WorkspaceList.tsx` L562–633
- `WorkspaceList.tsx` 改为 import 使用（注意它当前是 `export` 的，检查外部引用点一并更新）

### P2 — 内联 Dropdown/Popover 基础组件统一

**任务 6：`TableControls` dropdown 统一到 MenuList**
- 方案 A（推荐）：将 `Dropdown`/`DropdownItem`/`DropdownSep`（L406–468）直接替换为 `MenuList`/`MenuItem`/`MenuDivider` 原语，删除内联定义
- 若 hover 浮动工具栏的定位需求与 MenuList 不完全匹配，则方案 B：抽取为 `components/editor/nodes/table/TableDropdown.tsx`
- `TableControls.tsx` 内 4 个 dropdown（对齐/行操作/列操作/删除）改用统一组件

**任务 7：`GraphToolbar` 三个菜单独立化**
- 新建 `components/editor/nodes/graph/GraphShapeMenu.tsx`（形状选择）
- 新建 `components/editor/nodes/graph/GraphFillPicker.tsx`（填充色选择器 popover）
- 新建 `components/editor/nodes/graph/GraphMoreMenu.tsx`（更多操作菜单）
- `GraphToolbar.tsx` 改为组合这三个组件

### P3 — 内联 Context Menu 内容独立化（已用 MenuList，低风险）

**任务 8：TabBar 三个右键菜单独立化**
- 新建 `components/terminal/TerminalTabContextMenu.tsx`，迁移 `TerminalTabs.tsx` L228–271 的 `renderContextMenu` 为独立组件（props: `groupId, x, y, onClose` + 业务回调）
- 新建 `components/documents/DocumentTabContextMenu.tsx`，迁移 `DocumentTabs.tsx` L68–110
- 新建 `components/windows/LinkPreviewTabContextMenu.tsx`，迁移 `LinkPreviewTabsApp.tsx` L232–281
- 各 Tabs 组件改为 `<XxxTabContextMenu ... />` 传给 `renderContextMenu`

**任务 9：`WorkspaceGroupMenu` 独立化**
- 新建 `components/agent/WorkspaceGroupMenu.tsx`，迁移 `WorkspaceList.tsx` L388–422
- `WorkspaceList.tsx` 改为 import 使用

**任务 10：`BrowserStartPage` 两个菜单独立化**
- 新建 `components/panels/ShortcutContextMenu.tsx`，迁移快捷方式右键菜单（L390–416）
- 新建 `components/panels/SearchEngineMenu.tsx`，迁移搜索引擎选择菜单（L300–327），或改用 `SelectDropdown`

---

## 三、执行顺序与建议

| 阶段 | 任务 | 预期收益 |
|------|------|---------|
| 第 1 阶段 | 任务 1 + 任务 2（P0） | 消除两处明显重复，立竿见影 |
| 第 2 阶段 | 任务 3–5（P1） | 三个 Modal 独立化，结构清晰 |
| 第 3 阶段 | 任务 6–7（P2） | dropdown 基础组件统一 |
| 第 4 阶段 | 任务 8–10（P3） | context menu 内容独立化，收尾 |

每个任务完成后运行 `npm run build`（或项目对应构建命令）验证无类型/编译错误，并人工检查交互正常。

## 四、可选后续优化（不在本次范围）

- 建立 `ui/Modal` / `ui/Dialog` 基础组件：统一遮罩（`fixed inset-0 z-modal`）、关闭交互、焦点管理，供所有 Dialog 复用。当前各 Dialog 都是各自实现遮罩，存在样式不一致（如 `z-50` vs `z-modal`）。
- 统一 z-index：`WorkspaceSelectModal`/`WorkspaceExpandModal` 当前用 `z-50`，应改为 `z-modal`。
