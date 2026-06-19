# 终端分屏功能 (Kitty-style Splits)

## 目标

为终端实现类似 Kitty 的多窗格分屏系统：

| 快捷键 | 功能 | Kitty 对应 |
|--------|------|-----------|
| `Cmd+Enter` | 新建窗格（加入当前分屏组） | `new_window` |
| `Cmd+Shift+L` | 循环切换布局 | `next_layout` |
| `Cmd+Shift+F` | 移动当前聚焦窗格的位置 | `move_window` |
| `Cmd+]` / `Cmd+[` | 在窗格间切换聚焦 | `next_window` / `previous_window` |
| `Cmd+W` | 关闭当前窗格 | `close_window` |

## Kitty 布局类型

实现 6 种布局（与 Kitty 一致）：

1. **Tall**（默认）— 左侧 1 个大窗格，右侧其余窗格垂直堆叠
2. **Fat** — 顶部 1 个大窗格，底部其余窗格水平排列
3. **Grid** — 最优网格排列
4. **Horizontal** — 所有窗格水平一行
5. **Vertical** — 所有窗格垂直一列
6. **Stack** — 仅显示聚焦窗格（类似当前单窗格行为）

## 架构设计

### 核心概念变更

当前：`sessions[]` = 标签页，每个标签页 = 1 个 PTY，一次只显示一个。

新增：引入 **PaneGroup（窗格组）** 概念，替代原有"标签页 = 单 session"的模型：

```
旧:  Tab(Session A) | Tab(Session B) | Tab(Session C)
         ↓ 显示         ↓ 显示

新:  Tab(Group 1)  | Tab(Group 2)
     ├ Pane(Sess A)  └ Pane(Sess C)
     ├ Pane(Sess D)
     └ Pane(Sess E)
```

每个 Group = 一个标签页，内部可包含多个 Pane（session），按 layout 排列。

### 数据模型

```typescript
// terminalSlice.ts — 新增类型

export type PaneLayoutType = 'tall' | 'fat' | 'grid' | 'horizontal' | 'vertical' | 'stack';

export interface PaneGroup {
  id: string;               // 'group-{timestamp}'
  sessionIds: string[];     // 有序 session ID 列表
  activeSessionId: string;  // 组内聚焦的 session
  layout: PaneLayoutType;   // 当前布局
}
```

### Store 变更

**新增 state：**
```typescript
groups: PaneGroup[];
activeGroupId: string | null;
```

**保留 state：**
```typescript
sessions: TerminalSession[];  // 所有 PTY 进程（不变）
```

**`activeSessionId`** — 从派生属性变为便捷 getter：
```typescript
// 始终等于 activeGroup?.activeSessionId
get activeSessionId(): string | null
```

**新增 actions：**
```typescript
splitPane: (templateId?: string) => Promise<void>;
// Cmd+Enter: 在当前 group 新建 session，加入 panes

cyclePaneLayout: () => void;
// Cmd+Shift+L: tall → fat → grid → horizontal → vertical → stack → tall...

moveActivePane: () => void;
// Cmd+Shift+F: 将 active pane 在数组中旋转一位

closePane: (sessionId: string) => Promise<void>;
// Cmd+W: 关闭单个窗格；若为组内最后一个，关闭整个组

setActivePane: (sessionId: string) => void;
// 点击窗格或 Cmd+] / Cmd+[ 切换聚焦

setPaneLayout: (layout: PaneLayoutType) => void;
```

**重构现有 actions：**
```typescript
createSession: (templateId?) => Promise<void>;
// → 创建新 group（含 1 个 session），等价于新标签页

closeSession: (sessionId) => Promise<void>;
// → 关闭包含该 session 的整个 group（含所有窗格）

setActiveSession: (sessionId) => void;
// → 聚焦该 session 所在的 pane + group

removeSessionState: (sessionId) => void;
// → 从 group 和 sessions 中同步移除（PTY 退出时调用）
```

### 组件变更

#### 1. 新建 `PaneLayoutView.tsx`

负责根据 `layout` 类型将 sessionIds 渲染为多窗格布局：

```
┌─────────────────────────────────────────────────┐
│  PaneLayoutView                                  │
│  ┌──────────────┬──────────┐                    │
│  │              │ Pane B   │  ← Tall layout     │
│  │   Pane A     ├──────────┤    (左大右堆叠)     │
│  │  (active)    │ Pane C   │                    │
│  │              │          │                    │
│  └──────────────┴──────────┘                    │
└─────────────────────────────────────────────────┘
```

