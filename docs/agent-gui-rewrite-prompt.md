# JStudio 内置 GUI Agent —— 重写执行 Prompt

> 用途：交给一个更强的编码模型执行。本文是自包含的，模型只需读本文 + 指明的仓库文件即可开工。
> 目标：把 JStudio（Tauri v2 + React 19 + TypeScript + Zustand）里"内置 AI agent 面板"**重写**为干净、完整、可用的形态。引擎复用 `j-agent` Rust crate，**不重写 j-agent 的核心 agent 循环**，只在必要时给 j-agent 加极小的事件钩子。

---

## 0. 角色与目标

你是一位资深 Rust + React 工程师。任务：重写 JStudio 应用内嵌的 AI 对话 agent 面板，使其达到"产品级可用"。

硬性约束：
- **引擎复用**：agent 运行逻辑来自 `j-agent` crate（`/Users/lingojack/dev_custom/jstudio/jcli/j-agent/`），它已经被 `src-tauri/Cargo.toml` 以 `j_agent = { path = "../jcli/j-agent", package = "j-agent" }` 形式链入。**不要**重写 `run_main_agent_loop`、工具系统、权限系统本身。
- **只重写 JStudio 这一侧**：`src-tauri/src/commands/agent.rs`（Rust 桥）、`src/store/agentSlice.ts`、`src/types/agent.ts`、`src/components/agent/*`、`src/lib/core/storage.ts` 的 agent 封装、i18n。
- **j-agent 只允许极小改动**：若必须让前端看到工具执行结果，仅在 `j-agent` 的 `message_types.rs` 增加 `StreamMsg::ToolResult` 变体并在工具执行后 emit；并同步修好 `j` 终端的 `StreamMsg` 匹配（保持 `j` 仍可编译）。

---

## 1. 背景与现状（必读：为什么当前实现不合格）

代码库里已有部分实现，但**用户明确不满意、要求重写**。现有文件：

- Rust 桥：`src-tauri/src/commands/agent.rs`（约 860 行）
- 前端 store：`src/store/agentSlice.ts`、`src/store/storeHelpers.ts`
- 类型：`src/types/agent.ts`
- 组件：`src/components/agent/AgentPanel.tsx`、`src/components/agent/MarkdownMessage.tsx`
- IPC 封装：`src/lib/core/storage.ts` 中 `agent*` 系列
- 路由/入口：`src/App.tsx`、`src/components/layout/ActivityBar.tsx`、`src/lib/activityMeta.ts`
- i18n：`src/lib/i18n/translations.ts` 的 `agent.*` 键

现有实现的**具体缺陷（重写必须解决）**：

1. **工具执行结果完全不可见**：Rust 桥只 emit `agent:tool-request`（工具"想调用"），随后阻塞等前端回 `agent_tool_result`；但工具**真实输出**没有任何事件下发。最终 `agent:done` 时前端只能塞一个占位 `'(executed)'`。用户永远看不到 bash 返回了什么、文件读到了什么。
2. **所有工具都卡 UI 确认**：桥对每一个 `ToolCallRequest` 都阻塞等待前端回 `tool_result`，但前端 `ToolCallConfirm` 只发 `JSON.stringify({ approved: true })`，**没有"拒绝"、没有 Plan 决策、不能编辑结果**。更糟的是没有"安全工具自动执行 / 危险工具才确认"的区分，也没有全局 bypass，导致 agent 跑不动（每步都要点）。
3. **Plan 模式形同虚设**：`ExitPlanMode` 也只是被当普通工具请求、一键 approve 跳过，没有真正的"审阅计划 → 批准/拒绝/批准后清空上下文"流程。
4. **`agent:compacted` 事件无前端监听**：Rust 已 emit，前端从不知晓上下文被压缩。
5. **监听器从不清理**：`cleanupAgentListeners` 已声明但从未在 App 卸载/关闭时调用，监听器按 session 累积泄漏。
6. **`AgentRunState` 的 `'done'` 状态定义了却从未使用**（done 监听里直接置 `'idle'`），状态语义混乱。
7. **会话必须绑定 workspace**：`NewTaskModal` 强制要求 workspace，无 workspace 的会话被静默跳过；文件类工具的工作目录来源不清。

重写后以"正确形态"为准，不要求保留上述任何具体实现。

---

## 2. 目标架构（重写后的正确形态）

### 2.1 Rust 桥（`src-tauri/src/commands/agent.rs`）

