# Plan: integrate j-agent as JStudio GUI agent

## 概述

将 `jcli/j-agent/` 核心引擎库集成到 JStudio，在活动栏新增 Agent 页面，提供 GUI 聊天界面替代 jcli 的 TUI。

---

## 1. 架构设计

### 分层复用策略

```
┌─────────────────────────────────────────────────────────┐
│ Layer 3: React GUI (新建)                                │
│  src/components/agent/AgentPanel.tsx                     │
│  src/store/agentSlice.ts                                 │
├─────────────────────────────────────────────────────────┤
│ Layer 2: Tauri Backend Mediator (新建)                   │
│  src-tauri/src/commands/agent.rs                         │
│  - 将 StreamMsg 转换为 Tauri events                       │
│  - 将前端 invoke 转换为 ToolResultMsg                     │
├─────────────────────────────────────────────────────────┤
│ Layer 1: j-agent Core Engine (直接复用)                   │
│  jcli/j-agent/src/agent/agent_loop.rs                    │
│  jcli/j-agent/src/tools/definition.rs (ToolRegistry)     │
│  jcli/j-agent/src/message_types.rs (StreamMsg)           │
│  jcli/j-agent/src/storage/types.rs (ChatMessage)         │
└─────────────────────────────────────────────────────────┘
```

### 数据流

```
React Frontend                     Tauri Backend                    j-agent Thread
┌──────────────────┐              ┌────────────────────┐          ┌─────────────────┐
│ AgentPanel.tsx   │              │ commands/agent.rs  │          │ agent_loop.rs   │
│                  │              │                    │          │                 │
│ 用户输入文本      │  invoke()   │ 创建 shared state  │  spawn   │ run_main_agent  │
│ ───────────────────────────────>│ ──────────────────────────────>_loop()         │
│                  │              │                    │          │                 │
│                  │              │                    │          │ for round in... │
│                  │              │                    │          │   LLM API call  │
│                  │              │                    │          │   stream.next() │
│                  │  emit event  │  listen StreamMsg  │          │   tx.send(Chunk)│
│                  │ <──────────────────────────────────│ <────────────────────────│
│ 更新 streaming   │              │                    │          │                 │
│ 内容显示         │              │                    │          │                 │
│                  │              │                    │          │ tx.send(        │
│                  │  emit event  │                    │ <────────│   ToolCallReq)  │
│ 显示确认对话框    │ <──────────────────────────────────│          │                 │
│                  │              │                    │          │                 │
│ 用户确认/拒绝     │  invoke()   │ 发送 ToolResultMsg │  send    │ rx.recv()       │
│ ───────────────────────────────>│ ──────────────────────────────>│ 继续下一轮      │
│                  │              │                    │          │                 │
│                  │  emit event  │                    │ <────────│ tx.send(Done)   │
│ 显示完成消息      │ <──────────────────────────────────│          │                 │
└──────────────────┘              └────────────────────┘          └─────────────────┘
```

---

## 2. 核心类型映射 (j-agent → TypeScript)

### Rust → TS 类型对照

| Rust 类型 | TS 类型 | 说明 |
|-----------|---------|------|
| `ChatMessage` | `AgentMessage` | 消息结构 |
| `MessageRole` | `'user' \| 'assistant' \| 'tool' \| 'system'` | 角色 |
| `ToolCallItem` | `ToolCallItem` | 工具调用项 |
| `StreamMsg` | 事件 payload | 后端 → 前端事件 |
| `ToolResultMsg` | invoke payload | 前端 → 后端调用 |
| `SessionMeta` | `AgentSessionMeta` | 会话元数据 |

### TS 类型定义 (前端)

```typescript
// src/types/agent.ts

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: ToolCallItem[];
  toolCallId?: string;
  images?: ImageData[];
  reasoningContent?: string;
  senderName?: string;      // teammate/sub-agent 名称
  recipientName?: string;
  timestamp: number;
}

export interface ToolCallItem {
  id: string;
  name: string;
  arguments: string;        // JSON string
}

export interface ToolCallRequest {
  sessionId: string;
  toolCalls: ToolCallItem[];
}

export interface ToolResultPayload {
  sessionId: string;
  toolCallId: string;
  result: string;
  isError: boolean;
  images?: ImageData[];
  planDecision?: 'none' | 'approve' | 'approveAndClearContext' | 'reject';
}

export interface AgentSessionMeta {
  id: string;
  title?: string;
  messageCount: number;
  updatedAt: number;
}
```

