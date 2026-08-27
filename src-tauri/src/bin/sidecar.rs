//! jstudio-sidecar — headless backend process for the Electron shell.
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
//! Method names mirror the Tauri command names 1:1 so the renderer's
//! existing `invoke('read_settings', …)` calls can be forwarded unchanged.
//! Params arrive as the same camelCase object Tauri would have received.

use jstudio_lib::commands::{
    agent, ai_graph, bundle, debug, detach, jcli, link,
    storage::{assets, backups, cache, documents, folders, markdown, paths, settings, snapshots},
    terminal,
};
use jstudio_lib::events::{EventSink, StdioSink};

use futures::FutureExt;
use serde::Serialize;
use serde::de::DeserializeOwned;
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
fn take<T: DeserializeOwned>(params: &Value, key: &str) -> Result<T, String> {
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

        // ── storage: paths ──
        "ensure_studio_dir" => blocking(paths::ensure_studio_dir).await,
        "open_studio_dir" => blocking(paths::open_studio_dir).await,
        "open_doc_dir" => {
            let id: String = take(&params, "docId")?;
            blocking(move || paths::open_doc_dir(id)).await
        }
        "get_doc_path" => {
            let id: String = take(&params, "docId")?;
            blocking(move || paths::get_doc_path(id)).await
        }
        "read_file_bytes" => {
            let p: String = take(&params, "path")?;
            blocking(move || paths::read_file_bytes(p)).await
        }
        "write_file_bytes" => {
            let p: String = take(&params, "path")?;
            let d: Vec<u8> = take(&params, "data")?;
            blocking(move || paths::write_file_bytes(p, d)).await
        }
        "copy_image_to_clipboard" => {
            let p: String = take(&params, "path")?;
            blocking(move || paths::copy_image_to_clipboard(p)).await
        }
        "copy_image_bytes_to_clipboard" => {
            let d: Vec<u8> = take(&params, "data")?;
            blocking(move || paths::copy_image_bytes_to_clipboard(d)).await
        }

        // ── storage: documents / index ──
        "read_index" => blocking(documents::read_index).await,
        "write_index" => {
            let v: Value = take(&params, "entries")?;
            blocking(move || documents::write_index(v)).await
        }
        "read_document" => {
            let id: String = take(&params, "docId")?;
            blocking(move || documents::read_document(id)).await
        }
        "write_document" => {
            let id: String = take(&params, "docId")?;
            let doc: Value = take(&params, "doc")?;
            let ev = Arc::clone(&events);
            blocking(move || documents::write_document(id, doc, &*ev)).await
        }
        "delete_document" => {
            let id: String = take(&params, "docId")?;
            blocking(move || documents::delete_document(id)).await
        }

        // ── storage: backups / snapshots ──
        "list_doc_backups" => {
            let id: String = take(&params, "docId")?;
            blocking(move || backups::list_doc_backups(id)).await
        }
        "read_doc_backup" => {
            let id: String = take(&params, "docId")?;
            let bid: String = take(&params, "backupId")?;
            blocking(move || backups::read_doc_backup(id, bid)).await
        }
        "restore_doc_backup" => {
            let id: String = take(&params, "docId")?;
            let bid: String = take(&params, "backupId")?;
            let ev = Arc::clone(&events);
            blocking(move || backups::restore_doc_backup(id, bid, &*ev)).await
        }
        "save_doc_snapshot" => {
            let id: String = take(&params, "docId")?;
            let s: Value = take(&params, "sections")?;
            blocking(move || snapshots::save_doc_snapshot(id, s)).await
        }
        "read_doc_snapshot" => {
            let id: String = take(&params, "docId")?;
            blocking(move || snapshots::read_doc_snapshot(id)).await
        }

        // ── storage: folders / settings ──
        "read_folders" => blocking(folders::read_folders).await,
        "write_folders" => {
            let v: Value = take(&params, "entries")?;
            blocking(move || folders::write_folders(v)).await
        }
        "read_settings" => blocking(settings::read_settings).await,
        "write_settings" => {
            let v: Value = take(&params, "settings")?;
            blocking(move || settings::write_settings(v)).await
        }
        "read_agent_config" => blocking(settings::read_agent_config).await,
        "write_agent_config" => {
            let v: Value = take(&params, "config")?;
            blocking(move || settings::write_agent_config(v)).await
        }

        // ── storage: assets ──
        "save_doc_asset" => {
            let id: String = take(&params, "docId")?;
            let name: String = take(&params, "fileName")?;
            let data: Vec<u8> = take(&params, "data")?;
            blocking(move || assets::save_doc_asset(id, name, data)).await
        }
        "delete_doc_asset" => {
            let id: String = take(&params, "docId")?;
            let name: String = take(&params, "fileName")?;
            blocking(move || assets::delete_doc_asset(id, name)).await
        }
        "list_doc_assets" => {
            let id: String = take(&params, "docId")?;
            blocking(move || assets::list_doc_assets(id)).await
        }
        "clean_global_assets" => blocking(assets::clean_global_assets).await,
        "trash_doc_asset" => {
            let id: String = take(&params, "docId")?;
            let name: String = take(&params, "fileName")?;
            blocking(move || assets::trash_doc_asset(id, name)).await
        }
        "list_trashed_assets" => blocking(assets::list_trashed_assets).await,
        "restore_trashed_asset" => {
            let id: i64 = take(&params, "id")?;
            blocking(move || assets::restore_trashed_asset(id)).await
        }
        "delete_trashed_asset" => {
            let id: i64 = take(&params, "id")?;
            blocking(move || assets::delete_trashed_asset(id)).await
        }

        // ── storage: markdown / cache ──
        "list_markdown_files" => {
            let dir: String = take(&params, "dir")?;
            blocking(move || markdown::list_markdown_files(dir)).await
        }
        "set_preview_data" => {
            let l: String = take(&params, "label")?;
            let d: Value = take(&params, "data")?;
            blocking(move || cache::set_preview_data(l, d)).await
        }
        "get_preview_data" => {
            let l: String = take(&params, "label")?;
            blocking(move || cache::get_preview_data(l)).await
        }
        "set_diagram_update" => {
            let l: String = take(&params, "label")?;
            let d: Value = take(&params, "data")?;
            blocking(move || cache::set_diagram_update(l, d)).await
        }
        "get_diagram_update" => {
            let l: String = take(&params, "label")?;
            blocking(move || cache::get_diagram_update(l)).await
        }
        "clear_diagram_update" => {
            let l: String = take(&params, "label")?;
            blocking(move || cache::clear_diagram_update(l)).await
        }

        // ── document bundles (.jnote) ──
        "export_document_bundle" => {
            let id: String = take(&params, "docId")?;
            let dest: String = take(&params, "destPath")?;
            blocking(move || bundle::export_document_bundle(id, dest)).await
        }
        "import_document_bundle" => {
            let src: String = take(&params, "srcPath")?;
            let new_id: String = take(&params, "newDocId")?;
            blocking(move || bundle::import_document_bundle(src, new_id)).await
        }

        // ── terminal (PTY) ──
        // NOTE: struct-param commands arrive WRAPPED by their arg name
        // ({ params: {...} }) — Tauri's convention for named struct args.
        "pty_create" => {
            let p: terminal::CreateParams = take(&params, "params")?;
            blocking(move || terminal::pty_create(events, p)).await
        }
        "pty_write" => {
            let id: String = take(&params, "sessionId")?;
            let d: String = take(&params, "data")?;
            blocking(move || terminal::pty_write(id, d)).await
        }
        "pty_write_batch" => {
            let id: String = take(&params, "sessionId")?;
            let c: Vec<String> = take(&params, "chunks")?;
            blocking(move || terminal::pty_write_batch(id, c)).await
        }
        "pty_resize" => {
            let id: String = take(&params, "sessionId")?;
            let cols: u16 = take(&params, "cols")?;
            let rows: u16 = take(&params, "rows")?;
            blocking(move || terminal::pty_resize(id, cols, rows)).await
        }
        "pty_kill" => {
            let id: String = take(&params, "sessionId")?;
            blocking(move || terminal::pty_kill(id)).await
        }
        "pty_kill_all" => blocking(terminal::pty_kill_all).await,
        "pty_list" => blocking(terminal::pty_list).await,
        "pty_set_title" => {
            let id: String = take(&params, "sessionId")?;
            let t: String = take(&params, "title")?;
            blocking(move || terminal::pty_set_title(id, t)).await
        }
        "pty_is_alive" => {
            let id: String = take(&params, "sessionId")?;
            blocking(move || terminal::pty_is_alive(id)).await
        }

        // ── agent (j-agent integration) ──
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

        // ── jcli ──
        "check_jcli" => blocking(jcli::check_jcli).await,
        "install_jcli" => blocking(jcli::install_jcli).await,
        "uninstall_jcli" => blocking(jcli::uninstall_jcli).await,

        // ── link metadata (HTTP, async) ──
        "fetch_link_metadata" => {
            let url: String = take(&params, "url")?;
            let r = link::fetch_link_metadata(url).await?;
            serde_json::to_value(r).map_err(|e| e.to_string())
        }

        // ── AI graph HTTP proxy (async) ──
        "ai_graph_fetch" => {
            let req: ai_graph::AiGraphFetchRequest = take(&params, "request")?;
            let r = ai_graph::ai_graph_fetch(req).await?;
            serde_json::to_value(r).map_err(|e| e.to_string())
        }
        "write_graph_log" => {
            let msg: String = take(&params, "msg")?;
            blocking(move || ai_graph::write_graph_log(msg)).await
        }

        // ── terminal detach mailbox ──
        "set_terminal_detach_payload" => {
            let l: String = take(&params, "label")?;
            let p: Value = take(&params, "payload")?;
            blocking(move || detach::set_terminal_detach_payload(l, p)).await
        }
        "get_terminal_detach_payload" => {
            let l: String = take(&params, "label")?;
            blocking(move || detach::get_terminal_detach_payload(l)).await
        }
        "clear_terminal_detach_payload" => {
            let l: String = take(&params, "label")?;
            blocking(move || detach::clear_terminal_detach_payload(l)).await
        }

        // ── debug / logs ──
        "get_build_info" => blocking(|| Ok(debug::get_build_info())).await,
        "append_log_line" => {
            let line: String = take(&params, "line")?;
            blocking(move || debug::append_log_line(line)).await
        }
        "get_log_file_path" => blocking(debug::get_log_file_path).await,
        "open_logs_dir" => blocking(debug::open_logs_dir).await,
        "clear_logs" => blocking(debug::clear_logs).await,

        _ => Err(format!("unknown method: {method}")),
    }
}

fn main() {
    eprintln!("[jstudio-sidecar] started (pid={})", std::process::id());

    // Small multi-thread runtime: async HTTP commands run on it directly,
    // every sync command is pushed onto the blocking pool so SQLite writes
    // and PTY syscalls never stall the runtime threads.
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
    rt.block_on(async {
        for t in tasks {
            let _ = t.await;
        }
    });

    // Kill every PTY session — otherwise the login shells outlive the app
    // as orphans (Electron main is gone at this point, nobody else can).
    let _ = terminal::pty_kill_all();

    eprintln!("[jstudio-sidecar] stdin closed, shutting down");
}
