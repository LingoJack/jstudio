//! SQLite database layer.
//!
//! Provides a single global [`Connection`] guarded by a [`Mutex`], plus schema
//! management, one-time migration from legacy JSON files, orphan document
//! recovery, and body column backfill.
//!
//! The database lives at `~/.jdata/studio/studio.db`. WAL journal mode is
//! enabled for better read concurrency (the main window and preview windows
//! may both read).

mod backfill;
mod connection;
mod migrate;
mod reconcile;
mod schema;

// Re-export public API from connection module.
pub use connection::{db, init_db};
