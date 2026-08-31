# 统一文件/组件命名方案

## 一、现状分析

### 1. Layout 层级结构（IDE 布局）
根据 App.tsx 分析，项目采用类似 VSCode 的布局结构：

```
┌─────────────────────────────────────────────┐
│                 TitleBar                    │  ← 顶部标题栏
├────────┬────────────────────────────────────┤
│        │                                    │
│  Activ │         主内容区域                  │
│  ity   │  ┌─────────────────────────────┐   │
│  Bar   │  │        DocumentTabs         │   │  ← Tab 标签栏
│        │  ├─────────────────────────────┤   │
│        │  │                             │   │
│        │  │   BlockEditor / Settings    │   │  ← 编辑器/设置
│        │  │   TerminalPanel / AgentPanel│   │  ← 面板类
│        │  │                             │   │
│        │  └─────────────────────────────┘   │
├────────┴────────────────────────────────────┤
│  DocumentList (Sidebar, 可隐藏)              │  ← 侧边栏
└─────────────────────────────────────────────┘
```

### 2. 当前命名情况

| 目录 | 组件 | 后缀模式 | 问题 |
|------|------|----------|------|
| **layout** | TitleBar, ActivityBar, ErrorBoundary | `Bar`, `Boundary` | 不统一，layout 层应有统一后缀 |
| **documents** | DocumentList, DocumentTabs, DocumentContextMenu | `List`, `Tabs`, `Menu` | 功能性命名，可接受 |
| **terminal** | TerminalPanel, TerminalTabs, TerminalWindowApp | `Panel`, `Tabs`, `WindowApp` | Panel 是合理的面板后缀 |
| **agent** | AgentPanel, AgentSidebar, AgentChat | `Panel`, `Sidebar`, `Chat` | Panel 统一，Sidebar/Chat 合理 |
| **settings** | Settings, GeneralSection, TerminalSection | 无后缀, `Section` | Section 后缀统一 ✓ |
| **editor** | BlockEditor, SectionEditor, CommandPalette | `Editor`, `Palette` | Editor 后缀统一 ✓ |
| **windows** | DocumentWindowApp, DiagramWindowApp | `WindowApp` | WindowApp 后缀统一 ✓ |
| **ui** | TabBar, MenuList, NavTree, EmptyState | `Bar`, `List`, `Tree`, `State` | UI 基础组件，功能性命名 ✓ |

### 3. 命名不一致问题

1. **layout 目录**：TitleBar/ActivityBar 用 `Bar` 后缀，但 layout 层级应该与其他层级保持一致的命名规则
2. **documents 目录**：DocumentList 是 Sidebar 的一部分，命名应该体现其布局位置（建议改为 `DocumentSidebar`）
3. **部分组件缺少层级标识**：ErrorBoundary 应归入 layout 层级

---

## 二、统一命名规则

### 命名层级对照表

根据组件在 IDE 布局中的位置，统一使用以下后缀：

| 布局位置 | 后缀命名 | 示例 |
|----------|----------|------|
| **顶层框架** (TitleBar, ActivityBar) | `Bar` | TitleBar ✓, ActivityBar ✓ |
| **侧边栏区域** (DocumentList, AgentSidebar) | `Sidebar` | DocumentSidebar, AgentSidebar ✓ |
| **面板区域** (TerminalPanel, AgentPanel) | `Panel` | TerminalPanel ✓, AgentPanel ✓ |
| **标签栏** (DocumentTabs, TerminalTabs) | `Tabs` | DocumentTabs ✓, TerminalTabs ✓ |
| **编辑器区域** (BlockEditor) | `Editor` | BlockEditor ✓ |
| **设置区域** (GeneralSection) | `Section` | GeneralSection ✓ |
| **窗口应用** (DocumentWindowApp) | `WindowApp` | DocumentWindowApp ✓ |
| **对话框/弹窗** (TrashDialog) | `Dialog` | TrashDialog ✓ |
| **上下文菜单** (DocumentContextMenu) | `ContextMenu` | DocumentContextMenu ✓ |
| **功能视图** (PaneLayoutView) | `View` | PaneLayoutView ✓ |
| **UI 基础组件** | 功能性命名 | TabBar, MenuList, NavTree |

---

## 三、需要重命名的文件

### 1. layout 目录