---

## 3. Tauri 后端命令设计

### 命令清单

| 命令 | 功能 | 参数 |
|------|------|------|
| `agent_list_sessions` | 列出所有会话 | 无 |
| `agent_create_session` | 创建新会话 | `title?: string` |
| `agent_load_session` | 加载会话消息 | `sessionId: string` |
| `agent_send_message` | 发送用户消息 | `sessionId, text, images?` |
| `agent_tool_result` | 返回工具执行结果 | `sessionId, ToolResultPayload` |
| `agent_cancel` | 取消当前响应 | `sessionId` |
| `agent_delete_session` | 删除会话 | `sessionId` |
| `agent_get_config` | 获取 Agent 配置 | 无 |
| `agent_update_config` | 更新配置 | `AgentConfig` |

### Tauri Events (后端 → 前端)

| Event | Payload | 说明 |
|-------|---------|------|
| `agent:chunk` | `{ sessionId, content }` | 流式文本块 |
| `agent:reasoning` | `{ sessionId, content }` | 思考内容 |
| `agent:tool-request` | `ToolCallRequest` | 工具调用请求 |
| `agent:tool-result` | `{ sessionId, toolCallId, summary, isError }` | 工具执行结果 |
| `agent:done` | `{ sessionId }` | 响应完成 |
| `agent:error` | `{ sessionId, error }` | 错误 |
| `agent:cancelled` | `{ sessionId }` | 用户取消 |
| `agent:retrying` | `{ sessionId, attempt, maxAttempts, delayMs, error }` | 重试 |
| `agent:compacting` | `{ sessionId }` | 正在压缩 |
| `agent:compacted` | `{ sessionId, messagesBefore }` | 压缩完成 |

### 后端架构

```rust
// src-tauri/src/commands/agent.rs

use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;
use j_agent::{
    agent::{AgentLoopConfig, AgentLoopSharedState, run_main_agent_loop},
    storage::{ChatMessage, ModelProvider, AgentConfig, SessionMeta, load_agent_config},
    tools::definition::ToolRegistry,
    message_types::{StreamMsg, ToolResultMsg},
};

/// 全局会话注册表 (类似 terminal 的 PTY registry)
static AGENT_SESSIONS: Lazy<Mutex<HashMap<String, AgentSessionHandle>>> = Lazy::new(|| ...);

struct AgentSessionHandle {
    config: AgentLoopConfig,
    shared: AgentLoopSharedState,
    cancel_token: CancellationToken,
    /// 从 agent 线程接收 StreamMsg 的通道
    stream_rx: mpsc::Receiver<StreamMsg>,
    /// 向 agent 线程发送 ToolResultMsg 的通道
    tool_result_tx: mpsc::Sender<ToolResultMsg>,
}

#[tauri::command]
async fn agent_send_message(
    session_id: String,
    text: String,
    images: Option<Vec<ImageData>>,
    app: AppHandle,
) -> Result<(), String> {
    let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
    let handle = sessions.get(&session_id).cloned();
    drop(sessions);
    
    let handle = handle.ok_or("Session not found")?;
    
    // 1. 创建用户消息
    let user_msg = ChatMessage::user_with_images(text, images);
    
    // 2. 推送到 pending_user_messages + display_messages
    handle.shared.pending_user_messages.lock().unwrap().push(user_msg.clone());
    handle.shared.display_messages.lock().unwrap().push(user_msg.clone());
    
    // 3. 如果 agent 未运行，spawn 新循环
    if !handle.is_running() {
        spawn_agent_loop(handle, app)?;
    }
    
    Ok(())
}

/// 在后台线程监听 StreamMsg 并 emit Tauri events
fn spawn_agent_loop(handle: AgentSessionHandle, app: AppHandle) {
    std::thread::spawn(move || {
        let session_id = handle.shared.session_id.clone();
        
        // 监听 StreamMsg
        while let Ok(msg) = handle.stream_rx.recv() {
            match msg {
                StreamMsg::Chunk => {
                    // 从 shared.streaming_content 读取内容
                    let content = handle.shared.streaming_content.lock().unwrap().clone();
                    app.emit("agent:chunk", { session_id, content }).ok();
                    
                    // 同时检查 reasoning_content
                    let reasoning = handle.shared.streaming_reasoning_content.lock().unwrap().clone();
                    if !reasoning.is_empty() {
                        app.emit("agent:reasoning", { session_id, content: reasoning }).ok();
                    }
                }
                StreamMsg::ToolCallRequest(calls) => {
                    app.emit("agent:tool-request", { session_id, toolCalls: calls }).ok();
                }
                StreamMsg::Done => {
                    app.emit("agent:done", { session_id }).ok();
                    break;
                }
                StreamMsg::Error(e) => {
                    app.emit("agent:error", { session_id, error: e.to_string() }).ok();
                    break;
                }
                StreamMsg::Cancelled => {
                    app.emit("agent:cancelled", { session_id }).ok();
                    break;
                }
                StreamMsg::Retrying { attempt, max_attempts, delay_ms, error } => {
                    app.emit("agent:retrying", { session_id, attempt, maxAttempts, delay_ms, error }).ok();
                }
                StreamMsg::Compacting => {
                    app.emit("agent:compacting", { session_id }).ok();
                }
                StreamMsg::Compacted { messages_before } => {
                    app.emit("agent:compacted", { session_id, messagesBefore }).ok();
                }
            }
        }
    });
}

#[tauri::command]
async fn agent_tool_result(
    session_id: String,
    tool_call_id: String,
    result: String,
    is_error: bool,
    images: Option<Vec<ImageData>>,
    plan_decision: Option<String>,
) -> Result<(), String> {
    let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
    let handle = sessions.get(&session_id);
    drop(sessions);
    
    let handle = handle.ok_or("Session not found")?;
    
    // 发送 ToolResultMsg 到 agent 线程
    let msg = ToolResultMsg {
        tool_call_id,
        result,
        is_error,
        images: images.unwrap_or_default(),
        plan_decision: parse_plan_decision(plan_decision),
    };
    
    handle.tool_result_tx.send(msg).map_err(|e| e.to_string())?;
    
    Ok(())
}
```