- 每个窗格渲染为 `PaneContainer`（含 xterm DOM 容器）
- Active 窗格有 `1px` focus border（`var(--vscode-focusBorder)`）
- 点击窗格 → `setActivePane`
- CSS 用 flexbox / grid 实现，无需 JS 计算尺寸

各布局 CSS 策略（以 N 个窗格为例）：

| Layout | CSS 策略 |
|--------|---------|
| Tall | `flex-row`: 左 flex-[2], 右 `flex-col` flex-[1] 各 pane flex-1 |
| Fat | `flex-col`: 上 flex-[2], 下 `flex-row` flex-[1] 各 pane flex-1 |
| Grid | `grid` `grid-template-columns: repeat(ceil(sqrt(N)))` |
| Horizontal | `flex-row` 所有 pane flex-1 |
| Vertical | `flex-col` 所有 pane flex-1 |
| Stack | 仅渲染 active pane，`position: absolute` 全屏 |

当 `sessionIds.length === 1` 时，所有布局等价（单窗格全屏）。

#### 2. 重构 `TerminalPanel.tsx`

```
┌──────────────────────────────────────┐
│  TerminalTabs (显示 groups)           │  ← 标签栏改为显示 group
├──────────────────────────────────────┤
│                                      │
│  PaneLayoutView                      │  ← 替代单个 mountRef
│    mounts all visible session        │
│    containers                        │
│                                      │
└──────────────────────────────────────┘
```

核心改动：
- 不再只 mount active session 的 container
- 遍历 active group 的 `sessionIds`，为每个 session mount container
- 每个可见 pane 都需要 `fit.fit()` + `pty_resize`
- 使用 `ResizeObserver` 已内置于 `useTerminalManager`（每个 container 独立 observe）

#### 3. 重构 `TerminalTabs.tsx`

- 数据源从 `sessions` 改为 `groups`
- 每个标签显示 **active session 的 title**（Kitty 行为）
- 关闭按钮关闭整个 group
- `+` 按钮创建新 group（新标签页）

#### 4. 快捷键处理 (`usePaneShortcuts.ts`)

新建 hook，在 `TerminalPanel` 中挂载：

```typescript
// 全局键盘监听（capture phase，终端视图中生效）
Cmd+Enter     → splitPane()
Cmd+Shift+L   → cyclePaneLayout()
Cmd+Shift+F   → moveActivePane()
Cmd+]         → next pane (focus)
Cmd+[         → previous pane (focus)
Cmd+W         → closePane(activeSessionId)
Cmd+T         → createSession() (new group/tab)
```

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/store/terminalSlice.ts` | **修改** | 新增 PaneGroup 类型、groups state、新 actions |
| `src/store/storeHelpers.ts` | **修改** | StoreState 接口新增 groups/pane 相关声明 |
| `src/components/terminal/PaneLayoutView.tsx` | **新建** | 多窗格布局渲染组件 |
| `src/components/terminal/TerminalPanel.tsx` | **修改** | 用 PaneLayoutView 替代单个 mount |
| `src/components/terminal/TerminalTabs.tsx` | **修改** | 标签栏改为显示 groups |
| `src/components/terminal/usePaneShortcuts.ts` | **新建** | 分屏快捷键 hook |
| `src/components/terminal/types.ts` | **修改** | 新增 PaneGroup 相关类型导出 |

### 向后兼容

- **初始化迁移**：如果用户有旧 sessions 但无 groups，自动为每个 session 包裹一个单窗格 group
- **单窗格 = 原行为**：当 group 只有一个 session 时，与当前行为完全一致
- **`activeSessionId` 派生**：现有代码依赖 `activeSessionId` 的地方（App.tsx、TerminalPanel）不需要改动，因为它始终反映当前聚焦 pane

### 关键技术点

1. **xterm 多实例挂载**：`useTerminalManager` 已为每个 session 缓存独立 container，只需 append 到不同 pane DOM 节点
2. **Resize**：每个 container 已有独立 `ResizeObserver`，切 layout 时自动 fit + resize
3. **Focus 管理**：切换 pane 时调用 `term.focus()`，与当前行为一致
4. **PTY 生命周期**：session 的 PTY 不因布局变化而重启，切 layout 只重新排列 DOM