| 原文件名 | 新文件名 | 说明 |
|----------|----------|------|
| ActivityBar.tsx | ActivityBar.tsx | ✓ 保持不变（Bar 后缀正确） |
| TitleBar.tsx | TitleBar.tsx | ✓ 保持不变（Bar 后缀正确） |
| ErrorBoundary.tsx | ErrorBoundary.tsx | ✓ 保持不变（Boundary 是错误边界的标准命名） |

**结论：layout 目录命名已合理，无需修改。**

### 2. documents 目录

| 原文件名 | 新文件名 | 说明 |
|----------|----------|------|
| DocumentList.tsx | **DocumentSidebar.tsx** | DocumentList 实际是侧边栏组件，应改为 Sidebar 后缀 |
| DocumentTabs.tsx | DocumentTabs.tsx | ✓ 保持不变（Tabs 后缀正确） |
| DocumentContextMenu.tsx | DocumentContextMenu.tsx | ✓ 保持不变（ContextMenu 后缀正确） |
| TrashDialog.tsx | TrashDialog.tsx | ✓ 保持不变（Dialog 后缀正确） |
| BackupRestoreDialog.tsx | BackupRestoreDialog.tsx | ✓ 保持不变（Dialog 后缀正确） |

### 3. agent 目录

| 原文件名 | 新文件名 | 说明 |
|----------|----------|------|
| AgentPanel.tsx | AgentPanel.tsx | ✓ 保持不变（Panel 后缀正确） |
| AgentSidebar.tsx | AgentSidebar.tsx | ✓ 保持不变（Sidebar 后缀正确） |
| AgentChat.tsx | AgentChat.tsx | ✓ 保持不变（Chat 是功能性命名） |
| WorkspaceList.tsx | WorkspaceList.tsx | ✓ 保持不变（List 是功能性命名） |
| ModelSelector.tsx | ModelSelector.tsx | ✓ 保持不变（Selector 是功能性命名） |
| ContextSwitchCard.tsx | ContextSwitchCard.tsx | ✓ 保持不变（Card 是功能性命名） |
| MarkdownMessage.tsx | MarkdownMessage.tsx | ✓ 保持不变（Message 是功能性命名） |

### 4. terminal 目录

| 原文件名 | 新文件名 | 说明 |
|----------|----------|------|
| TerminalPanel.tsx | TerminalPanel.tsx | ✓ 保持不变（Panel 后缀正确） |
| TerminalTabs.tsx | TerminalTabs.tsx | ✓ 保持不变（Tabs 后缀正确） |
| TerminalWindowApp.tsx | TerminalWindowApp.tsx | ✓ 保持不变（WindowApp 后缀正确） |
| PaneLayoutView.tsx | PaneLayoutView.tsx | ✓ 保持不变（View 后缀正确） |

### 5. 其他目录

settings、editor、windows、ui 目录命名已统一，无需修改。

---

## 四、执行步骤

### 步骤 1：重命名 DocumentList → DocumentSidebar

1. 重命名文件：`src/components/documents/DocumentList.tsx` → `DocumentSidebar.tsx`
2. 更新 App.tsx 中的导入语句
3. 更新组件内部注释（如有）
4. 搜索其他可能引用该组件的位置并更新

### 步骤 2：验证构建

运行 TypeScript 编译检查，确保所有导入路径正确。

---

## 五、总结

### 最终命名规范

| 层级/位置 | 推荐后缀 | 保留功能性命名 |
|-----------|----------|----------------|
| Bar (标题栏/活动栏) | `Bar` | - |
| Sidebar (侧边栏) | `Sidebar` | - |
| Panel (主面板) | `Panel` | - |
| Tabs (标签栏) | `Tabs` | - |
| Editor (编辑器) | `Editor` | - |
| Section (设置分区) | `Section` | - |
| WindowApp (独立窗口) | `WindowApp` | - |
| Dialog (对话框) | `Dialog` | - |
| ContextMenu (上下文菜单) | `ContextMenu` | - |
| View (视图组件) | `View` | - |
| UI 基础组件 | - | 功能性命名（List, Tree, Button 等） |

### 本次修改清单

**只需修改 1 个文件**：
- `DocumentList.tsx` → `DocumentSidebar.tsx`

其他文件命名已符合规范。