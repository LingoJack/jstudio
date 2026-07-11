//! JStudio Agent integration layer.
//!
//! This module bridges JStudio's React GUI with the j-agent core engine.
//! Architecture:
//! - Layer 1: j-agent core (reused directly)
//! - Layer 2: This module (Tauri mediator)
//! - Layer 3: React GUI (AgentPanel.tsx + agentSlice.ts)
//!
//! The pattern mirrors terminal.rs:
//! - Global AGENT_SESSIONS registry
//! - Background thread for agent loop
//! - Tauri events for streaming data

use j_agent::agent::config::{AgentLoopConfig, AgentLoopSharedState};
use j_agent::agent::{run_main_agent_loop, MainAgentLoopParams};
use j_agent::context::compact::{new_invoked_skills_map, CompactConfig, InvokedSkillsMap};
use j_agent::infra::hook::HookManager;
use j_agent::message_types::{PlanDecision, StreamMsg, ToolResultMsg};
use j_agent::storage::session::{SessionMetaFile, SessionPaths};
use j_agent::storage::types::{
    ChatMessage, DisplayHint, ImageData as StorageImageData, MessageRole, ToolCallItem,
};
use j_agent::storage::{
    agent_data_dir, append_session_event, delete_session, generate_session_id, list_sessions,
    load_agent_config, load_display_session, load_system_prompt, save_session_meta_file,
    SessionEvent,
};
use j_agent::tools::background::BackgroundManager;
use j_agent::tools::definition::{ImageData as ToolsImageData, ToolRegistry};
use j_agent::tools::derived_shared::SubAgentMetrics;
use j_agent::tools::task::TaskManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

// ────────────────────────────────────────────────
// Session state
// ────────────────────────────────────────────────

/// A live agent session handle.
/// Contains the shared state + channels for communication with the agent thread.
pub struct AgentSessionHandle {
    #[allow(dead_code)]
    pub session_id: String,
    /// Streaming content buffer (agent writes, UI reads)
    pub streaming_content: Arc<Mutex<String>>,
    /// Streaming reasoning content buffer
    pub streaming_reasoning_content: Arc<Mutex<String>>,
    /// Display messages (for UI rendering)
    pub display_messages: Arc<Mutex<Vec<ChatMessage>>>,
    /// Context messages (for LLM context)
    pub context_messages: Arc<Mutex<Vec<ChatMessage>>>,
    /// Pending user messages queue
    pub pending_user_messages: Arc<Mutex<Vec<ChatMessage>>>,
    /// Cancel token
    pub cancel_token: CancellationToken,
    /// Sender for tool results (UI -> agent)
    pub tool_result_tx: Mutex<Option<mpsc::Sender<ToolResultMsg>>>,
    /// Receiver for stream messages (agent -> UI)
    pub stream_rx: Mutex<Option<mpsc::Receiver<StreamMsg>>>,
    /// Whether the agent loop is currently running
    pub is_running: Mutex<bool>,
    /// Tool registry
    pub tool_registry: Arc<ToolRegistry>,
    /// Background manager
    pub background_manager: Arc<BackgroundManager>,
    /// Task manager
    pub task_manager: Arc<TaskManager>,
    /// Hook manager
    pub hook_manager: Arc<Mutex<HookManager>>,
    /// Invoked skills map
    pub invoked_skills: InvokedSkillsMap,
}

/// Lightweight session info returned to frontend.
#[derive(Serialize, Clone)]
pub struct AgentSessionInfo {
    pub id: String,
    pub title: Option<String>,
    #[serde(rename = "messageCount")]
    pub message_count: usize,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
    pub workspace: Option<String>,
}

/// Payload for `agent:chunk` event.
#[derive(Serialize, Clone)]
pub struct ChunkPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub content: String,
}

/// Payload for `agent:reasoning` event.
#[derive(Serialize, Clone)]
pub struct ReasoningPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub content: String,
}

