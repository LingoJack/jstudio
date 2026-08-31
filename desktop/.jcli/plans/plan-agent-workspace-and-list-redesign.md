# Agent 工作目录与列表重新设计

## 目标

为 Agent 引入"当前工作目录"概念，让用户能直观地查看和切换工作目录；同时优化侧边栏列表的整体布局和交互体验。

---

## 一、Store 层：新增 `activeAgentWorkspace` 状态

### 文件：`src/store/storeHelpers.ts`
- 在 agent state 区块新增字段：
  ```
  activeAgentWorkspace: string | null;   // 当前工作目录路径
  ```

### 文件：`src/store/agentSlice.ts`
- `initAgentSessions`：从 `settings.agentActiveWorkspace` 加载
- 新增 `setActiveAgentWorkspace(ws: string)` action：设置工作目录 + `storage.saveSettings({ agentActiveWorkspace: ws })` 持久化
- `createAgentSession(workspace)` 不变，但 Sidebar/ChatPanel 调用时会传入 `activeAgentWorkspace`

---

## 二、Sidebar：工作目录上下文栏

### 文件：`src/components/agent/AgentSidebar.tsx`

**侧边栏新布局（从上到下）：**

```
┌──────────────────────────┐
│  [📁 my-project    ▾]    │  ← 工作目录上下文栏（点击弹出下拉）
├──────────────────────────┤
│  [+ 新建任务          >]  │  ← 用 activeAgentWorkspace 创建
├──────────────────────────┤
│  最近任务                │  ← section label
│  ├ 🟢 重构认证模块       │  ← 当前 workspace 的 session
│  ├ ◻ 修复登录bug  3分前  │
│  ├ ◻ 优化数据库   昨天   │
│                          │
│  其他目录                 │  ← collapsible
│  ├ 📁 backend-api   (2)  │
│  ├ 📁 frontend-app  (5)  │
└──────────────────────────┘
```

**工作目录上下文栏：**
- 左侧 FolderOpen 图标 + workspace 文件夹名
- 右侧 ChevronDown/ChevronUp 图标
- 点击弹出自定义下拉菜单（使用浮层）：
  - 已知工作目录列表（来自现有 sessions 的 workspace 集合）
  - 分隔线
  - "打开目录..." 项（调用 Tauri directory picker）
  - 当前选中项有 ✓ 标记
- 未选择时显示 "选择工作目录" 灰色提示

**新建任务按钮改造：**
- 使用 `activeAgentWorkspace` 作为 workspace
- 如果 `activeAgentWorkspace` 为 null，点击按钮先弹出工作目录选择

**列表区域改造：**
- 调用 `groupSessionsByWorkspace(sessions)` 获取所有分组
- 将分组分为两组：
  - `currentGroup`：workspace === activeAgentWorkspace 的分组 → 展开显示，标题"最近任务"
  - `otherGroups`：其余分组 → 折叠在"其他目录"下
- 如果没有 activeAgentWorkspace，所有分组都显示在"其他目录"下

---

## 三、AgentChatPanel 空状态：工作目录感知

### 文件：`src/components/agent/AgentChatPanel.tsx`

**两种空状态：**

1. **未选择工作目录** (`activeAgentWorkspace` 为 null)：
   - 大图标 + "选择工作目录开始"
   - 副标题："Agent 需要一个工作目录来读取和操作文件"
   - 居中按钮："选择工作目录"（点击打开目录选择器）

2. **已选择工作目录**（当前实现，微调）：
   - 保留 Bot 图标 + 欢迎语 + 建议卡片
   - 建议卡片点击时使用 `activeAgentWorkspace` 创建 session
   - 底部显示当前工作目录路径（替代/补充 model 信息）

---

## 四、TopBar：工作目录指示器

### 文件：`src/components/agent/AgentChat.tsx`

- 在标题右侧、RunStateBadge 之后，增加工作目录 badge：
  ```
  [📝 重构认证模块] [🔵 thinking] [📁 my-project]
  ```
- 样式：小号 pill，FolderOpen 图标 + 文件夹名，点击可跳转到 Sidebar 的工作目录选择
- 只在有 active session 时显示，取 `session.workspace`

---

## 五、WorkspaceList 组件改造

### 文件：`src/components/agent/WorkspaceList.tsx`

**新增 props：**
```ts
activeWorkspace: string | null;  // 当前选中的工作目录
```

**改造内容：**

1. **WorkspaceList 主组件**：
   - 接收 `activeWorkspace` prop
   - 将 groups 分为 currentGroup（匹配 activeWorkspace）和 otherGroups
   - currentGroup 的 sessions 以扁平列表显示，顶部加"最近任务"小标题
   - otherGroups 放在"其他目录"可折叠区域下，保留现有 GroupItem 样式

2. **WorkspaceGroupItem**：
   - 当 group.workspace === activeWorkspace 时，高亮 header（加左侧竖条或背景色区分）
   - header 右键菜单增加"设为当前工作目录"选项

3. **SessionItem**：
   - 保持现有两行布局（标题+时间/运行状态）
   - active 时左侧竖条 + 运行状态点（已有）

---

## 六、i18n 新增 key

### 文件：`src/lib/core/i18n/translations.ts`

中英文：
- `agent.currentWorkspace` — "当前工作目录" / "Current Workspace"
- `agent.selectWorkspacePrompt` — "选择工作目录" / "Select Workspace"
- `agent.noWorkspaceSelected` — "未选择工作目录" / "No workspace selected"
- `agent.selectWorkspaceToStart` — "Agent 需要一个工作目录来读取和操作文件" / "Agent needs a workspace to read and modify files"
- `agent.recentTasks` — "最近任务" / "Recent Tasks"
- `agent.otherWorkspaces` — "其他目录" / "Other Workspaces"
- `agent.openDirectory` — "打开目录..." / "Open Directory..."
- `agent.setAsCurrentWorkspace` — "设为当前工作目录" / "Set as Current Workspace"
- `agent.workspaceChanged` — "工作目录已切换" / "Workspace changed"

---

## 七、不变项

- `NavTree.tsx`（NavRow/NavBranch/NavLeaf）不动
- `ModelSelector.tsx` 不动
- 消息气泡相关组件不动（上一轮已完成）
- `storage.ts` 的 `AppSettings` 接口已支持 `[key: string]: unknown`，无需改动

---

## 实施顺序

1. Store 层：`storeHelpers.ts` + `agentSlice.ts` 新增 `activeAgentWorkspace`
2. i18n：新增所有 key
3. `WorkspaceList.tsx`：新增 `activeWorkspace` prop + 列表分组逻辑
4. `AgentSidebar.tsx`：工作目录上下文栏 + 下拉菜单 + 新建任务逻辑
5. `AgentChatPanel.tsx`：空状态工作目录感知
6. `AgentChat.tsx`：TopBar 工作目录 badge
7. 构建验证
