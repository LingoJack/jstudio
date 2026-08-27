//! JStudio backend library — consumed ONLY by the `jstudio-sidecar` binary
//! (the Electron shell's headless backend over stdio JSON-RPC).
//!
//! History: this crate used to build the Tauri/WKWebView app shell. The
//! shell (window/menu/webview code) now lives in `electron/*.ts`; everything
//! below is shell-agnostic backend logic. See `src/bin/sidecar.rs` for the
//! transport and the method dispatch table.

pub mod commands;
pub mod db;
pub mod events;