/// Payload for `agent:tool-request` event.
#[derive(Serialize, Clone)]
pub struct ToolRequestPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "toolCalls")]
    pub tool_calls: Vec<ToolCallItemSer>,
}

/// Serializable ToolCallItem for frontend.
#[derive(Serialize, Clone)]
pub struct ToolCallItemSer {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

impl From<ToolCallItem> for ToolCallItemSer {
    fn from(item: ToolCallItem) -> Self {
        Self {
            id: item.id,
            name: item.name,
            arguments: item.arguments,
        }
    }
}

/// Payload for `agent:done` event.
#[derive(Serialize, Clone)]
pub struct DonePayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

/// Payload for `agent:error` event.
#[derive(Serialize, Clone)]
pub struct ErrorPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub error: String,
}

/// Payload for `agent:cancelled` event.
#[derive(Serialize, Clone)]
pub struct CancelledPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

/// Payload for `agent:retrying` event.
#[derive(Serialize, Clone)]
pub struct RetryingPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub attempt: u32,
    #[serde(rename = "maxAttempts")]
    pub max_attempts: u32,
    #[serde(rename = "delayMs")]
    pub delay_ms: u64,
    pub error: String,
}

/// Payload for `agent:compacting` event.
#[derive(Serialize, Clone)]
pub struct CompactingPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

/// Payload for `agent:compacted` event.
#[derive(Serialize, Clone)]
pub struct CompactedPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "messagesBefore")]
    pub messages_before: usize,
}

/// Image data payload for frontend (camelCase).
#[derive(Serialize, Deserialize, Clone)]
pub struct ImageDataPayload {
    pub base64: String,
    #[serde(rename = "mediaType")]
    pub media_type: String,
}

impl From<ImageDataPayload> for StorageImageData {
    fn from(p: ImageDataPayload) -> Self {
        Self {
            base64: p.base64,
            media_type: p.media_type,
        }
    }
}

impl From<ImageDataPayload> for ToolsImageData {
    fn from(p: ImageDataPayload) -> Self {
        Self {
            base64: p.base64,
            media_type: p.media_type,
        }
    }
}

/// Message payload for frontend.
#[derive(Serialize, Clone)]
pub struct MessagePayload {
    pub role: String,
    pub content: String,
    #[serde(rename = "toolCalls", skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCallItemSer>>,
    #[serde(rename = "toolCallId", skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(rename = "reasoningContent", skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    #[serde(rename = "senderName", skip_serializing_if = "Option::is_none")]
    pub sender_name: Option<String>,
}

impl From<&ChatMessage> for MessagePayload {
    fn from(msg: &ChatMessage) -> Self {
        Self {
            role: msg.role.as_str().to_string(),
            content: msg.content.clone(),
            tool_calls: msg
                .tool_calls
                .as_ref()
                .map(|tc| tc.iter().map(|t| t.clone().into()).collect()),
            tool_call_id: msg.tool_call_id.clone(),
            reasoning_content: msg.reasoning_content.clone(),
            sender_name: msg.sender_name.clone(),
        }
    }
}

/// Parameters for `agent_send_message`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageParams {
    pub session_id: String,
    pub text: String,
    pub images: Option<Vec<ImageDataPayload>>,
}

/// Parameters for `agent_tool_result`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultParams {
    pub session_id: String,
    pub tool_call_id: String,
    pub result: String,
    pub is_error: bool,
    pub images: Option<Vec<ImageDataPayload>>,
    #[serde(default)]
    pub plan_decision: Option<String>,
}

// Global session registry, keyed by session id.
static AGENT_SESSIONS: std::sync::LazyLock<Mutex<HashMap<String, AgentSessionHandle>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

// ────────────────────────────────────────────────
// Phase 1: Basic CRUD commands
// ────────────────────────────────────────────────