**Commands（保持现有命名，重写实现）：**
- `agent_list_sessions() -> Vec<AgentSessionMeta>`
- `agent_create_session(workspace?: string) -> String`（允许无 workspace）
- `agent_load_session(id) -> AgentSessionMeta`（恢复 display 消息）
- `agent_delete_session(id)`
- `agent_start_session(id)`（内部用，send_message 自动触发，保持）
- `agent_send_message({ sessionId, text, images? })`（入队 + 必要时拉起 loop）
- `agent_tool_result({ sessionId, toolCallId, result, isError, images?, planDecision? })`
- `agent_cancel(sessionId)`
- **新增** `agent_set_auto_approve({ sessionId, enabled })` 或全局开关（见 2.3）
- **新增**（可选）`agent_set_workspace({ sessionId, workspace })`

**事件契约（`app.emit`，payload 均为 `#[derive(Serialize, Clone)]` + `#[serde(rename_all="camelCase")]`，按 `sessionId` 路由）：**
| 事件 | payload | 说明 |
|---|---|---|
| `agent:chunk` | `{ sessionId, content }` | 累积流式文本（或改为 delta，见 5） |
| `agent:reasoning` | `{ sessionId, content }` | 推理过程（o1 风格） |
| `agent:tool-request` | `{ sessionId, toolCalls: ToolCallItem[] }` | LLM 想调工具；**仅当工具需要确认时**才应阻塞等待 `agent_tool_result`（危险工具）；安全工具由后端直接执行并 emit `agent:tool-result` |
| `agent:tool-result` | `{ sessionId, toolCallId, content, isError, images?, status }` | **新增**：工具执行结果（必须由 j-agent 侧 emit，见 2.2） |
| `agent:done` | `{ sessionId }` | 一轮结束 |
| `agent:error` | `{ sessionId, error }` | 出错 |
| `agent:cancelled` | `{ sessionId }` | 被取消 |
| `agent:retrying` | `{ sessionId, attempt, maxAttempts, delayMs, error }` | 重试中 |
| `agent:compacting` | `{ sessionId }` | 压缩中 |
| `agent:compacted` | `{ sessionId, messagesBefore }` | 已压缩 |
| `agent:plan-request` | `{ sessionId, plan }` | **新增**（可选）：`ExitPlanMode` 触发，前端展示计划等批准 |

**工具确认模型（核心修正）：**
- 在 `ToolRegistry` 建表时，依据各工具的 `requires_confirmation()` 把工具分成"需确认（shell/edit/write/delete 等写操作）"与"安全（read/glob/grep/web_fetch 等只读）"。
- 安全工具：后端直接执行，emit `agent:tool-result`（status=`executed`），**不阻塞**。
- 危险工具：emit `agent:tool-request` 并阻塞，等前端 `agent_tool_result`（approved=true/false + 可选编辑后的 result）。
- **全局 bypass / auto-approve 开关**：打开时危险工具也自动执行（对应终端 `--bypass`）。开关存于 session 或全局配置，经 `agent_set_auto_approve` 设置。
- 工具确认超时（可选）：`tool_confirm_timeout` 到点自动执行（参考终端实现）。

**Plan 模式（核心修正）：**
- `ExitPlanMode` 不再走普通 tool-request。后端 detect 到 plan 批准后 emit `agent:plan-request`（带计划文本）；前端展示"批准 / 拒绝 / 批准后清空上下文"三选一；选"批准后清空上下文"时 `agent_tool_result` 带 `planDecision: "approveAndClearContext"`，其余为 `approve` / `reject`。

**并发与状态**：保持 `AGENT_SESSIONS: LazyLock<Mutex<HashMap<String, AgentSessionHandle>>>` 全局表；`AgentSessionHandle` 含 `display_messages`/`context_messages`（`Arc<Mutex<Vec<ChatMessage>>>`）、`pending_user_messages`、`stream_rx`、`tool_result_tx`、`cancel_token`、各 manager。loop 在 `std::thread` + `tokio::Runtime::block_on(run_main_agent_loop(...))` 拉起（现有模式，保留）。

### 2.2 j-agent 极小改动（仅此一处）

在 `j-agent/src/message_types.rs` 的 `StreamMsg` 枚举增加：
```rust
ToolResult(ToolResultMsg),
```
并在 `j-agent/src/agent/agent_loop.rs` 的 `process_tool_calls` / 工具执行完成后，用 `tx.send(StreamMsg::ToolResult(result_msg)).await`（或同步 send）把结果 emit 出去（在把结果回灌上下文之前）。

**务必保持 `j` 终端可编译**：在终端侧匹配 `StreamMsg` 的地方（搜索 `StreamMsg::` 的 match，主要在 `src/command/chat/app/stream_poll.rs` 及 `tool_processor.rs`）增加该变体的处理分支（可渲染成工具结果面板，或先 no-op 仅 `log::debug!`）。`make build-jcli` 必须仍通过。

> 若你认为不该改 j-agent，退路是：工具执行结果本就写进 `context_messages`，前端可在 `agent:done` 后调用一个新增的 `agent_get_context(sessionId)` 命令取回并重建 tool 消息。优先采用"加 ToolResult 事件"的干净方案。

