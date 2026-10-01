//! jstudio-sidecar — agent host (stdio JSON-RPC).
//!
//! After the backend migration (openspec change `migrate-rust-sidecar-to-node`)
//! this binary is ONLY the agent engine host: the `j_agent` crate cannot be
//! ported to Node, so the agent_* methods stay here while every other
//! command (storage, assets, bundles, PTY, logs, jcli, fonts, …) is served
//! by the Node sidecar (`electron/backend/`, spawned by Electron main with
//! ELECTRON_RUN_AS_NODE). Electron main routes by method name — see
//! `wireSidecar` in electron/main.ts and electron/backend/PORTING.md.
//!
//! Speaks newline-delimited JSON over stdio:
//!   request      {"id":N,"method":"...","params":...}
//!   response     {"id":N,"result":...} | {"id":N,"error":"..."}
//!   notification {"event":"...","payload":...}   (via StdioSink)
//!
//! HARD CONSTRAINT: stdout is reserved for the protocol. Everything else
//! (logs, diagnostics) MUST go to stderr — one stray stdout line breaks the
//! bridge (Electron main drops unparseable lines but logs them as pollution).
//!
//! Method names mirror the original Tauri command names 1:1 so the
//! renderer's existing `invoke('agent_send_message', …)` calls are
//! forwarded unchanged.

use jstudio_lib::commands::agent;
use jstudio_lib::events::{EventSink, StdioSink};

use futures::FutureExt;
use serde::Serialize;
use serde_json::{Value, json};
use std::io::{BufRead, Write};
use std::sync::{Arc, Mutex};

/// Shared protocol stdout — responses AND event notifications are serialized
/// through this one mutex so interleaved writes can't corrupt the framing.
type SharedOut = Arc<Mutex<std::io::Stdout>>;

fn write_line(out: &SharedOut, v: &Value) {
    if let Ok(mut guard) = out.lock() {
        let _ = writeln!(guard, "{v}").and_then(|_| guard.flush());
    }
}

/// Extract one camelCase param key into a typed value.
fn take<T: serde::de::DeserializeOwned>(params: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(params.get(key).cloned().unwrap_or(Value::Null))
        .map_err(|e| format!("bad param '{key}': {e}"))
}

/// Run a sync command on the blocking pool and serialize its result.
async fn blocking<T, F>(f: F) -> Result<Value, String>
where
    T: Serialize + Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let r = tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| format!("blocking task failed: {e}"))??;
    serde_json::to_value(r).map_err(|e| e.to_string())
}

async fn handle(method: &str, params: Value, events: Arc<dyn EventSink>) -> Result<Value, String> {
    match method {
        // ── transport health check (P0 self-test) ──
        "echo" => Ok(json!({ "echo": params })),

        // ── agent (j-agent integration) — the reason this binary exists ──
        "agent_list_sessions" => blocking(agent::agent_list_sessions).await,
        "agent_create_session" => {
            let title: Option<String> = take(&params, "title")?;
            let ws: Option<String> = take(&params, "workspace")?;
            blocking(move || agent::agent_create_session(title, ws)).await
        }
        "agent_load_session" => {
            let id: String = take(&params, "sessionId")?;
            blocking(move || agent::agent_load_session(id)).await
        }
        "agent_delete_session" => {
            let id: String = take(&params, "sessionId")?;
            blocking(move || agent::agent_delete_session(id)).await
        }
        "agent_send_message" => {
            let p: agent::SendMessageParams = take(&params, "params")?;
            blocking(move || agent::agent_send_message(p, events)).await
        }
        "agent_tool_result" => {
            let p: agent::ToolResultParams = take(&params, "params")?;
            blocking(move || agent::agent_tool_result(p)).await
        }
        "agent_cancel" => {
            let id: String = take(&params, "sessionId")?;
            blocking(move || agent::agent_cancel(id)).await
        }
        "agent_set_auto_approve" => {
            let id: String = take(&params, "sessionId")?;
            let enabled: bool = take(&params, "enabled")?;
            blocking(move || agent::agent_set_auto_approve(id, enabled)).await
        }
        "agent_submit_ask_answer" => {
            let id: String = take(&params, "sessionId")?;
            let answer: String = take(&params, "answer")?;
            blocking(move || agent::agent_submit_ask_answer(id, answer)).await
        }

        _ => Err(format!("unknown method: {method}")),
    }
}

fn main() {
    eprintln!("[jstudio-sidecar] started (pid={})", std::process::id());

    // Small multi-thread runtime: every agent command is pushed onto the
    // blocking pool so jcli subprocess waits never stall the runtime threads.
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .expect("failed to build sidecar runtime");

    let out: SharedOut = Arc::new(Mutex::new(std::io::stdout()));
    let events: Arc<dyn EventSink> = StdioSink::new(Arc::clone(&out));

    let stdin = std::io::stdin();
    let mut tasks = Vec::new();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[jstudio-sidecar] stdin read error: {e}");
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }

        let msg: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[jstudio-sidecar] invalid JSON in: {e}");
                continue;
            }
        };
        let Some(id) = msg.get("id").and_then(Value::as_u64) else {
            eprintln!("[jstudio-sidecar] message without id ignored");
            continue;
        };
        let method = msg
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let params = msg.get("params").cloned().unwrap_or(Value::Null);

        let out_task = Arc::clone(&out);
        let events_task = Arc::clone(&events);
        tasks.push(rt.spawn(async move {
            // A panicking handler must not kill the process or hang the
            // request — convert to an error response.
            let result = std::panic::AssertUnwindSafe(handle(&method, params, events_task))
                .catch_unwind()
                .await
                .unwrap_or_else(|_| Err("handler panicked".to_string()));
            let resp = match result {
                Ok(result) => json!({ "id": id, "result": result }),
                Err(error) => json!({ "id": id, "error": error }),
            };
            write_line(&out_task, &resp);
        }));
    }

    // stdin closed (parent gone or pipe EOF): drain in-flight requests before
    // dropping the runtime, otherwise pending tasks get cancelled mid-write.
    // (PTY cleanup is NOT done here — PTYs live on the Node sidecar now, and
    // Electron main kills them before stopping either backend.)
    rt.block_on(async {
        for t in tasks {
            let _ = t.await;
        }
    });

    eprintln!("[jstudio-sidecar] stdin closed, shutting down");
}