/// List all agent sessions from j-agent storage.
#[tauri::command]
pub fn agent_list_sessions() -> Result<Vec<AgentSessionInfo>, String> {
    let _ = agent_data_dir();

    let sessions = list_sessions();
    Ok(sessions
        .into_iter()
        .map(|s| AgentSessionInfo {
            id: s.id,
            title: s.title,
            message_count: s.message_count,
            updated_at: s.updated_at,
            workspace: s.workspace,
        })
        .collect())
}

/// Create a new agent session.
/// Returns the session id.
#[tauri::command]
pub fn agent_create_session(
    title: Option<String>,
    workspace: Option<String>,
) -> Result<String, String> {
    let _ = agent_data_dir();

    let session_id = generate_session_id();
    let paths = SessionPaths::new(&session_id);
    paths.ensure_dir().map_err(|e| e.to_string())?;

    // Create initial meta file
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let meta = SessionMetaFile {
        id: session_id.clone(),
        title: title.unwrap_or_default(),
        message_count: 0,
        created_at: now,
        updated_at: now,
        model: None,
        auto_approve: false,
        workspace,
    };
    if !save_session_meta_file(&meta) {
        return Err("Failed to save session meta".to_string());
    }

    Ok(session_id)
}

/// Load an existing session's messages.
#[tauri::command]
pub fn agent_load_session(session_id: String) -> Result<Vec<MessagePayload>, String> {
    let messages = load_display_session(&session_id);
    Ok(messages.iter().map(MessagePayload::from).collect())
}

/// Delete a session (both from registry and storage).
#[tauri::command]
pub fn agent_delete_session(session_id: String) -> Result<(), String> {
    // Remove from registry if present
    {
        let mut sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = sessions.remove(&session_id) {
            handle.cancel_token.cancel();
        }
    }

    // Delete from storage
    if !delete_session(&session_id) {
        return Err("Failed to delete session".to_string());
    }
    Ok(())
}

// ────────────────────────────────────────────────
// Phase 2: Agent Loop commands
// ────────────────────────────────────────────────

/// Start or resume an agent session in JStudio.
/// Creates a session handle if not already present.
#[tauri::command]
pub fn agent_start_session(session_id: String, _app: AppHandle) -> Result<(), String> {
    // Check if session already exists in registry
    {
        let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        if sessions.contains_key(&session_id) {
            return Ok(()); // Already started
        }
    }

    // Load existing messages
    let messages = load_display_session(&session_id);

    // Create managers
    let background_manager = Arc::new(BackgroundManager::new());
    let task_manager = Arc::new(TaskManager::new_with_session(&session_id));
    let hook_manager = Arc::new(Mutex::new(HookManager::load()));
    let invoked_skills = new_invoked_skills_map();
    let cancel_token = CancellationToken::new();

    // Paths for todos
    let paths = SessionPaths::new(&session_id);
    let todos_file_path = paths.todos_file();

    // Create ToolRegistry with placeholder ask_tx (will be replaced in spawn_agent_loop)
    // AskRequest channel is needed for Ask tool, but we handle Ask via frontend UI
    let (ask_tx, _ask_rx) = mpsc::channel();
    let tool_registry = Arc::new(ToolRegistry::new(
        vec![], // skills - loaded dynamically
        ask_tx,
        Arc::clone(&background_manager),
        Arc::clone(&task_manager),
        Arc::clone(&hook_manager),
        invoked_skills.clone(),
        todos_file_path,
    ));

    // Create shared state buffers
    let streaming_content = Arc::new(Mutex::new(String::new()));
    let streaming_reasoning_content = Arc::new(Mutex::new(String::new()));
    let pending_user_messages = Arc::new(Mutex::new(Vec::new()));
    let display_messages = Arc::new(Mutex::new(messages.clone()));
    let context_messages = Arc::new(Mutex::new(messages));

    // Create handle
    let handle = AgentSessionHandle {
        session_id: session_id.clone(),
        streaming_content,
        streaming_reasoning_content,
        display_messages,
        context_messages,
        pending_user_messages,
        cancel_token,
        tool_result_tx: Mutex::new(None),
        stream_rx: Mutex::new(None),
        is_running: Mutex::new(false),
        tool_registry,
        background_manager,
        task_manager,
        hook_manager,
        invoked_skills,
    };

    // Register session
    {
        let mut sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id, handle);
    }

    Ok(())
}

