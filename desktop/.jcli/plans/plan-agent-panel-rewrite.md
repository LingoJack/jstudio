# Agent Panel 重写计划

## 1. 现状诊断

### 1.1 已有文件

**Rust 后端**:
- `src-tauri/src/commands/agent.rs` (~860行) — Tauri 桥接层，维护 session map、事件 emit、工具确认阻塞等待

**前端**:
- `src/store/agentSlice.ts` — Zustand slice，管理 session 状态、事件监听
- `src/store/storeHelpers.ts` — StoreState 类型声明
- `src/types/agent.ts` — ChatMessage/AgentSession/ToolCallItem 等类型
- `src/components/agent/AgentPanel.tsx` (~946行) — 主面板组件
- `src/components/agent/MarkdownMessage.tsx` — Markdown 渲染组件
- `src/lib/core/storage.ts` — agent IPC 封装（agentListSessions/agentSendMessage 等）
- `src/lib/core/i18n/translations.ts` — 已有 `agent.*` 键（126个）

**j-agent crate**:
- `jcli/j-agent/src/message_types.rs` — StreamMsg 枚举（Chunk/Reasoning/Done/Error 等）
- `jcli/j-agent/src/agent/tool_processor.rs` — process_tool_calls 逻辑（发送请求、等待结果、更新 messages）
- `jcli/j-agent/src/tools/definition.rs` — Tool trait，含 `requires_confirmation()` 方法
- 各工具实现（shell/edit/write 返回 true；read/glob/grep/web_fetch 返回 false）

### 1.2 核心缺陷（用户重写理由）

| 问题 | 具体表现 | 根因 |
|------|----------|------|
| **工具执行结果不可见** | 前端只能看到占位 `(executed)`，看不到 bash 输出、文件内容等 | agent.rs 只 emit `agent:tool-request`，工具执行后没有 emit `agent:tool-result`，结果只写 `context_messages` |
| **所有工具都卡 UI 确认** | 每个 ToolCallRequest 都阻塞等前端回 `tool_result`，前端一键 approve | 没区分安全工具（read/glob）与危险工具（shell/edit）；没有 auto-approve 开关 |
| **Plan 模式形同虚设** | ExitPlanMode 当普通工具处理，一键跳过 | 没有 `agent:plan-request` 事件、没有计划审阅 UI |
| **`agent:compacted` 未监听** | Rust emit 了但前端无 handler | agentSlice.ts 缺失事件监听 |
| **监听器泄漏** | `cleanupAgentListeners` 未在 App 卸载调用 | 缺少 useEffect cleanup 或 window onClose |
| **`'done'` 状态无用** | done 监听直接置 idle | 状态语义混乱 |
| **强制 workspace** | 无 workspace 会话被跳过 | `groupSessionsByWorkspace` 过滤掉 workspace 为空的 session |

## 2. 目标架构

### 2.1 核心修正（4 大修复）

#### 修复 1：工具执行结果可见

**方案**：在 j-agent 增加 `StreamMsg::ToolResult` 变体，工具执行后 emit

```rust
// jcli/j-agent/src/message_types.rs
pub enum StreamMsg {
    // ... 现有变体
    ToolResult(ToolResultMsg),  // 新增
}

pub struct ToolResultMsg {
    pub session_id: String,
    pub tool_call_id: String,
    pub content: String,
    pub is_error: bool,
    pub images: Option<Vec<ImageData>>,
    pub status: ToolExecStatus,  // "executed" / "rejected" / "auto_approved"
}
```

**j-agent 改动点**:
- `tool_processor.rs` 的 `process_tool_calls` 函数，在工具执行完成后、结果回灌上下文前，用 `tx.send(StreamMsg::ToolResult(result_msg))` emit
- 保持终端编译：在 `jcli/src/command/chat/app/stream_poll.rs` 增加 `StreamMsg::ToolResult` 匹配分支（渲染工具结果面板或 no-op）

**Rust 桥改动**:
- `agent.rs` 监听 `StreamMsg::ToolResult`，转发 `app.emit("agent:tool-result", payload)`
- payload 按 session 路由

#### 修复 2：安全/危险工具分流 + auto-approve

**方案**：利用 j-agent 已有的 `requires_confirmation()` 分流

