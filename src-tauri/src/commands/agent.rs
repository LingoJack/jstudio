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
    list_sessions, load_agent_config, load_session, load_system_prompt, save_session_meta_file,
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
    /// Ask response sender (back to j-agent). Created once at session start
    /// and held for the session lifetime; the ask listener thread owns the
    /// paired receiver. Recreated per round would break multi-round chats
    /// because `ask_rx` is a non-cloneable `mpsc::Receiver` that cannot be
    /// restored once moved into the listener.
    pub ask_response_tx: Mutex<Option<mpsc::Sender<String>>>,
    /// Whether the agent loop is currently running
    pub is_running: Mutex<bool>,
    /// Workspace directory for file operations
    pub workspace: Option<String>,
    /// Tool registry
    pub tool_registry: Arc<ToolRegistry>,
    /// Background manager
    pub background_manager: Arc<BackgroundManager>,
    /// Task manager. Held by the handle to keep it alive for the session's
    /// lifetime; `ToolRegistry` stores its own `Arc` clone at construction.
    #[allow(dead_code)]
    pub task_manager: Arc<TaskManager>,
    /// Hook manager
    pub hook_manager: Arc<Mutex<HookManager>>,
    /// Invoked skills map
    pub invoked_skills: InvokedSkillsMap,
    /// Pending tool calls awaiting user approval (tool_call_id -> (name, arguments))
    pub pending_tool_calls: Arc<Mutex<HashMap<String, (String, String)>>>,
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
    /// Whether the user approved a pending dangerous tool call.
    /// Replaces the old `result.contains("\"approved\":true")` string match.
    #[serde(default)]
    pub approved: Option<bool>,
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
    // Read from transcript.jsonl — JStudio persists messages via
    // `append_session_event` which writes transcript, not display.jsonl.
    let messages = load_session(&session_id);
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

/// Ensure a session handle exists in the registry. Called internally by
/// `agent_send_message` before pushing a user message. Idempotent — returns
/// Ok(()) if the handle is already present.
///
/// Note: this was previously a `#[tauri::command]` exposed as
/// `agent_start_session`, but the frontend never invoked it; it is now a
/// private helper.
fn ensure_session_started(session_id: &str, app: &AppHandle) -> Result<(), String> {
    // Check if session already exists in registry
    {
        let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        if sessions.contains_key(session_id) {
            return Ok(()); // Already started
        }
    }

    // Load existing messages from transcript.jsonl (the file JStudio
    // actually writes via `append_session_event`).
    let messages = load_session(session_id);

    // Load session meta to get workspace
    let paths = SessionPaths::new(session_id);
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
    let task_manager = Arc::new(TaskManager::new_with_session(session_id));
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

    // Ask response channel lives for the whole session. The sender is stored
    // on the handle so `agent_submit_ask_answer` can reach it from any round;
    // the receiver is moved into the ask listener thread spawned below.
    let (ask_response_tx, ask_response_rx) = mpsc::channel::<String>();

    // Create shared state buffers
    let streaming_content = Arc::new(Mutex::new(String::new()));
    let streaming_reasoning_content = Arc::new(Mutex::new(String::new()));
    let pending_user_messages = Arc::new(Mutex::new(Vec::new()));
    let display_messages = Arc::new(Mutex::new(messages.clone()));
    let context_messages = Arc::new(Mutex::new(messages));

    // Create handle
    let handle = AgentSessionHandle {
        streaming_content,
        streaming_reasoning_content,
        display_messages,
        context_messages,
        pending_user_messages,
        cancel_token,
        tool_result_tx: Mutex::new(None),
        ask_response_tx: Mutex::new(Some(ask_response_tx)),
        is_running: Mutex::new(false),
        workspace,
        tool_registry,
        background_manager,
        task_manager,
        hook_manager,
        invoked_skills,
        pending_tool_calls: Arc::new(Mutex::new(HashMap::new())),
    };

    // Register session
    {
        let mut sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id.to_string(), handle);
    }

    // Spawn the ask listener once for the whole session. `ask_rx` is moved in
    // and persists until the session's `ask_tx` (held by ToolRegistry) is
    // dropped — spawning it per round would consume `ask_rx` on the first
    // round and panic on the second.
    {
        let session_id_owned = session_id.to_string();
        let app_clone = app.clone();
        std::thread::spawn(move || {
            listen_ask_requests(session_id_owned, app_clone, ask_rx, ask_response_rx);
        });
    }

    Ok(())
}

