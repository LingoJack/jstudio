//! Orphan document recovery.
//!
//! Scans the `documents/` directory for documents that exist on disk but are
//! not present in the `documents` table, and registers the meaningful ones.
//!
//! This is the root-cause fix for documents that were "lost" during the
//! JSON → SQLite migration: the migration only imported entries listed in
//! `index.json`, but the filesystem can contain document folders that were
//! never indexed (e.g. created then never saved into the index). Their
//! `document.json` files survive untouched — they simply have no entry point
//! in the UI.
//!
//! We deliberately **skip completely blank documents** (no title *and* no
//! textual block content), so empty throwaway drafts don't clutter the
//! sidebar. Documents with a title or any real content are recovered, with
//! metadata read from their own `document.json`.

use rusqlite::Connection;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use crate::commands::storage::paths::documents_dir;

/// Extract the first piece of real text content from a document's `blocks`
/// array. Returns an empty string if the document has no textual content.
///
/// A block's text lives either in a plain `content` string, or in a
/// `content` array of `{ text, annotations }` rich-text spans (the editor's
/// native format), or in `properties.text`.
fn block_text_preview(blocks: &Value) -> String {
    let Some(arr) = blocks.as_array() else {
        return String::new();
    };
    for b in arr {
        // content: "..."
        if let Some(s) = b["content"].as_str()
            && !s.trim().is_empty()
        {
            return s.trim().to_string();
        }
        // content: [{ text: "..." }, ...]
        if let Some(spans) = b["content"].as_array() {
            let joined: String = spans
                .iter()
                .filter_map(|sp| sp["text"].as_str())
                .collect::<String>();
            if !joined.trim().is_empty() {
                return joined.trim().to_string();
            }
        }
        // properties.text: "..."
        if let Some(s) = b["properties"]["text"].as_str()
            && !s.trim().is_empty()
        {
            return s.trim().to_string();
        }
    }
    String::new()
}

/// Scan the `documents/` directory for documents that exist on disk but are
/// not present in the `documents` table, and register the meaningful ones.
pub fn reconcile_orphan_documents(conn: &mut Connection) {
    let docs_dir = documents_dir();
    let Ok(read) = fs::read_dir(&docs_dir) else {
        return;
    };

    // Sort directory entries by id so iteration is deterministic. Document ids
    // embed a creation timestamp (`doc-<ms>`), so ascending id order means the
    // *earliest* of any duplicate pair is the one that gets recovered.
    let mut dir_entries: Vec<PathBuf> = read.flatten().map(|e| e.path()).collect();
    dir_entries.sort();

    // Load the full set of deleted-document tombstones so we never resurrect
    // a document the user already permanently deleted.
    let tombstones: std::collections::HashSet<String> = {
        let mut set = std::collections::HashSet::new();
        if let Ok(mut stmt) = conn.prepare("SELECT id FROM deleted_documents")
            && let Ok(rows) = stmt.query_map([], |row| {
                let id: String = row.get(0)?;
                Ok(id)
            })
        {
            for row in rows.flatten() {
                set.insert(row);
            }
        }
        set
    };

    // Collect orphan rows first so we don't hold the read_dir iterator across
    // the transaction.
    let mut orphans: Vec<(String, String, String, String, String)> = Vec::new();
    // Fingerprints of orphan bodies already queued, so two orphans with
    // byte-identical content (e.g. an accidental duplicate save) only recover
    // once.
    let mut seen_bodies: std::collections::HashSet<String> = std::collections::HashSet::new();

    for path in dir_entries {
        if !path.is_dir() {
            continue;
        }
        let doc_id = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if doc_id.is_empty() {
            continue;
        }

        // Already registered? Skip.
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM documents WHERE id = ?1",
                rusqlite::params![doc_id],
                |_| Ok(()),
            )
            .is_ok();
        if exists {
            continue;
        }

        // User explicitly deleted this document before. Do NOT resurrect it.
        // Instead, clean up its leftover files on disk.
        if tombstones.contains(&doc_id) {
            let _ = fs::remove_dir_all(&path);
            continue;
        }

        // Read the document body.
        let doc_json = path.join("document.json");
        let Ok(data) = fs::read_to_string(&doc_json) else {
            continue;
        };
        let Ok(doc) = serde_json::from_str::<Value>(&data) else {
            continue;
        };

        let title = doc["title"].as_str().unwrap_or("").trim().to_string();
        let preview = block_text_preview(&doc["blocks"]);

        // Skip completely blank documents (no title and no content).
        // Also clean up their leftover folder to prevent accumulation.
        if title.is_empty() && preview.is_empty() {
            let _ = fs::remove_dir_all(&path);
            continue;
        }

        // Deduplicate by body content: skip if an identical blocks payload was
        // already queued for recovery.
        let fingerprint = serde_json::to_string(&doc["blocks"]).unwrap_or_default();
        if !fingerprint.is_empty() && !seen_bodies.insert(fingerprint) {
            continue;
        }

        let emoji = doc["emoji"].as_str().unwrap_or("").to_string();
        let created_at = doc["createdAt"].as_str().unwrap_or("").to_string();
        let updated_at = doc["updatedAt"].as_str().unwrap_or("").to_string();

        orphans.push((doc_id, title, emoji, created_at, updated_at));
    }

    if orphans.is_empty() {
        return;
    }

    let tx = conn
        .transaction()
        .unwrap_or_else(|e| panic!("orphan recovery tx: {e}"));
    for (id, title, emoji, created_at, updated_at) in &orphans {
        let _ = tx.execute(
            "INSERT OR IGNORE INTO documents \
             (id, title, emoji, folder_id, is_favorite, created_at, updated_at) \
             VALUES (?1, ?2, ?3, NULL, 0, ?4, ?5)",
            rusqlite::params![id, title, emoji, created_at, updated_at],
        );
    }
    let _ = tx.commit();
}