```rust
// agent.rs process_tool_calls 前置分流
for tool_item in &tool_items {
    let tool = tool_registry.get(&tool_item.name);
    let requires_confirm = tool.map(|t| t.requires_confirmation()).unwrap_or(false);
    
    if !requires_confirm || session.auto_approve {
        // 安全工具或 auto-approve 开启 → 直接执行，emit tool-result，不阻塞
        execute_tool_directly(tool_item, ctx);
    } else {
        // 危险工具且未 auto-approve → emit tool-request，阻塞等前端回复
        emit_tool_request_and_wait(tool_item, ctx);
    }
}
```

**新增 session 字段**:
- `auto_approve: bool` — 全局 bypass 开关
- 命令：`agent_set_auto_approve({ sessionId, enabled })`

#### 修复 3：Plan 模式真实审阅

**方案**：`ExitPlanMode` 不走普通 tool-request，单独处理

```rust
// j-agent plan.rs detect ExitPlanMode → emit plan-request（通过 StreamMsg 新增变体或复用 ToolRequest 加 plan 字段）
// agent.rs 监听 → emit "agent:plan-request"
```

**前端 Plan UI**:
- 展示计划文本（折叠/滚动）
- 三按钮：批准 / 拒绝 / 批准后清空上下文
- 回传：`agent_tool_result({ ..., planDecision: "approve" | "reject" | "approveAndClearContext" })`

#### 修复 4：事件监听补齐 + 清理

- 补齐 `agent:compacted` 监听（已有 payload `{ sessionId, messagesBefore }`）
- 新增 `agent:tool-result` 监听
- 新增 `agent:plan-request` 监听
- App.tsx 卸载时调用 `cleanupAgentListeners()`

### 2.2 Rust 桥完整事件契约

| 事件 | payload | 说明 |
|------|---------|------|
| `agent:chunk` | `{ sessionId, content }` | 流式文本（累积或 delta） |
| `agent:reasoning` | `{ sessionId, content }` | 推理过程 |
| `agent:tool-request` | `{ sessionId, toolCalls: ToolCallItem[] }` | **仅危险工具需确认** |
| `agent:tool-result` | `{ sessionId, toolCallId, content, isError, images?, status }` | **新增**：真实工具输出 |
| `agent:plan-request` | `{ sessionId, plan }` | **新增**：计划审阅 |
| `agent:done` | `{ sessionId }` | 一轮结束 |
| `agent:error` | `{ sessionId, error }` | 出错 |
| `agent:cancelled` | `{ sessionId }` | 被取消 |
| `agent:retrying` | `{ sessionId, attempt, maxAttempts, delayMs, error }` | 重试中 |
| `agent:compacting` | `{ sessionId }` | 压缩中 |
| `agent:compacted` | `{ sessionId, messagesBefore }` | 已压缩 |

### 2.3 前端类型扩展

```typescript
// src/types/agent.ts

export interface ToolCallItem {
  id: string;
  name: string;
  arguments: string;
  requiresConfirmation?: boolean;  // 新增：后端标注
  isDangerous?: boolean;           // 新增：用于 UI 高亮
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCallItem[];
  toolCallId?: string;
  images?: ImageData[];
  // 新增：工具结果渲染用
  toolResult?: {
    status: 'executed' | 'rejected' | 'auto_approved';
    isError: boolean;
  };
}

export interface AgentSession {
  id: string;
  title: string;
  runState: AgentRunState;
  messages: ChatMessage[];
  streamingContent: string;
  streamingReasoningContent: string;
  pendingToolCalls: ToolCallItem[];
  pendingPlan?: AgentPlanRequest;  // 新增
  retryInfo?: RetryInfo;
  workspace?: string;  // 改为可选（允许无 workspace）
  autoApprove: boolean;  // 新增
  createdAt: number;
  updatedAt: number;
}

export type AgentRunState = 
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'tool_call'      // 仅危险工具等待确认
  | 'plan_review'    // 新增：Plan 审阅态
  | 'compacting'
  | 'retrying'
  | 'error'
  | 'cancelled';
  // 移除 'done'（语义不清）

export interface AgentPlanRequest {
  sessionId: string;
  plan: string;
}

export interface ToolExecResult {
  toolCallId: string;
  content: string;
  isError: boolean;
  status: 'executed' | 'rejected' | 'auto_approved';
  images?: ImageData[];
}
```