/// Send a user message to the agent session.
/// Spawns the agent loop if not already running.
#[tauri::command]
pub async fn agent_send_message(params: SendMessageParams, app: AppHandle) -> Result<(), String> {
    let session_id = params.session_id.clone();

    // Ensure session is started
    ensure_session_started(&session_id, &app)?;

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
/// If the user approved a dangerous tool, this function executes it and sends the real result.
#[tauri::command]
pub fn agent_tool_result(params: ToolResultParams, _app: AppHandle) -> Result<(), String> {
    // Check if this is an approval. The frontend sets `approved: true` on the
    // approve path; the old `result.contains("\"approved\":true")` string match
    // was fragile (broke on any JSON formatting variance).
    let is_approval = params.approved == Some(true);

    if is_approval {
        // Try to find a pending tool call and execute it
        let exec_info = {
            let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
            let handle = sessions
                .get(&params.session_id)
                .ok_or("Session not found")?;

            let mut pending = handle
                .pending_tool_calls
                .lock()
                .map_err(|e| e.to_string())?;
            if let Some((name, arguments)) = pending.remove(&params.tool_call_id) {
                let tx_guard = handle.tool_result_tx.lock().map_err(|e| e.to_string())?;
                let tx = tx_guard.as_ref().ok_or("No tool result channel")?.clone();
                Some((
                    handle.tool_registry.clone(),
                    tx,
                    name,
                    arguments,
                    handle.workspace.clone(),
                    handle.cancel_token.clone(),
                ))
            } else {
                None
            }
        };

        if let Some((tool_registry, tx, name, arguments, workspace, cancel_token)) = exec_info {
            // Spawn a thread to execute the tool (execution is synchronous and may block)
            let tool_call_id = params.tool_call_id.clone();
            std::thread::spawn(move || {
                // Set thread-local working directory so file tools resolve paths correctly
                if let Some(ref ws) = workspace {
                    j_agent::agent::thread_identity::set_thread_cwd(std::path::Path::new(ws));
                }

                let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
                if cancel_token.is_cancelled() {
                    cancelled.store(true, std::sync::atomic::Ordering::SeqCst);
                }

                // Execute the tool. Note: we do NOT emit `agent:tool-result`
                // here — j-agent's tool_processor emits `StreamMsg::ToolResult`
                // for all tool results, and `listen_stream_only` forwards that
                // to the frontend. Emitting here used to cause a double-emit
                // (approval path only).
                let result = tool_registry.execute(&name, &arguments, &cancelled);

                // Send the real result to the agent loop
                let result_msg = ToolResultMsg {
                    tool_call_id,
                    result: result.output,
                    is_error: result.is_error,
                    images: result.images,
                    plan_decision: result.plan_decision,
                };
                let _ = tx.send(result_msg);
            });

            return Ok(());
        }
        // If no pending tool call found, fall through to original flow
    }

    // Original flow for rejections, plan decisions, etc.
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

/// Spawn a thread that listens for StreamMsg and emits Tauri events.
///
/// `stream_rx` is moved in directly. The ask listener is spawned separately
/// at session start (see `ensure_session_started`) and persists across rounds,
/// because `ask_rx` is a non-cloneable receiver that cannot be re-extracted
/// from a consumed listener.
fn spawn_event_listener(
    session_id: String,
    app: AppHandle,
    streaming_content: Arc<Mutex<String>>,
    streaming_reasoning_content: Arc<Mutex<String>>,
    cancel_token: CancellationToken,
    tool_registry: Arc<ToolRegistry>,
    pending_tool_calls: Arc<Mutex<HashMap<String, (String, String)>>>,
    stream_rx: mpsc::Receiver<StreamMsg>,
) {
    std::thread::spawn(move || {
        listen_stream_only(
            session_id,
            app,
            streaming_content,
            streaming_reasoning_content,
            cancel_token,
            tool_registry,
            pending_tool_calls,
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
    pending_tool_calls: Arc<Mutex<HashMap<String, (String, String)>>>,
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
                    // Store pending tool calls for later execution after user approval
                    {
                        let mut pending = match pending_tool_calls.lock() {
                            Ok(g) => g,
                            Err(e) => {
                                eprintln!("[agent] pending_tool_calls poisoned: {e}");
                                e.into_inner()
                            }
                        };
                        for c in &calls {
                            pending.insert(c.id.clone(), (c.name.clone(), c.arguments.clone()));
                        }
                    }
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

/// Mark a session as not running. Best-effort: if the global table or the
/// is_running mutex is poisoned we log and continue rather than propagating,
/// because this is called from listener threads that have no way to surface
/// an error to the user.
fn mark_not_running(session_id: &str) {
    match AGENT_SESSIONS.lock() {
        Ok(sessions) => {
            if let Some(handle) = sessions.get(session_id) {
                match handle.is_running.lock() {
                    Ok(mut r) => *r = false,
                    Err(e) => eprintln!("[agent] is_running poisoned: {e}"),
                }
            }
        }
        Err(e) => eprintln!("[agent] AGENT_SESSIONS poisoned: {e}"),
    }
}

/// Spawn the agent loop on the Tauri global async runtime.
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

        // Collect shared state components (Arc refs). Only the fields actually
        // consumed below are cloned; `_task_manager` is intentionally unused
        // (TodoManager comes from tool_registry.todo_manager).
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
                handle.hook_manager.clone(),
                handle.invoked_skills.clone(),
                handle.workspace.clone(),
            ),
        )
    };

    // Create channels for this invocation
    let (stream_tx, stream_rx) = mpsc::channel();
    let (tool_result_tx, tool_result_rx) = mpsc::channel();

    // Update tool_result_tx in handle (stream_rx is moved directly into the
    // listener, no longer stored on the handle).
    let pending_tool_calls = {
        let sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        let handle = sessions.get(&session_id).ok_or("Session not found")?;
        {
            let mut tx_guard = handle.tool_result_tx.lock().map_err(|e| e.to_string())?;
            *tx_guard = Some(tool_result_tx);
        }
        handle.pending_tool_calls.clone()
    };

    let (
        streaming_content,
        streaming_reasoning_content,
        pending_user_messages,
        display_messages,
        context_messages,
        cancel_token,
        tool_registry,
        background_manager,
        hook_manager,
        invoked_skills,
        workspace,
    ) = shared_state_components;

    // Spawn event listener — stream_rx is moved in directly, no reverse lock
    // on the global session table needed. The ask listener was already
    // spawned at session start and persists across rounds.
    spawn_event_listener(
        session_id.clone(),
        app,
        streaming_content.clone(),
        streaming_reasoning_content.clone(),
        cancel_token.clone(),
        tool_registry.clone(),
        pending_tool_calls.clone(),
        stream_rx,
    );

    // Create agent loop config. Reuse the hook_manager from the handle rather
    // than calling HookManager::load() a second time.
    let hook_manager_clone = {
        let guard = hook_manager.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    let loop_config = AgentLoopConfig {
        provider,
        max_llm_rounds: config.max_tool_rounds,
        compact_config: CompactConfig::default(),
        hook_manager: hook_manager_clone,
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

    // Spawn the agent loop on a dedicated OS thread with a single-threaded
    // tokio runtime. We can't use `tauri::async_runtime::spawn` here because
    // `run_main_agent_loop` borrows `tool_result_rx` (a std::mpsc::Receiver,
    // which is not Sync) across await points, making the future non-Send.
    // A current-thread runtime is much lighter than the multi-thread default
    // and avoids creating a worker thread pool per message.
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build agent loop runtime");
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
