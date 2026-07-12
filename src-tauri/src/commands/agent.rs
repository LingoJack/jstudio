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
//!
//! Key improvements (2024-07 rewrite):
//! - Tool results are visible to users (agent:tool-result event)
//! - Safe tools auto-execute, dangerous tools require confirmation
//! - Plan mode has dedicated review UI
//! - Auto-approve switch for bypassing all confirmations

use j_agent::agent::config::{AgentLoopConfig, AgentLoopSharedState};
use j_agent::agent::{MainAgentLoopParams, run_main_agent_loop};
use j_agent::context::compact::{CompactConfig, InvokedSkillsMap, new_invoked_skills_map};
use j_agent::infra::hook::HookManager;
use j_agent::message_types::{PlanDecision, StreamMsg, ToolResultMsg, ToolResultStatus};
use j_agent::storage::session::{SessionMetaFile, SessionPaths};
use j_agent::storage::types::{
    ChatMessage, DisplayHint, ImageData as StorageImageData, MessageRole, ToolCallItem,
};
use j_agent::storage::{
    SessionEvent, agent_data_dir, append_session_event, delete_session, generate_session_id,
    list_sessions, load_agent_config, load_display_session, load_system_prompt,
    save_session_meta_file,
};
use j_agent::tools::background::BackgroundManager;
use j_agent::tools::definition::{ImageData as ToolsImageData, ToolRegistry};
use j_agent::tools::derived_shared::SubAgentMetrics;
use j_agent::tools::task::TaskManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, mpsc};
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
    /// Ask request receiver (from j-agent Ask tool)
    pub ask_rx: Mutex<Option<mpsc::Receiver<j_agent::message_types::AskRequest>>>,
    /// Ask response sender (back to j-agent)
    pub ask_response_tx: Mutex<Option<mpsc::Sender<String>>>,
    /// Whether the agent loop is currently running
    pub is_running: Mutex<bool>,
    /// Workspace directory for file operations
    pub workspace: Option<String>,
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
    /// Whether this tool requires user confirmation (dangerous operations)
    #[serde(rename = "requiresConfirmation")]
    pub requires_confirmation: bool,
    /// Whether this tool is considered dangerous (write/delete/shell)
    #[serde(rename = "isDangerous")]
    pub is_dangerous: bool,
}

impl From<ToolCallItem> for ToolCallItemSer {
    fn from(item: ToolCallItem) -> Self {
        Self {
            id: item.id,
            name: item.name,
            arguments: item.arguments,
            requires_confirmation: false, // Will be set by caller based on tool registry
            is_dangerous: false,          // Will be set by caller based on tool registry
        }
    }
}

/// Create ToolCallItemSer with confirmation info from tool registry.
fn tool_call_item_with_confirmation(
    item: ToolCallItem,
    tool_registry: &ToolRegistry,
) -> ToolCallItemSer {
    let tool = tool_registry.get(&item.name);
    let requires_confirmation = tool.map(|t| t.requires_confirmation()).unwrap_or(false);
    // Dangerous tools are those that modify state: shell, edit, write, delete
    let is_dangerous = requires_confirmation;
    ToolCallItemSer {
        id: item.id,
        name: item.name,
        arguments: item.arguments,
        requires_confirmation,
        is_dangerous,
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

/// Payload for `agent:tool-result` event (NEW: shows real tool output).
#[derive(Serialize, Clone)]
pub struct ToolResultPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "toolCallId")]
    pub tool_call_id: String,
    #[serde(rename = "toolName")]
    pub tool_name: String,
    pub content: String,
    #[serde(rename = "isError")]
    pub is_error: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<ImageDataPayload>>,
    pub status: String, // "executed" | "failed" | "rejected" | "auto_approved"
}

/// Payload for `agent:plan-request` event (NEW: plan review UI).
#[derive(Serialize, Clone)]
pub struct PlanRequestPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub plan: String,
}

/// Ask question option for `agent:ask-request` event.
#[derive(Serialize, Clone)]
pub struct AskOptionPayload {
    pub label: String,
    pub description: String,
}

/// Ask question for `agent:ask-request` event.
#[derive(Serialize, Clone)]
pub struct AskQuestionPayload {
    pub question: String,
    pub header: String,
    pub options: Vec<AskOptionPayload>,
    #[serde(rename = "multiSelect")]
    pub multi_select: bool,
}