/// Send a user message to the agent session.
/// Spawns the agent loop if not already running.
#[tauri::command]
pub async fn agent_send_message(params: SendMessageParams, app: AppHandle) -> Result<(), String> {
    let session_id = params.session_id.clone();

    // Ensure session is started
    agent_start_session(session_id.clone(), app.clone())?;

    // Create user message
    let user_msg = ChatMessage {
        role: MessageRole::User,
        content: params.text,
        tool_calls: None,
        tool_call_id: None,
        images: params
            .images
            .map(|imgs| imgs.into_iter().map(StorageImageData::from).collect()),
        reasoning_content: None,
        sender_name: None,
        recipient_name: None,
        display_hint: DisplayHint::Normal,
    };

    // Push to pending queue, display, and persist within single lock scope
    let is_running = {
        let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        let handle = sessions.get(&session_id).ok_or("Session not found")?;

        // Push to pending queue (for agent loop to pick up)
        {
            let mut pending = handle
                .pending_user_messages
                .lock()
                .map_err(|e| e.to_string())?;
            pending.push(user_msg.clone());
        }

        // Push to display messages (for UI)
        {
            let mut display = handle.display_messages.lock().map_err(|e| e.to_string())?;
            display.push(user_msg.clone());
        }

        // Persist to session
        let event = SessionEvent::msg(user_msg);
        if !append_session_event(&session_id, &event) {
            return Err("Failed to append session event".to_string());
        }

        // Check if already running
        let running = handle.is_running.lock().map_err(|e| e.to_string())?;
        *running
    };

    // Spawn agent loop if not running
    if !is_running {
        spawn_agent_loop(session_id, app)?;
    }

    Ok(())
}

/// Submit a tool result back to the agent.
#[tauri::command]
pub fn agent_tool_result(params: ToolResultParams) -> Result<(), String> {
    let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
    let handle = sessions
        .get(&params.session_id)
        .ok_or("Session not found")?;

    // Parse plan decision
    let plan_decision = match params.plan_decision.as_deref() {
        Some("approve") => PlanDecision::Approve,
        Some("approveAndClearContext") => PlanDecision::ApproveAndClearContext,
        Some("reject") => PlanDecision::Reject,
        _ => PlanDecision::None,
    };

    let result_msg = ToolResultMsg {
        tool_call_id: params.tool_call_id,
        result: params.result,
        is_error: params.is_error,
        images: params
            .images
            .map(|imgs| imgs.into_iter().map(ToolsImageData::from).collect())
            .unwrap_or_default(),
        plan_decision,
    };

    // Get tool_result_tx and send
    let tx_guard = handle.tool_result_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = tx_guard.as_ref() {
        tx.send(result_msg).map_err(|e| e.to_string())?;
    } else {
        return Err("Agent loop not running, no tool result channel".to_string());
    }

    Ok(())
}

/// Cancel the current agent response.
#[tauri::command]
pub fn agent_cancel(session_id: String) -> Result<(), String> {
    let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
    let handle = sessions.get(&session_id).ok_or("Session not found")?;

    handle.cancel_token.cancel();

    // Mark as not running
    {
        let mut running = handle.is_running.lock().map_err(|e| e.to_string())?;
        *running = false;
    }

    Ok(())
}

// ────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────