### 2.3 前端 store（`src/store/agentSlice.ts` + `storeHelpers.ts`）

- 状态（每个 session 一个 `AgentSession`）：`id, title, runState, messages: ChatMessage[], streamingContent, streamingReasoningContent, pendingToolCalls, pendingPlan?, retryInfo?, workspace?, createdAt, updatedAt`。
- **事件监听必须覆盖全部事件**：`agent:chunk / reasoning / tool-request / tool-result / done / error / cancelled / retrying / compacting / compacted`（补齐 `compacted`；新增 `tool-result` / `plan-request`）。
- `agent:tool-result`：把对应 `toolCallId` 的结果渲染成 tool 消息气泡（真实内容，不再 `'executed'`），并从 `pendingToolCalls` 移除。
- `agent:tool-request`：仅当为"需确认"工具时，把 `toolCalls` 放进 `pendingToolCalls` 并 `runState='tool_call'`；若是安全工具（应已直接执行），忽略（后端会用 `tool-result` 通知）。
- **新增 actions**：
  - `submitAgentToolResult(sessionId, toolCallId, { approved, result?, isError })` —— 映射到 `agent_tool_result`（保留 `planDecision` 透传）。
  - `submitAgentPlanDecision(sessionId, decision: 'approve'|'reject'|'approveAndClearContext')` —— 映射到 `agent_tool_result` 的 `planDecision`。
  - `setAgentAutoApprove(sessionId, enabled)` / 全局。
  - `setAgentWorkspace(sessionId, workspace)`。
- **清理**：`cleanupAgentListeners` 必须在 `App.tsx` 卸载 / 窗口关闭时调用（接线 `useEffect` cleanup 或 Tauri `window.onClose`）。监听器按 session 去重（现有 `_currentSessionId` 模式可保留/改进）。
- 双通道：前端只需 `messages`（display）；`context_messages` 由后端权威持有。但 `agent_load_session` 要正确恢复 display 消息，确保刷新/继续可用。

### 2.4 前端组件（`src/components/agent/AgentPanel.tsx` + `MarkdownMessage.tsx`）

- 顶层 `AgentPanel({ hidden })` 保持 mount-once + CSS 隐藏模式（与 `TerminalPanel` 一致）。
- 会话列表 `AgentSessionList`：支持无 workspace 会话；新建会话可填/不选工作目录。
- `ChatArea`：消息列表 + 流式气泡（assistant 流式走 `MarkdownMessage`）+ 自动滚动。
- **`ToolCallConfirm`（重写，关键）**：对每个需确认工具显示
  - 工具名 + 参数（可折叠/可滚动）+ 危险标记
  - 按钮：**批准** / **拒绝**；若是 Plan 工具改为**批准计划 / 拒绝 / 批准后清空上下文**
  - 可选地允许编辑将要回传的 result（高级）
  - 拒绝时 `submitAgentToolResult(..., { approved:false, isError:true })`，agent 据此走错误分支
- **`ToolResultBubble`**：渲染 `agent:tool-result` 的真实输出（代码块/可滚动），区分正常/错误。
- **运行态指示**：`thinking / streaming / tool_call / compacting / retrying / error / cancelled / idle`，复用 `RunStateBadge`，并正确处理 `'done'`→`idle` 语义（删除无用的 `'done'` 或真正使用它）。
- **设置区（建议）**：当前会话的 模型/Provider（API base/key/model）、工具开关、auto-approve 开关、工作目录。读取/写入 `j-agent` 的 `AgentConfig`（`src-tauri` 已有的 config 读写）。无密钥时给出明确引导文案。
- 输入框：Enter 发送 / Shift+Enter 换行；运行期允许追加消息（后端已支持排队）。
- 主题：全部用 VSCode CSS 变量（`var(--vscode-*)`），图标用 `lucide-react`，文案走 `useI18n()`。

### 2.5 类型（`src/types/agent.ts`）

在现有类型上扩展（不要破坏现有字段）：
- `ToolCallItem { id, name, arguments, requiresConfirmation?, isDangerous? }`
- `ChatMessage` 增加 `toolResult?` 相关字段（status/isError）以渲染工具结果气泡。
- 新增 `AgentPlanRequest { sessionId, plan }`、`ToolExecResult { toolCallId, content, isError, status }`。
- `AgentRunState` 保持枚举，明确 `'done'` 是否保留（建议移除或明确使用）。

### 2.6 i18n

在 `translations.ts` 的 `agent.*` 下补齐键（中/英）：`rejectTool, planApprove, planReject, planApproveClear, autoApprove, autoApproveDesc, toolResult, toolExecuted, toolFailed, workspace, selectWorkspace, needApiKey, model, apiBase, apiKey, toolsEnabled, noWorkspace, planTitle` 等。遵循现有 `TranslationKey = keyof translations.zh` 规则（zh/en 同键，禁止重复键）。