---

## 4. 前端 Store 设计

### agentSlice.ts

```typescript
// src/store/agentSlice.ts

import { createSlice } from 'zustand';
import type { AgentMessage, AgentSessionMeta, ToolCallItem } from '../types/agent';

interface AgentState {
  // 会话列表
  sessions: AgentSessionMeta[];
  // 当前活跃会话 ID
  activeSessionId: string | null;
  // 每个会话的消息 (sessionId -> messages)
  messagesBySession: Record<string, AgentMessage[]>;
  // 当前流式内容
  streamingContent: string;
  // 当前思考内容
  reasoningContent: string;
  // 是否正在加载
  isLoading: boolean;
  // 待确认的工具调用
  pendingToolCalls: ToolCallItem[] | null;
  // Agent 配置
  config: AgentConfig | null;
}

interface AgentActions {
  // 会话管理
  loadSessions: () => Promise<void>;
  createSession: (title?: string) => Promise<string>;
  setActiveSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  
  // 消息操作
  loadMessages: (sessionId: string) => Promise<void>;
  sendMessage: (text: string, images?: ImageData[]) => Promise<void>;
  cancelResponse: () => Promise<void>;
  
  // 工具操作
  confirmTool: (toolCallId: string, result: string, isError?: boolean) => Promise<void>;
  rejectTool: (toolCallId: string, reason?: string) => Promise<void>;
  
  // 内部更新 (由 event listener 调用)
  _appendStreamingContent: (content: string) => void;
  _appendReasoningContent: (content: string) => void;
  _setPendingToolCalls: (calls: ToolCallItem[] | null) => void;
  _finalizeMessage: () => void;
  _addError: (error: string) => void;
  _setLoading: (loading: boolean) => void;
}
```

---

## 5. 前端组件设计

### ActivityBar 新增 Agent 入口

```tsx
// src/lib/activityMeta.ts - 新增
{
  id: 'agent',
  icon: Bot,  // lucide-react
  label: 'Agent',
}
```

### AgentPanel.tsx

