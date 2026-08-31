# 统一 Tab 系统（文档 + 终端）

## 目标

将文档编辑器和终端统一到一个 Tab 系统中。用户可以用同一套快捷键（如 `Cmd+Shift+←/→`）在所有 tab 之间切换，无论它是文档还是终端。

## 设计决策（来自用户确认）

1. **统一顶部 Tab 栏** — 主内容区顶部有一个 tab 栏，文档 tab 和终端 tab 混排
2. **终端独占区域** — 切到终端 tab 时 DocumentList 侧边栏隐藏（等价于"收起侧边栏"），切到文档 tab 时恢复
3. **VS Code 风格生命周期** — 点列表中的文档：有 tab 就切换，没有就新开；关闭 tab 只关视图不删文档

## 核心架构

### 新增：`workspaceSlice.ts` — 统一 Tab 管理

引入一个新的 Zustand slice，负责统一的 tab 列表和焦点管理。原有的 documentsSlice / terminalSlice 保持不动，它们的 state 不变，workspaceSlice 是一个"编排层"。

```typescript
// src/store/workspaceSlice.ts

/** 统一 tab — 可以是文档也可以是终端 */
interface UnifiedTab {
  id: string;             // tab 唯一 ID，如 "tab-{timestamp}"
  kind: 'document' | 'terminal';
  /** 对于 document tab：对应的 docId */
  docId?: string;
  /** 对于 terminal tab：对应的 groupId（一个 terminal tab = 一个 pane group） */
  groupId?: string;
}

interface WorkspaceState {
  // — state —
  tabs: UnifiedTab[];
  activeTabId: string | null;

  // — actions —
  openDocumentTab: (docId: string) => void;     // 打开/聚焦文档 tab
  openTerminalTab: (groupId: string) => void;   // 绑定终端 group 为 tab
  closeTab: (tabId: string) => void;            // 关闭 tab（不删文档）
  setActiveTab: (tabId: string) => void;        // 切换 tab
  cycleTab: (direction: 1 | -1) => void;        // 循环切换 tab
}
```

### 为什么用新 slice 而非改 terminalSlice？

- **terminalSlice 管的是 PTY 生命周期**（创建/杀死进程），workspaceSlice 管的是"视图焦点"
- **documentsSlice 管的是文档数据**（CRUD），workspaceSlice 管的是"哪些文档被打开着"
- 两者通过 `docId` / `groupId` 关联，互不侵入
- 新增窗口（tear-off）场景中，detach 只影响 workspaceSlice 的 tab 列表，不影响底层 PTY

### Tab 列表的构建规则

| 操作 | 对 tabs 的影响 |
|------|---------------|
| DocumentList 中点击文档 | 如果该 docId 已有 tab → `setActiveTab`；否则 `openDocumentTab`（新 tab 追加到末尾） |
| 新建文档 `createDocument` | 自动调用 `openDocumentTab(newDoc.id)` |
| 新建终端 `createSession` | terminalSlice 创建 group 后，workspaceSlice 调 `openTerminalTab(groupId)` |
| 关闭文档 tab | 仅从 tabs 移除，不删文档；如果关的是最后一个文档 tab，显示 EmptyState |
| 关闭终端 tab | 调 `closeSession`（杀 PTY），然后从 tabs 移除 |
| 删除文档 | 如果有对应 tab，也移除该 tab |

### 终端 tab 与 pane group 的关系

**不变**：一个 terminal tab = 一个 `PaneGroup`（可以内含多个 split pane）。TerminalTabs 组件中的 group 概念直接复用。

**变化**：TerminalTabs 中的 tab strip 不再独立渲染，而是合并进统一的 tab 栏。每个 terminal tab 的标题仍来自 `getDisplayTitle(session)`。

## 实现步骤

### Phase 1: 新建 workspaceSlice

**文件**：`src/store/workspaceSlice.ts`

```
state:
  tabs: UnifiedTab[]
  activeTabId: string | null

actions:
  openDocumentTab(docId)
    - 如果 tabs 中已有 kind=document && docId 匹配的 tab → setActiveTab
    - 否则新建 tab 追加到末尾，设为 active

  openTerminalTab(groupId)
    - 新建 terminal tab 追加到末尾，设为 active

  closeTab(tabId)
    - 找到 tab
    - 如果是 terminal tab → 调 get().closeSession(group.activeSessionId)
    - 从 tabs 移除
    - 如果关的是 activeTab，自动切到相邻 tab
    - 如果 tabs 空了 → activeTabId = null

  setActiveTab(tabId)
    - 设 activeTabId
    - 如果是 document tab → 调 get().openDocument(tab.docId) 同步 activeDoc
    - 如果是 terminal tab → 调 get().setActiveSession(group.activeSessionId)

  cycleTab(direction)
    - 在 tabs 数组中找当前 index，±1 循环

  initWorkspace()
    - 启动时不预建任何 tab，用户点文档/开终端时动态产生
```

**修改 `storeHelpers.ts`**：在 `StoreState` 接口中新增 workspace 相关字段和方法。

**修改 `useStore.ts`**：组合 workspaceSlice。

### Phase 2: 统一 Tab 栏组件

**新文件**：`src/components/UnifiedTabs.tsx`

- 渲染 `tabs` 数组，每个 tab 显示：
  - 文档 tab：文档标题（来自 docList meta），左侧带 `FileText` 图标
  - 终端 tab：终端标题（来自 session），左侧带 `TerminalSquare` 图标
  - 每个 tab 有关闭按钮（X），最后仅剩一个 tab 时隐藏关闭按钮
- 点击 tab → `setActiveTab(tabId)`
- 右键 tab → 上下文菜单（关闭/关闭其他）
- Tab 栏右侧有 `+` 下拉：新建文档 / 新建终端