---

## 3. 明确规定（Do / Don't）

**必须做：**
- 工具真实输出对用户可见（新增 `agent:tool-result`）。
- 安全工具自动执行、危险工具才确认；提供全局 auto-approve 开关。
- Plan 模式有真实审阅/批准流程。
- 补齐 `compacted` 监听 + 应用关闭时清理监听器。
- `tsc` 与 `cargo build`（及 `make build-jcli`）全部通过。
- 遵循现有代码风格（见第 4 节）。

**禁止做：**
- 不要动 `src-tauri/src/commands/jcli.rs`（嵌入 `j` 二进制安装逻辑）以外的无关模块，除非为修编译必须。
- 不要引入与现有 `agent:*` 事件命名冲突的新事件前缀。
- 不要在组件里直接 `invoke(...)`；一律走 `src/lib/core/storage.ts` 封装。
- 不要把 API key 明文写进前端 state 之外的地方或打印到 console（仅用于传给后端）。

---

## 4. 约定（严格遵循现有代码库风格）

- **Rust**：`#[tauri::command] pub fn ...(app: AppHandle) -> Result<_, String>`；跨线程共享状态放 `Arc<Mutex<..>>` 内、集中到 `LazyLock<Mutex<HashMap<..>>>` 全局表；流式用 `app.emit("agent:<evt>", Payload{..})`；每个命令在 `lib.rs` 的 `generate_handler!` 与 `commands/mod.rs` 注册。
- **IPC 封装**：`src/lib/core/storage.ts` 内每个命令一个 `invoke` 包装（camelCase 参数），如现有 `agentSendMessage({ sessionId, text, images })`。
- **Store**：新字段/action 先在 `storeHelpers.ts` 的 `StoreState` 声明签名，再在 `agentSlice.ts` 用 `(set, get)` 实现，最后在 `useStore.ts` 组合。
- **事件**：`import { listen } from '@tauri-apps/api/event'`；监听设置做去重/可清理。
- **UI**：VSCode CSS 变量主题、`lucide-react` 图标、`useI18n()` 文案、面板 mount-once/CSS 隐藏。

---

## 5. 验收标准 / 验证

1. `cd src-tauri && cargo build` 通过；`make build-jcli` 通过（`j` 仍可运行、终端 agent 不受影响）。
2. 前端 `npx tsc --noEmit`（或 `npm run build`）通过——注意 `package.json` 的 `beforeBuildCommand` 会跑 `tsc`，TS 错误会让构建失败。
3. 手动冒烟（dev 模式 `npm run tauri dev`）：
   - 新建会话（可不填 workspace）→ 发消息 → 看到流式 token → 推理块可见。
   - 触发只读工具（如读取某文件 / glob）→ **自动执行**，聊天里出现真实工具结果气泡，无确认弹窗。
   - 触发危险工具（如 shell 命令）→ 弹出确认，可**批准/拒绝**；拒绝后 agent 走错误分支且不执行。
   - 开启 auto-approve → 危险工具也自动跑，工具结果可见。
   - Plan 模式：`ExitPlanMode` 出现计划审阅 UI，三种决策均可生效。
   - 中途取消（cancel）→ 流式停止、状态回 idle。
   - 上下文压缩（`agent:compacting/compacted`）有提示，会话可继续。
   - 关闭/重开窗口 → 会话列表恢复、监听器无泄漏（多次开关不重复触发）。
   - 切换模型/Provider/工作目录生效。

---

## 6. 交付清单（自检）

- [ ] `j-agent/src/message_types.rs` 增加 `StreamMsg::ToolResult` + 终端侧 match 分支编译通过
- [ ] `src-tauri/src/commands/agent.rs` 重写：tool-result emit、安全/危险工具分流、auto-approve、plan-request、全部 `agent:*` 事件
- [ ] `src/types/agent.ts` 类型扩展
- [ ] `src/store/agentSlice.ts` + `storeHelpers.ts`：全事件监听（含 tool-result/compacted）、plan/tool actions、auto-approve、清理接线
- [ ] `src/lib/core/storage.ts`：新增封装（`agentSetAutoApprove` / `agentSetWorkspace` 等）
- [ ] `src/components/agent/AgentPanel.tsx` 重写：ToolCallConfirm（批准/拒绝/plan）、ToolResultBubble、设置区、运行态、无 workspace 会话
- [ ] `src/components/agent/MarkdownMessage.tsx` 保留/增强
- [ ] i18n 补齐 `agent.*` 键（zh+en）
- [ ] `App.tsx` / `ActivityBar.tsx`：清理监听器接线
- [ ] `cargo build` + `make build-jcli` + `tsc --noEmit` 全绿；冒烟通过
