//! Storage commands — split by domain.
//!
//! Sub-modules:
//! - [`paths`]     — directory path helpers + file-manager open
//! - [`documents`] — document metadata (SQLite) + document body (filesystem)
//! - [`folders`]   — folder tree (SQLite)
//! - [`settings`]  — app settings + agent config (SQLite / filesystem)
//! - [`assets`]    — document-private binary assets (filesystem)
//! - [`cache`]     — in-memory preview / diagram caches
//! - [`markdown`]  — markdown import helpers (filesystem scan)

pub mod assets;
pub mod cache;
pub mod documents;
pub mod folders;
pub mod markdown;
pub mod paths;
pub mod settings;