```tsx
// src/components/agent/AgentPanel.tsx

export default function AgentPanel() {
  const activeSessionId = useStore(s => s.activeSessionId);
  const messages = useStore(s => s.messagesBySession[activeSessionId] || []);
  const streamingContent = useStore(s => s.streamingContent);
  const reasoningContent = useStore(s => s.reasoningContent);
  const isLoading = useStore(s => s.isLoading);
  const pendingToolCalls = useStore(s => s.pendingToolCalls);
  
  // 监听 Tauri events
  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    
    (async () => {
      unlisteners.push(await listen('agent:chunk', (e) => {
        useStore.getState()._appendStreamingContent(e.payload.content);
      }));
      
      unlisteners.push(await listen('agent:reasoning', (e) => {
        useStore.getState()._appendReasoningContent(e.payload.content);
      }));
      
      unlisteners.push(await listen('agent:tool-request', (e) => {
        useStore.getState()._setPendingToolCalls(e.payload.toolCalls);
      }));
      
      unlisteners.push(await listen('agent:done', () => {
        useStore.getState()._finalizeMessage();
      }));
      
      unlisteners.push(await listen('agent:error', (e) => {
        useStore.getState()._addError(e.payload.error);
      }));
    })();
    
    return () => unlisteners.forEach(fn => fn());
  }, []);
  
  return (
    <div className="flex flex-col h-full">
      {/* 消息列表 */}
      <MessageList 
        messages={messages}
        streamingContent={streamingContent}
        reasoningContent={reasoningContent}
        isLoading={isLoading}
      />
      
      {/* 输入框 */}
      <InputBox 
        onSend={(text) => useStore.getState().sendMessage(text)}
        disabled={isLoading}
      />
      
      {/* 工具确认对话框 */}
      {pendingToolCalls && (
        <ToolConfirmDialog 
          toolCalls={pendingToolCalls}
          onConfirm={(id, result) => useStore.getState().confirmTool(id, result)}
          onReject={(id) => useStore.getState().rejectTool(id)}
        />
      )}
    </div>
  );
}
```

---

## 6. UI 布局

### 在 App.tsx 中集成

```tsx
// src/App.tsx

// 新增 import
import AgentPanel from './components/agent/AgentPanel';

// 新增 view 判断
const isAgentView = !isSettingsOpen && activeSidebarView === 'agent';

// 在主内容区渲染
{isAgentView ? (
  <AgentPanel />
) : isTerminalView ? (
  ...
) : ...}
```

---

## 7. 存储集成

### 复用 j-agent 的存储系统

j-agent 已有完整的存储实现：
- `~/.jdata/agent/data/agent_config.json` — 配置
- `~/.jdata/agent/data/sessions/{id}/transcript.jsonl` — 消息 transcript
- `~/.jdata/agent/data/sessions/{id}/session.json` — 会话元数据

JStudio 无需新建存储，直接复用即可。后端命令调用 `j_agent::storage::*` 函数。

---

## 8. Cargo.toml 依赖

```toml
# src-tauri/Cargo.toml - 新增

[dependencies]
# j-agent 作为本地 crate
j_agent = { path = "../jcli/j-agent" }

# j-agent 需要的额外依赖 (检查是否已存在)
tokio = { version = "1", features = ["rt-multi-thread", "sync", "time"] }
tokio-util = { version = "0.7", features = ["rt"] }
async-openai = "0.28"  # j-agent 使用的 OpenAI 客户端
reqwest-eventsource = "0.6"  # SSE streaming
rand = "0.8"
```

---

## 9. 实现步骤

### Phase 1: 后端基础 (预计 2-3 小时)

1. **Cargo.toml 依赖配置**
   - 添加 `j_agent = { path = "../jcli/j-agent" }`
   - 检查并补充缺失依赖 (tokio, async-openai 等)

2. **创建 `src-tauri/src/commands/agent.rs`**
   - 实现 `AGENT_SESSIONS` 全局注册表
   - 实现基础命令：`agent_list_sessions`, `agent_create_session`, `agent_load_session`
   - 实现 `agent_get_config`, `agent_update_config`

3. **在 `lib.rs` 注册命令**
   - 添加 `generate_handler!` 中的 agent 命令

### Phase 2: 后端 Agent Loop (预计 3-4 小时)

4. **实现 `agent_send_message`**
   - 创建 ToolRegistry (内置工具)
   - 构建 AgentLoopConfig + AgentLoopSharedState
   - 调用 `run_main_agent_loop` 启动后台线程

5. **实现 StreamMsg → Tauri events 转换**
   - 后台线程监听 stream_rx
   - emit 各种事件 (chunk, tool-request, done 等)

