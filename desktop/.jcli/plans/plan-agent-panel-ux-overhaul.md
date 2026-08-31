# Agent Panel UX 改造计划（仿照 jcli remote）

## 背景

- `AgentSidebar.tsx` 中有 4 个没有任何实际功能的 icon 入口（助理/技能/自动化/更多），只切换本地 `activeView` state，需要删除。
- `AgentChat.tsx` 相比 `jcli/assets/remote/`（JCLI 自带的远程网页，同一套 agent 核心）有明显 UX 差距：
  1. 顶栏有 4 个死按钮（历史/分享/收藏/更多）
  2. 任何消息变化都强制平滑滚动到底部，用户上翻阅读历史时被反复拽回
  3. 中文输入法（IME）按 Enter 选字会直接误发送消息（无 composition 处理）
  4. 工具执行后只留下一个没有工具名的「工具结果」气泡；重新加载历史后 tool call 完全消失
  5. 工具结果气泡的展开/折叠按钮文案错误地显示为「停止」/「历史」
  6. textarea 固定 2 行不自动增高；运行中 placeholder 不变
  7. 自动批准状态是纯文本不可点击

## 改动范围

只改前端（React/TS），**不动 Rust 后端**（agent.rs / agent_loop.rs 提供的事件已足够）。

## 任务 1：AgentSidebar 删除无用 icon 入口

文件：`src/components/agent/AgentSidebar.tsx`

- 删除 4 个死入口菜单项：助理（Sparkles)、技能（Puzzle)、自动化（Zap)、更多（MoreHorizontal)
- 删除 `activeView` state（唯一用途就是上述死入口）
- 删除无用的 lucide imports：`Sparkles, Puzzle, Zap, MoreHorizontal`
- 保留：新建任务、WorkspaceList、WorkspaceSelectModal
- 更新文件头注释（去掉「助理、技能等」描述）

## 任务 2：AgentChat UX 改造（仿照 remote）

文件：`src/components/agent/AgentChat.tsx`（主要）、`src/types/agent.ts`、`src/store/agentSlice.ts`、`src/components/agent/ModelSelector.tsx`、`src/lib/core/i18n/translations.ts`

### 2.1 TopBar 重构（remote header 模式）
- 删除死按钮：History / Share2 / Star / MoreHorizontal，及 `isFavorite` state 和相关 imports
- 标题旁保留 RunStateBadge
- 右侧改为 remote 风格的有用信息：当前模型名（复用 ModelSelector 的 config 加载逻辑）、消息数（N 条）、autoApprove 开启时的 `>>` 警示指示器

### 2.2 智能自动滚动（remote 的 autoScrollRef 模式）—— 核心痛点
- 消息容器加 `ref` + `onScroll`：距底部 < 80px 视为「在底部」，记录到 `autoScrollRef`
- 仅在「在底部」时自动滚动（用瞬时滚动 `scrollTop = scrollHeight`，避免 streaming 时 smooth 滚动抖动）
- 用户上翻时显示浮动「↓ 回到底部」按钮，点击恢复
- 发送消息 / 切换 session 时强制回到底部

### 2.3 IME 输入法合成处理（remote 的 composingRef 模式）—— 关键 bug
- `composingRef` + `onCompositionStart` / `onCompositionEnd`
- keydown 中检查 `composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229`，跳过发送

### 2.4 textarea 自动增高
- 输入时 `height = auto → min(scrollHeight, 140px)`，发送后重置

### 2.5 工具结果气泡：显示工具名 + 修复文案 bug
- `types/agent.ts`：`toolResult` 增加 `toolName?: string`
- `agentSlice.ts`：`agent:tool-result` 事件处理中把 `toolName` 存入 `toolResult`（事件 payload 里本来就有，只是被丢弃了）
- `ToolResultBubble`：
  - 头部显示工具名（等宽字体，仿 remote 的 ToolResultMsg）
  - 折叠时显示一行 ~50 字符预览（remote 模式）
  - 修复展开/折叠按钮文案：当前误用 `agent.cancel`（停止）/`agent.history`（历史），改用新增的 `agent.collapse` / `agent.expand`
- 历史消息：AgentChat 从 assistant 消息的 `toolCalls` 构建 `toolCallId → toolName` 映射，补齐历史工具结果的工具名

### 2.6 历史 tool call 气泡渲染（remote session_sync 模式）
- 目前 assistant 消息的 `toolCalls` 在渲染时被完全忽略
- 新增只读 `CompletedToolCallBubble`：折叠参数、无批准/拒绝按钮、显示 ✓ 已完成 状态
- 让重新打开 session 后能完整看到「工具调用 → 工具结果」链路

### 2.7 输入区改进
- placeholder：运行中切换为「追加消息...」（`agent.appendMessage` 已存在）
- auto-approve 纯文本改为可点击开关（调用 store 已有的 `setAgentAutoApprove`），仿 remote 的 switch
- 输入框上方加极简 HintBar：`Enter 发送 · Shift+Enter 换行`

### 2.8 空会话提示
- messages 为空时显示居中提示（Bot icon + 「发送消息开始对话」），新增 `agent.startChat`

### 2.9 ModelSelector
- 导出 `useActiveProviderName()` 之类的 hook（提取 config 加载逻辑），供 TopBar 显示当前模型名

### 2.10 i18n 增删（translations.ts，zh + en 同步）

新增：
- `agent.collapse`: 收起 / Collapse
- `agent.expand`: 展开 / Expand
- `agent.startChat`: 发送消息开始对话 / Send a message to start
- `agent.msgCount`: `{count} 条` / `{count} msgs`
- `agent.scrollToBottom`: 回到底部 / Scroll to bottom
- `agent.hintKeys`: `Enter 发送 · Shift+Enter 换行` / `Enter to send · Shift+Enter for newline`
- `agent.toolCompleted`: 已完成 / Completed

删除（UI 移除后不再被引用，或从未被引用）：
- `agent.assistant`, `agent.skills`, `agent.automation`, `agent.more`
- `agent.history`, `agent.share`, `agent.favorite`, `agent.unfavorite`
- `agent.spaces`, `agent.user`, `agent.settings`
- `agent.noSessions`, `agent.newSession`, `agent.taskName`, `agent.workspaceHint`
- `agent.voiceInput`, `agent.modelVersion`, `agent.disclaimer`, `agent.nextSteps`

## 不改动的部分

- Rust 后端（`src-tauri/src/commands/agent.rs`、`jcli/j-agent/src/agent/agent_loop.rs`）
- ToolCallBubble 的审批交互、PlanReview、AskConfirm 逻辑
- MarkdownMessage、WorkspaceList、ContextSwitchCard
- agentSlice 仅 `tool-result` 一处加 `toolName` 字段

## 验证

1. `npx tsc --noEmit`（或项目对应的 typecheck）确认类型无误
2. `npm run build` 确认 vite 构建通过