/// Payload for `agent:ask-request` event (NEW: Ask tool UI).
#[derive(Serialize, Clone)]
pub struct AskRequestPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub questions: Vec<AskQuestionPayload>,
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

    // Load session meta to get workspace
    let paths = SessionPaths::new(&session_id);
    let meta_file = paths.meta_file();
    let workspace = if meta_file.exists() {
        let meta_content = std::fs::read_to_string(&meta_file).map_err(|e| e.to_string())?;
        let meta: SessionMetaFile =
            serde_json::from_str(&meta_content).map_err(|e| e.to_string())?;
        meta.workspace
    } else {
        None
    };

    // Create managers
    let background_manager = Arc::new(BackgroundManager::new());
    let task_manager = Arc::new(TaskManager::new_with_session(&session_id));
    let hook_manager = Arc::new(Mutex::new(HookManager::load()));
    let invoked_skills = new_invoked_skills_map();
    let cancel_token = CancellationToken::new();

    // Todos file path
    let todos_file_path = paths.todos_file();

    // Create ToolRegistry with ask channel
    let (ask_tx, ask_rx) = mpsc::channel();
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
        ask_rx: Mutex::new(Some(ask_rx)),
        ask_response_tx: Mutex::new(None),
        is_running: Mutex::new(false),
        workspace,
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