6. **实现 `agent_tool_result` + `agent_cancel`**
   - 发送 ToolResultMsg 到 agent 线程
   - CancellationToken 取消

### Phase 3: 前端 Store (预计 2 小时)

7. **创建 `src/types/agent.ts`**
   - 定义所有 Agent 相关类型

8. **创建 `src/store/agentSlice.ts`**
   - 会话管理状态
   - 消息列表状态
   - 流式内容状态
   - 工具确认状态

9. **更新 `src/store/useStore.ts`**
   - 合入 agentSlice

### Phase 4: 前端 UI (预计 3-4 小时)

10. **更新 `src/lib/activityMeta.ts`**
    - 添加 Agent ActivityBarItem

11. **更新 `src/components/layout/ActivityBar.tsx`**
    - 添加 Agent 按钮

12. **创建 `src/components/agent/AgentPanel.tsx`**
    - 消息列表组件
    - 输入框组件
    - Tauri event listeners

13. **创建工具确认组件**
    - `ToolConfirmDialog.tsx` 或复用 `Ask` 组件

14. **更新 `src/App.tsx`**
    - 添加 Agent 视图渲染

15. **更新 `src/lib/core/i18n.ts`**
    - 添加 Agent 相关翻译 key

### Phase 5: 设置页 (预计 1 小时)

16. **创建 `src/components/settings/AgentSection.tsx`**
    - Provider 配置 (API key, model)
    - 工具开关
    - 其他 Agent 设置

17. **更新 `src/components/settings/Settings.tsx`**
    - 添加 AgentSection 导航

---

## 10. 风险与注意事项

### 已知风险

1. **j-agent 依赖冲突**: j-agent 使用 `async-openai`、`tokio` 等库，可能与 JStudio 现有依赖版本冲突。需仔细检查 Cargo.toml。

2. **线程模型**: j-agent 的 `run_main_agent_loop` 创建自己的 tokio runtime。Tauri 也使用 tokio。需确保两者兼容（可能需要 `rt-multi-thread` feature）。

3. **权限/沙箱**: j-agent 的 Shell 工具可执行任意命令。需要继承 jcli 的权限系统，或提供简化版确认机制。

4. **macOS 特有工具**: `ComputerUse` 工具只在 macOS 可用，需要条件编译。

### 建议

1. **先实现最小可用版本**: 只实现文本聊天 + 基础工具确认，暂不支持 Ask/Plan 等复杂交互。

2. **工具确认简化**: 第一版可统一弹窗确认所有工具调用，后续再按工具类型精细化。

3. **复用现有 UI 组件**: 工具确认对话框可复用 `MenuList`/`MenuItem`，Ask 可复用 `Ask` 组件。

---

## 11. 参考文件

### j-agent 关键文件

| 文件 | 作用 |
|------|------|
| `jcli/j-agent/src/lib.rs` | Crate 入口，导出模块 |
| `jcli/j-agent/src/agent/agent_loop.rs` | Agent Loop 核心 |
| `jcli/j-agent/src/agent/config.rs` | AgentLoopConfig + AgentLoopSharedState |
| `jcli/j-agent/src/tools/definition.rs` | ToolRegistry + Tool trait |
| `jcli/j-agent/src/message_types.rs` | StreamMsg, ToolResultMsg, AskRequest |
| `jcli/j-agent/src/storage/config.rs` | AgentConfig, ModelProvider |
| `jcli/j-agent/src/storage/session.rs` | Session 持久化 |
| `jcli/j-agent/src/storage/types.rs` | ChatMessage, ToolCallItem |

### JStudio 参考实现

| 文件 | 参考点 |
|------|--------|
| `src/store/terminalSlice.ts` | Session 状态管理模式 |
| `src/components/terminal/TerminalPanel.tsx` | Event listener 模式 |
| `src-tauri/src/commands/terminal.rs` | PTY registry + thread spawn 模式 |
| `src/lib/activityMeta.ts` | ActivityBar 注册模式 |
| `src/components/ui/MenuList.tsx` | 工具确认 UI 参考 |
| `src/components/CommandPalette.tsx` | Ask UI 参考 |

---

## 12. 下一步行动

确认计划后，按 Phase 1-5 顺序实现。建议先完成 Phase 1-3 (后端 + Store)，验证数据流正确后再做 UI。