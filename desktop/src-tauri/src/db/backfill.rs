//! Legacy document-body migration (filesystem → SQLite).
//!
//! Backfill the `documents.body` column from legacy on-disk document files.
//!
//! Historically a document's full content lived in
//! `documents/{id}/document.json` (or the older flat `documents/{id}.json`).
//! Content now lives in the `body` column. On startup we copy any not-yet-
//! migrated body into the database.
//!
//! Idempotent: only rows whose `body` is NULL or empty are touched, so this
//! is a no-op once every document has been migrated. The original
//! `document.json` files are deliberately **left untouched** — they serve as
//! a recovery backup and as the fallback path in [`read_document`].

use rusqlite::Connection;
use serde_json::Value;
use std::fs;

use crate::commands::storage::paths::documents_dir;

/// Backfill the `documents.body` column from legacy on-disk document files.
pub fn migrate_document_bodies(conn: &mut Connection) {
    // Collect the ids whose body still needs to be filled.
    let ids: Vec<String> = {
        let Ok(mut stmt) = conn.prepare("SELECT id FROM documents WHERE body IS NULL OR body = ''")
        else {
            return;
        };
        let Ok(rows) = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            Ok(id)
        }) else {
            return;
        };
        rows.flatten().collect()
    };

    if ids.is_empty() {
        return;
    }

    let docs = documents_dir();

    // Read each body off disk first so we don't hold file handles across the
    // transaction. Pair (id, body-json-string).
    let mut bodies: Vec<(String, String)> = Vec::new();
    for id in &ids {
        let new_path = docs.join(id).join("document.json");
        let legacy_path = docs.join(format!("{id}.json"));
        let path = if new_path.exists() {
            new_path
        } else if legacy_path.exists() {
            legacy_path
        } else {
            continue;
        };
        if let Ok(data) = fs::read_to_string(&path) {
            // Validate it parses as JSON before storing; skip corrupt files.
            if serde_json::from_str::<Value>(&data).is_ok() {
                bodies.push((id.clone(), data));
            }
        }
    }

    if bodies.is_empty() {
        return;
    }

    let tx = conn
        .transaction()
        .unwrap_or_else(|e| panic!("body migration tx: {e}"));
    for (id, body) in &bodies {
        let _ = tx.execute(
            "UPDATE documents SET body = ?2 WHERE id = ?1 AND (body IS NULL OR body = '')",
            rusqlite::params![id, body],
        );
    }
    let _ = tx.commit();
}
