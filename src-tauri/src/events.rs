//! Event sink abstraction — decouples command modules from the Tauri runtime.
//!
//! Commands emit events through `&dyn EventSink` instead of `tauri::AppHandle`,
//! so the same command code runs in both shells:
//! - **Tauri shell** (`TauriSink`): forwards to `AppHandle::emit` (broadcast to
//!   all webviews, same as the legacy behavior — every legacy emit site used
//!   the broadcast `emit`, not `emit_to`).
//! - **Electron sidecar** (`StdioSink`): writes a protocol notification line
//!   `{"event":...,"payload":...}` to stdout; Electron main routes it to the
//!   right window (see electron/sidecar.ts).
//!
//! HARD CONSTRAINT for `StdioSink`: the writer it holds MUST be the same
//! mutex-guarded stdout the sidecar's response writer uses — interleaved
//! writes from two handles would corrupt the line protocol.

use serde::Serialize;
use serde_json::Value;
use std::io::Write;
use std::sync::{Arc, Mutex};

/// Object-safe core (usable as `dyn EventSink`).
pub trait EventSink: Send + Sync {
    fn emit_json(&self, event: &str, payload: Value);
}

/// Convenience blanket for `Serialize` payloads (the legacy struct payloads).
/// Separate trait so `EventSink` stays dyn-compatible; `dyn EventSink` is
/// covered by this blanket impl, so call sites can hold `Arc<dyn EventSink>`
/// and still call `.emit(...)`.
pub trait EventSinkExt {
    fn emit<T: Serialize>(&self, event: &str, payload: T);
}

impl<S: EventSink + ?Sized> EventSinkExt for S {
    fn emit<T: Serialize>(&self, event: &str, payload: T) {
        match serde_json::to_value(payload) {
            Ok(v) => self.emit_json(event, v),
            Err(e) => eprintln!("[events] failed to serialize payload for {event}: {e}"),
        }
    }
}

// ── Tauri shell ─────────────────────────────────────────────────────────────

pub struct TauriSink(pub tauri::AppHandle);

impl EventSink for TauriSink {
    fn emit_json(&self, event: &str, payload: Value) {
        use tauri::Emitter;
        let _ = self.0.emit(event, payload);
    }
}

/// Wrap an `AppHandle` into the shared sink type used by command impls.
pub fn tauri_sink(app: tauri::AppHandle) -> Arc<dyn EventSink> {
    Arc::new(TauriSink(app))
}

// ── Electron sidecar ────────────────────────────────────────────────────────

/// Writes notification lines to the shared protocol stdout.
pub struct StdioSink {
    out: Arc<Mutex<std::io::Stdout>>,
}

impl StdioSink {
    pub fn new(out: Arc<Mutex<std::io::Stdout>>) -> Arc<Self> {
        Arc::new(Self { out })
    }
}

impl EventSink for StdioSink {
    fn emit_json(&self, event: &str, payload: Value) {
        let line = serde_json::json!({ "event": event, "payload": payload });
        if let Ok(mut guard) = self.out.lock() {
            // Single write + flush per notification; a broken pipe means the
            // parent is gone — drop silently (the read loop will notice EOF).
            let _ = writeln!(guard, "{line}").and_then(|_| guard.flush());
        }
    }
}