/// Set auto-approve mode for a session.
/// When enabled, all tools execute without confirmation.
#[tauri::command]
pub fn agent_set_auto_approve(session_id: String, enabled: bool) -> Result<(), String> {
    // Update session meta file
    let paths = SessionPaths::new(&session_id);
    let meta_path = paths.meta_file();

    // Load existing meta
    let mut meta: SessionMetaFile =
        serde_json::from_str(&std::fs::read_to_string(&meta_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

    // Update auto_approve
    meta.auto_approve = enabled;

    // Save back
    let content = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    std::fs::write(&meta_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

/// Submit answer for an Ask request.
#[tauri::command]
pub fn agent_submit_ask_answer(
    session_id: String,
    answer: String, // JSON string containing the answer
) -> Result<(), String> {
    let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
    let handle = sessions.get(&session_id).ok_or("Session not found")?;

    // Get ask_response_tx
    let tx_guard = handle.ask_response_tx.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = tx_guard.as_ref() {
        tx.send(answer).map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────

/// Spawn a thread that listens for StreamMsg and Ask requests, emits Tauri events.
fn spawn_event_listener(
    session_id: String,
    app: AppHandle,
    streaming_content: Arc<Mutex<String>>,
    streaming_reasoning_content: Arc<Mutex<String>>,
    cancel_token: CancellationToken,
    tool_registry: Arc<ToolRegistry>,
) {
    std::thread::spawn(move || {
        // Get stream receiver and ask receiver from session
        let (stream_rx, ask_rx) = {
            let sessions = AGENT_SESSIONS.lock().ok();
            if let Some(s) = sessions {
                if let Some(h) = s.get(&session_id) {
                    let mut rx = h.stream_rx.lock().ok();
                    let mut ask = h.ask_rx.lock().ok();
                    let stream = if let Some(r) = rx.as_mut() {
                        r.take()
                    } else {
                        None
                    };
                    let ask = if let Some(a) = ask.as_mut() {
                        a.take()
                    } else {
                        None
                    };
                    (stream, ask)
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            }
        };

        let stream_rx = match stream_rx {
            Some(rx) => rx,
            None => return,
        };
        let ask_rx = match ask_rx {
            Some(rx) => rx,
            None => {
                // Ask not needed for this session, just listen to stream
                listen_stream_only(
                    session_id,
                    app,
                    streaming_content,
                    streaming_reasoning_content,
                    cancel_token,
                    tool_registry,
                    stream_rx,
                );
                return;
            }
        };

        // Create ask_response_tx and store it in session
        let (ask_response_tx, ask_response_rx) = mpsc::channel::<String>();
        {
            let sessions = AGENT_SESSIONS.lock().ok();
            if let Some(s) = sessions {
                if let Some(h) = s.get(&session_id) {
                    if let Ok(mut guard) = h.ask_response_tx.lock() {
                        *guard = Some(ask_response_tx);
                    }
                }
            }
        }

        // Spawn a separate thread for Ask handling (Ask is blocking)
        std::thread::spawn({
            let session_id = session_id.clone();
            let app = app.clone();
            move || {
                listen_ask_requests(session_id, app, ask_rx, ask_response_rx);
            }
        });

        // Listen to stream messages
        listen_stream_only(
            session_id,
            app,
            streaming_content,
            streaming_reasoning_content,
            cancel_token,
            tool_registry,
            stream_rx,
        );
    });
}

/// Listen to Ask requests from j-agent and emit Tauri events.
fn listen_ask_requests(
    session_id: String,
    app: AppHandle,
    ask_rx: mpsc::Receiver<j_agent::message_types::AskRequest>,
    ask_response_rx: mpsc::Receiver<String>,
) {
    loop {
        // Wait for Ask request
        match ask_rx.recv() {
            Ok(ask_request) => {
                // Emit ask-request event
                let questions: Vec<AskQuestionPayload> = ask_request
                    .questions
                    .iter()
                    .map(|q| AskQuestionPayload {
                        question: q.question.clone(),
                        header: q.header.clone(),
                        options: q
                            .options
                            .iter()
                            .map(|o| AskOptionPayload {
                                label: o.label.clone(),
                                description: o.description.clone(),
                            })
                            .collect(),
                        multi_select: q.multi_select,
                    })
                    .collect();

                let _ = app.emit(
                    "agent:ask-request",
                    AskRequestPayload {
                        session_id: session_id.clone(),
                        questions,
                    },
                );

                // Wait for answer from frontend
                match ask_response_rx.recv() {
                    Ok(_answer) => {
                        // Answer was already sent via agent_submit_ask_answer
                        // The ask_response_tx channel is used to signal that we got an answer
                    }
                    Err(mpsc::RecvError) => {
                        // Channel closed
                        break;
                    }
                }
            }
            Err(mpsc::RecvError) => {
                // Channel closed
                break;
            }
        }
    }
}

/// Listen to StreamMsg only (for sessions without Ask or after Ask thread spawned).
fn listen_stream_only(
    session_id: String,
    app: AppHandle,
    streaming_content: Arc<Mutex<String>>,
    streaming_reasoning_content: Arc<Mutex<String>>,
    cancel_token: CancellationToken,
    tool_registry: Arc<ToolRegistry>,
    stream_rx: mpsc::Receiver<StreamMsg>,
) {
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
                    // Only dangerous tools reach here (safe tools auto-execute in j-agent)
                    // Attach confirmation info to each tool call
                    let tool_calls_with_info: Vec<ToolCallItemSer> = calls
                        .into_iter()
                        .map(|c| tool_call_item_with_confirmation(c, &tool_registry))
                        .collect();

                    // Check if any is ExitPlanMode - emit plan-request instead
                    let has_plan_request = tool_calls_with_info
                        .iter()
                        .any(|c| c.name == "ExitPlanMode");

                    if has_plan_request {
                        // Extract plan content from arguments
                        let plan_call = tool_calls_with_info
                            .iter()
                            .find(|c| c.name == "ExitPlanMode");
                        if let Some(plan) = plan_call {
                            let _ = app.emit(
                                "agent:plan-request",
                                PlanRequestPayload {
                                    session_id: session_id.clone(),
                                    plan: plan.arguments.clone(),
                                },
                            );
                        }
                    } else {
                        let _ = app.emit(
                            "agent:tool-request",
                            ToolRequestPayload {
                                session_id: session_id.clone(),
                                tool_calls: tool_calls_with_info,
                            },
                        );
                    }
                }
                StreamMsg::ToolResult(result) => {
                    // NEW: Emit real tool output to frontend
                    let status_str = match result.status {
                        ToolResultStatus::Executed => "executed",
                        ToolResultStatus::Failed => "failed",
                        ToolResultStatus::Rejected => "rejected",
                        ToolResultStatus::AutoApproved => "auto_approved",
                    };
                    let images = if result.images.is_empty() {
                        None
                    } else {
                        Some(
                            result
                                .images
                                .into_iter()
                                .map(|img| ImageDataPayload {
                                    base64: img.base64,
                                    media_type: img.media_type,
                                })
                                .collect(),
                        )
                    };
                    let _ = app.emit(
                        "agent:tool-result",
                        ToolResultPayload {
                            session_id: session_id.clone(),
                            tool_call_id: result.tool_call_id,
                            tool_name: result.tool_name,
                            content: result.content,
                            is_error: result.is_error,
                            images,
                            status: status_str.to_string(),
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
                handle.workspace.clone(),
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
        workspace,
    ) = shared_state_components;

    // Spawn event listener
    spawn_event_listener(
        session_id.clone(),
        app,
        streaming_content.clone(),
        streaming_reasoning_content.clone(),
        cancel_token.clone(),
        tool_registry.clone(),
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
        workspace,
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