**关键 UI 细节**：
- Tab 栏高度 36px（h-9），与现有 TerminalTabs 一致
- 复用 `components/ui/MenuList` 做右键菜单
- 样式变量用 `--vscode-*` 系列

### Phase 3: 修改 App.tsx 布局

```
<TitleBar />
<div className="flex-1 flex">
  <ActivityBar />
  {showSidebar && <DocumentList />}    ← 只在 activeTab 是文档时显示
  <div className="flex-1 flex flex-col">
    {tabs.length > 0 && <UnifiedTabs />}   ← 统一 tab 栏
    <div className="flex-1">
      {activeTab?.kind === 'terminal'
        ? <TerminalPanel />
        : activeTab?.kind === 'document'
          ? <BlockEditor />
          : <EmptyState />}
    </div>
  </div>
</div>
```

**侧边栏显示逻辑**：
```typescript
const activeTab = tabs.find(t => t.id === activeTabId);
const isTerminalActive = activeTab?.kind === 'terminal';
const showSidebar = isSidebarOpen && !isSettingsOpen && !isTerminalActive;
```

### Phase 4: 改造 TerminalTabs

- **删除** `TerminalTabs.tsx` 中的 tab strip 渲染（tab 显示交给 UnifiedTabs）
- **保留** TerminalTabs 的键盘事件监听（newTab / cycleTab），但改为调用 workspaceSlice 的方法
- **保留** 历史目录（Clock）下拉 — 移到 UnifiedTabs 右侧或 ActivityBar 中（待定，先放在 UnifiedTabs 栏的右侧区域）
- **保留** tab tear-off（拖拽分离窗口）— 改为从 UnifiedTabs 触发，仅对 terminal tab 生效

### Phase 5: 改造 TerminalPanel

`TerminalPanel.tsx` 不再自己渲染 tab 栏，只负责渲染当前 active group 的 pane 布局。

### Phase 6: 改造 DocumentList / documentsSlice

- `openDocument` 改为调用 `workspaceSlice.openDocumentTab(id)`（不再直接设 activeDoc）
- `createDocument` 成功后自动调 `openDocumentTab`
- `trashDocument` / `deleteDocument` 时，如果有对应 tab，同时移除 tab
- DocumentList 的 `handleDocClick` 改为调 `openDocumentTab`

### Phase 7: 键盘快捷键统一

**修改 `shortcuts.ts`**：

现有终端 tab 快捷键提升为全局：
```
terminal.cycleTabLeft  → scope: 'global'，改为 app.cycleTabLeft
terminal.cycleTabRight → scope: 'global'，改为 app.cycleTabRight
terminal.newTab        → 保留（仅终端），scope 不变
terminal.closeTab      → 保留（仅终端），scope 不变
```

新增全局快捷键：
```
app.newDocumentTab — 新建文档 tab（默认 Cmd+N，复用现有 app.newDocument）
app.closeTab       — 关闭当前 tab（默认 Cmd+W，全局）
app.cycleTabLeft   — 向左循环 tab（Cmd+Shift+←）
app.cycleTabRight  — 向右循环 tab（Cmd+Shift+→）
```

在 `UnifiedTabs.tsx` 或 `App.tsx` 顶层注册全局 keydown handler（capture: true），调用 `workspaceSlice.cycleTab`。

### Phase 8: 命令面板集成

在 `commandRegistry.ts` 中新增：
- "切换到下一个 Tab"（app.cycleTabRight）
- "切换到上一个 Tab"（app.cycleTabLeft）
- "关闭当前 Tab"（app.closeTab）

### Phase 9: 持久化（可选，后期）

将打开的 tabs 列表持久化到 `settings.json`，下次启动恢复。终端 tab 不恢复（PTY 已死），只恢复文档 tab。

## 风险与注意事项

1. **TerminalTabs 中的 tear-off 功能**：拖拽 tab 出窗口创建新窗口，需要适配新的 UnifiedTabs。只有 terminal tab 可以 tear-off。
2. **detachGroup 后的同步**：tear-off 后要从 workspaceSlice 的 tabs 中移除对应 terminal tab。
3. **settings 页面**：打开设置时 tab 栏仍然显示，设置作为 overlay 覆盖在内容区上（与当前行为一致）。
4. **activeDocId 与 activeTab 的同步**：document tab 切换时需同步 activeDocId，终端面板某些逻辑可能依赖 activeDocId 需排查。
5. **初始化时机**：workspaceSlice 需要在 documentsSlice.init() 之后初始化（因为需要 docList）。

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 新建 | `src/store/workspaceSlice.ts` |
| 新建 | `src/components/UnifiedTabs.tsx` |
| 修改 | `src/store/storeHelpers.ts` — StoreState 新增 workspace 字段 |
| 修改 | `src/store/useStore.ts` — 组合 workspaceSlice |
| 修改 | `src/App.tsx` — 布局：sidebar + UnifiedTabs + content |
| 修改 | `src/store/documentsSlice.ts` — openDocument/createDocument 联动 workspace |
| 修改 | `src/components/DocumentList.tsx` — handleDocClick 调 openDocumentTab |
| 修改 | `src/components/terminal/TerminalTabs.tsx` — 移除 tab strip，保留键盘事件 |
| 修改 | `src/components/terminal/TerminalPanel.tsx` — 移除 TerminalTabs 引用 |
| 修改 | `src/lib/shortcuts.ts` — tab 切换快捷键提升为 global scope |
| 修改 | `src/lib/commandRegistry.ts` — 新增 tab 相关命令 |
| 修改 | `src/lib/i18n.ts` — 新增 tab 相关文案 |