/// Spawn a thread that listens for StreamMsg and emits Tauri events.
fn spawn_event_listener(
    session_id: String,
    app: AppHandle,
    streaming_content: Arc<Mutex<String>>,
    streaming_reasoning_content: Arc<Mutex<String>>,
    cancel_token: CancellationToken,
) {
    std::thread::spawn(move || {
        // Get stream receiver from session
        let stream_rx = {
            let sessions = AGENT_SESSIONS.lock().ok();
            if let Some(s) = sessions {
                if let Some(h) = s.get(&session_id) {
                    let mut rx = h.stream_rx.lock().ok();
                    if let Some(r) = rx.as_mut() {
                        r.take()
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        };

        let stream_rx = match stream_rx {
            Some(rx) => rx,
            None => return,
        };

        loop {
            if cancel_token.is_cancelled() {
                let _ = app.emit(
                    "agent:cancelled",
                    CancelledPayload {
                        session_id: session_id.clone(),
                    },
                );
                mark_not_running(&session_id);
                break;
            }

            match stream_rx.recv() {
                Ok(msg) => match msg {
                    StreamMsg::Chunk => {
                        let content = streaming_content
                            .lock()
                            .map(|s| s.clone())
                            .unwrap_or_default();
                        let _ = app.emit(
                            "agent:chunk",
                            ChunkPayload {
                                session_id: session_id.clone(),
                                content,
                            },
                        );

                        let reasoning = streaming_reasoning_content
                            .lock()
                            .map(|s| s.clone())
                            .unwrap_or_default();
                        if !reasoning.is_empty() {
                            let _ = app.emit(
                                "agent:reasoning",
                                ReasoningPayload {
                                    session_id: session_id.clone(),
                                    content: reasoning,
                                },
                            );
                        }
                    }
                    StreamMsg::ToolCallRequest(calls) => {
                        let _ = app.emit(
                            "agent:tool-request",
                            ToolRequestPayload {
                                session_id: session_id.clone(),
                                tool_calls: calls.into_iter().map(ToolCallItemSer::from).collect(),
                            },
                        );
                    }
                    StreamMsg::Done => {
                        let _ = app.emit(
                            "agent:done",
                            DonePayload {
                                session_id: session_id.clone(),
                            },
                        );
                        mark_not_running(&session_id);
                        break;
                    }
                    StreamMsg::Error(e) => {
                        let _ = app.emit(
                            "agent:error",
                            ErrorPayload {
                                session_id: session_id.clone(),
                                error: e.display_message(),
                            },
                        );
                        mark_not_running(&session_id);
                        break;
                    }
                    StreamMsg::Cancelled => {
                        let _ = app.emit(
                            "agent:cancelled",
                            CancelledPayload {
                                session_id: session_id.clone(),
                            },
                        );
                        mark_not_running(&session_id);
                        break;
                    }
                    StreamMsg::Retrying {
                        attempt,
                        max_attempts,
                        delay_ms,
                        error,
                    } => {
                        let _ = app.emit(
                            "agent:retrying",
                            RetryingPayload {
                                session_id: session_id.clone(),
                                attempt,
                                max_attempts,
                                delay_ms,
                                error,
                            },
                        );
                    }
                    StreamMsg::Compacting => {
                        let _ = app.emit(
                            "agent:compacting",
                            CompactingPayload {
                                session_id: session_id.clone(),
                            },
                        );
                    }
                    StreamMsg::Compacted { messages_before } => {
                        let _ = app.emit(
                            "agent:compacted",
                            CompactedPayload {
                                session_id: session_id.clone(),
                                messages_before,
                            },
                        );
                    }
                },
                Err(mpsc::RecvError) => {
                    // Channel closed, agent thread exited
                    mark_not_running(&session_id);
                    break;
                }
            }
        }
    });
}

/// Mark a session as not running.
fn mark_not_running(session_id: &str) {
    if let Some(sessions) = AGENT_SESSIONS.lock().ok() {
        if let Some(handle) = sessions.get(session_id) {
            if let Ok(mut r) = handle.is_running.lock() {
                *r = false;
            }
        }
    }
}

/// Spawn the agent loop in a tokio runtime.
fn spawn_agent_loop(session_id: String, app: AppHandle) -> Result<(), String> {
    // Collect everything needed within one lock scope
    let (config, provider, messages, shared_state_components) = {
        let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        let handle = sessions.get(&session_id).ok_or("Session not found")?;

        // Mark as running
        {
            let mut running = handle.is_running.lock().map_err(|e| e.to_string())?;
            *running = true;
        }

        let config = load_agent_config();
        let provider = config
            .providers
            .get(config.active_index)
            .cloned()
            .ok_or("No active provider")?;

        // Get current context messages
        let messages = handle
            .context_messages
            .lock()
            .map_err(|e| e.to_string())?
            .clone();

        // Collect shared state components (Arc refs)
        (
            config,
            provider,
            messages,
            (
                handle.streaming_content.clone(),
                handle.streaming_reasoning_content.clone(),
                handle.pending_user_messages.clone(),
                handle.display_messages.clone(),
                handle.context_messages.clone(),
                handle.cancel_token.clone(),
                handle.tool_registry.clone(),
                handle.background_manager.clone(),
                handle.task_manager.clone(),
                handle.hook_manager.clone(),
                handle.invoked_skills.clone(),
            ),
        )
    };

    // Create channels for this invocation
    let (stream_tx, stream_rx) = mpsc::channel();
    let (tool_result_tx, tool_result_rx) = mpsc::channel();

    // Update channels in handle
    {
        let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        let handle = sessions.get(&session_id).ok_or("Session not found")?;
        {
            let mut rx_guard = handle.stream_rx.lock().map_err(|e| e.to_string())?;
            *rx_guard = Some(stream_rx);
        }
        {
            let mut tx_guard = handle.tool_result_tx.lock().map_err(|e| e.to_string())?;
            *tx_guard = Some(tool_result_tx);
        }
    }

    let (
        streaming_content,
        streaming_reasoning_content,
        pending_user_messages,
        display_messages,
        context_messages,
        cancel_token,
        tool_registry,
        background_manager,
        _task_manager,
        _hook_manager,
        invoked_skills,
    ) = shared_state_components;

    // Spawn event listener
    spawn_event_listener(
        session_id.clone(),
        app,
        streaming_content.clone(),
        streaming_reasoning_content.clone(),
        cancel_token.clone(),
    );

    // Create agent loop config
    let loop_config = AgentLoopConfig {
        provider,
        max_llm_rounds: config.max_tool_rounds,
        compact_config: CompactConfig::default(),
        hook_manager: HookManager::load(),
        disabled_hooks: config.disabled_hooks.clone(),
        cancel_token: cancel_token.clone(),
    };

    // Create shared state
    let shared = AgentLoopSharedState {
        streaming_content,
        streaming_reasoning_content,
        pending_user_messages,
        background_manager,
        todo_manager: Arc::clone(&tool_registry.todo_manager),
        display_messages,
        context_messages,
        estimated_context_tokens: Arc::new(Mutex::new(0)),
        invoked_skills,
        session_id: session_id.clone(),
        derived_system_prompt: Arc::new(Mutex::new(None)),
        tool_registry,
        disabled_tools: config.disabled_tools.clone(),
        deferred_tools: Arc::new(Mutex::new(config.deferred_tools.clone())),
        session_loaded_deferred: Arc::new(Mutex::new(Vec::new())),
        tools_enabled: config.tools_enabled,
        sub_agent_metrics: Arc::new(Mutex::new(SubAgentMetrics::default())),
    };

    // System prompt loader
    let system_prompt_fn: Arc<dyn Fn() -> Option<String> + Send + Sync> =
        Arc::new(|| load_system_prompt());

    // Spawn in tokio runtime
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            run_main_agent_loop(MainAgentLoopParams {
                config: loop_config,
                shared,
                messages,
                system_prompt_fn,
                tx: stream_tx,
                tool_result_rx,
            })
            .await;
        });
    });

    Ok(())
}