### 2.4 前端 store Actions 新增

```typescript
// src/store/agentSlice.ts

// 现有（保持）
initAgentSessions: () => void;
createAgentSession: (title?: string, workspace?: string) => Promise<string>;
openAgentSession: (id: string) => void;
deleteAgentSession: (id: string) => void;
sendAgentMessage: (sessionId: string, text: string) => void;
cancelAgent: (sessionId: string) => void;
submitAgentToolResult: (sessionId, toolCallId, result, isError) => void;

// 新增
setAgentAutoApprove: (sessionId: string, enabled: boolean) => void;
submitAgentPlanDecision: (sessionId: string, decision: 'approve' | 'reject' | 'approveAndClearContext') => void;
cleanupAgentListeners: () => void;  // 必须接线 App.tsx卸载
```

### 2.5 前端组件改动

**AgentPanel.tsx 重写要点**:
1. **NewTaskModal**：workspace 可选（不强制）
2. **groupSessionsByWorkspace**：不再过滤无 workspace session，单设 'default' 组
3. **ToolCallConfirm**：重写为三态（批准/拒绝 + Plan 三按钮）
4. **ToolResultBubble**：新增组件，渲染 `agent:tool-result` 真实内容
5. **RunStateBadge**：增加 `plan_review` 状态显示
6. **设置区**：auto-approve 开关（checkbox + 描述）

**MarkdownMessage.tsx**：
- 保持不变，用于 assistant 消息渲染

### 2.6 i18n 新增键

```typescript
// zh
'agent.autoApprove': '自动批准工具',
'agent.autoApproveDesc': '开启后所有工具自动执行，无需确认（相当于终端 --bypass）',
'agent.toolResult': '工具结果',
'agent.toolExecuted': '已执行',
'agent.toolFailed': '执行失败',
'agent.planTitle': '计划审阅',
'agent.planApprove': '批准计划',
'agent.planReject': '拒绝',
'agent.planApproveClear': '批准并清空上下文',
'agent.noWorkspace': '无工作目录',
'agent.selectWorkspaceOptional': '选择工作目录（可选）',
'agent.workspaceOptional': '不设置工作目录时 Agent 将在默认位置操作',
'agent.needApiKey': '请先配置 API Key（设置 → JSpirit）',

// en（对应翻译）
```

## 3. 实施步骤（分阶段）

### Phase 1：j-agent 极小改动（必须先做，否则后续无法工作）

1. `jcli/j-agent/src/message_types.rs` 增加 `StreamMsg::ToolResult(ToolResultMsg)`
2. `jcli/j-agent/src/agent/tool_processor.rs` 工具执行后 emit `ToolResult`
3. `jcli/src/command/chat/app/stream_poll.rs` 增加 `StreamMsg::ToolResult` 匹配分支（no-op 或渲染）
4. `make build-jcli` 确认编译通过

### Phase 2：Rust 桥重写

1. 重写 `agent.rs` process_tool_calls 逻辑：
   - 安全工具：直接执行 + emit tool-result
   - 危险工具：emit tool-request + 阻塞等待
   - auto-approve：所有工具直接执行
2. 监听 `StreamMsg::ToolResult` → emit `agent:tool-result`
3. Plan 检测 → emit `agent:plan-request`
4. Session 增加 `auto_approve` 字段 + `agent_set_auto_approve` 命令
5. 注册所有新命令到 `lib.rs` generate_handler!
6. `cargo build` 确认通过

### Phase 3：前端类型 + store

1. 扩展 `types/agent.ts`（新增字段/类型）
2. 重写 `agentSlice.ts`：
   - 补齐事件监听（tool-result / compacted / plan-request）
   - 新增 actions（setAutoApprove / submitPlanDecision）
   - `cleanupAgentListeners` 实现
3. `storeHelpers.ts` StoreState 增加 `agentAutoApprove` 等字段
4. `storage.ts` 增加 `agentSetAutoApprove` 封装
5. `npx tsc --noEmit` 确认通过

### Phase 4：前端组件

1. 重写 `AgentPanel.tsx`：
   - NewTaskModal workspace 可选
   - ToolCallConfirm 三态按钮
   - ToolResultBubble 组件
   - RunStateBadge 增加 plan_review
   - 设置区（auto-approve checkbox）
