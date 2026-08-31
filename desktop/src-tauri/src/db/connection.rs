//! Database connection management.
//!
//! Provides a single global [`Connection`] guarded by a [`Mutex`]. The connection
//! is lazily opened on first access, with automatic schema creation and migration.

use rusqlite::Connection;
use std::fs;
use std::sync::{LazyLock, Mutex};

use super::backfill::migrate_document_bodies;
use super::migrate::migrate_from_json;
use super::reconcile::reconcile_orphan_documents;
use super::schema::create_tables;
use crate::commands::storage::paths::studio_dir;

/// Path to the SQLite database file.
fn db_path() -> std::path::PathBuf {
    studio_dir().join("studio.db")
}

/// Global database connection, lazily opened on first access.
///
/// Opening also triggers init (DDL + migration) so that by the time
/// any command touches the database the schema is guaranteed to exist.
static DB: LazyLock<Mutex<Connection>> = LazyLock::new(|| {
    let conn = open_and_init();
    Mutex::new(conn)
});

/// Open the database connection, configure pragmas, create tables, and run
/// the one-time JSON migration.
fn open_and_init() -> Connection {
    // Ensure parent directory exists.
    let _ = fs::create_dir_all(studio_dir());

    let path = db_path();
    let mut conn = Connection::open(&path)
        .unwrap_or_else(|e| panic!("failed to open studio.db at {}: {e}", path.display()));

    // Enable WAL for better read concurrency.
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    // Normal synchronous level — good balance of safety and speed under WAL.
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    // Foreign keys ON so that folder deletion cascades etc. work.
    let _ = conn.pragma_update(None, "foreign_keys", "ON");

    // Create tables.
    create_tables(&conn);

    // One-time migration from legacy JSON files.
    migrate_from_json(&mut conn);

    // Recover documents that exist on disk but were never registered in the
    // index (orphans). See [`reconcile_orphan_documents`].
    reconcile_orphan_documents(&mut conn);

    // Backfill the `body` column from legacy on-disk document files for any
    // rows not yet migrated (including the orphans just recovered above).
    migrate_document_bodies(&mut conn);

    conn
}

/// Acquire the global database connection lock.
///
/// All database access in the codebase goes through this function, which
/// serializes access through the `Mutex`.
pub fn db() -> Result<std::sync::MutexGuard<'static, Connection>, String> {
    DB.lock().map_err(|e| format!("db lock poisoned: {e}"))
}

/// Explicitly trigger initialisation. Safe to call multiple times — the
/// `LazyLock` guarantees the connection is opened only once.
pub fn init_db() -> Result<(), String> {
    // Touch the global to force lazy init.
    let _guard = db()?;
    Ok(())
}