2. `App.tsx` useEffect cleanup 调用 `cleanupAgentListeners`
3. 冒烟测试（手动）

### Phase 5：i18n + 收尾

1. 补齐 `translations.ts` agent.* 键（zh + en）
2. 全量冒烟测试（见验收标准）
3. `cargo build` + `make build-jcli` + `tsc --noEmit` + `npm run build` 全绿

## 4. 验收标准

### 4.1 编译门禁

- `cd src-tauri && cargo build` ✅
- `make build-jcli` ✅（j 终端仍可运行）
- `npx tsc --noEmit` ✅（或 `npm run build`）

### 4.2 功能冒烟（手动）

| 场景 | 验证点 |
|------|--------|
| **新建会话** | 可不填 workspace → 会话创建成功 |
| **流式回复** | 发消息 → 看到 token 逐字出现 + 推理块可折叠 |
| **只读工具** | 触发 glob/read → **无确认弹窗**，聊天里出现真实工具结果气泡 |
| **危险工具** | 触发 shell → 弹出确认 UI，可批准/拒绝；拒绝后 agent 走错误分支 |
| **auto-approve** | 开启开关 → 危险工具也自动跑，工具结果可见 |
| **Plan 模式** | ExitPlanMode → 出现计划审阅 UI，三种决策均可生效 |
| **取消** | 中途 cancel → 流式停止、状态回 idle |
| **压缩** | 上下文压缩 → compacting/compacted 有提示，会话可继续 |
| **会话恢复** | 关闭/重开窗口 → 会话列表恢复、监听器无泄漏（多次开关不重复触发） |
| **模型切换** | 设置里切换 Provider → 后续消息用新模型 |
| **无 API Key** | 未配置时给出明确引导文案 |

### 4.3 不测试项（保留终端功能）

- `j` 终端的 agent 功能应保持原有行为（`StreamMsg::ToolResult` 匹配分支可能只是 no-op 或简单渲染，不影响终端主流程）

## 5. 风险点与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| **j-agent 改动影响终端** | 终端编译失败或行为异常 | 先只在 `stream_poll.rs` 增加 no-op 分支；测试 `j chat` 不受影响后再继续 |
| **工具分流逻辑复杂** | 安全/危险判断遗漏工具 | 利用现有 `requires_confirmation()`，逐一核对所有工具实现 |
| **Plan 检测时机** | ExitPlanMode 可能在不同阶段触发 | 参考 j-agent `plan.rs` 现有逻辑，复用 StreamMsg 或单独事件 |
| **监听器清理时机** | App.tsx 卸载可能不触发 | 同时接线 Tauri `window.onCloseRequested` 作为兜底 |

## 6. 文件清单（改动/新增）

**j-agent（最小改动）**:
- `jcli/j-agent/src/message_types.rs` — 增加 ToolResult 变体
- `jcli/j-agent/src/agent/tool_processor.rs` — 工具执行后 emit
- `jcli/src/command/chat/app/stream_poll.rs` — 增加 ToolResult 匹配

**Rust 桥**:
- `src-tauri/src/commands/agent.rs` — 重写（分流/事件/Plan）
- `src-tauri/src/lib.rs` — 注册新命令

**前端类型**:
- `src/types/agent.ts` — 扩展

**前端 store**:
- `src/store/agentSlice.ts` — 重写（事件监听 + actions）
- `src/store/storeHelpers.ts` — StoreState 扩展
- `src/lib/core/storage.ts` — 新增封装

**前端组件**:
- `src/components/agent/AgentPanel.tsx` — 重写
- `src/components/agent/MarkdownMessage.tsx` — 保持
- `src/App.tsx` — cleanup 接线

**i18n**:
- `src/lib/core/i18n/translations.ts` — 补齐键

---

**总工时估算**：2-3 天（熟悉代码库后）

**关键里程碑**：
1. Phase 1 完成 → j-agent 可 emit ToolResult（终端仍可用）
2. Phase 2 完成 → Rust 桥事件完整
3. Phase 3 完成 → 前端可接收所有事件
4. Phase 4 完成 → UI 可交互
5. Phase 5 完成 → 全量验收