//! Lossless document backup bundles (`.jnote`).
//!
//! A `.jnote` file is a plain ZIP archive that packages a single document
//! together with all of its private assets, so it can be shared as one file
//! and re-imported with **zero information loss** (unlike Markdown export).
//!
//! Archive layout:
//!
//! ```text
//! my-note.jnote  (zip)
//! ├── manifest.json      { format: "jstudio-bundle", version, id, exportedAt }
//! ├── document.json      the full Document (title, blocks, properties…)
//! └── assets/            every file from documents/{id}/assets/
//!     ├── image-1.png
//!     └── file-2.pdf
//! ```
//!
//! Asset references inside `document.json` are doc-relative (`assets/{name}`)
//! and never embed the document id, so import only needs to extract the files
//! and rewrite the top-level `id` — nothing inside `blocks` changes.

use rusqlite::OptionalExtension;
use serde_json::Value;
use std::fs::{self, File};
use std::io::{Read, Write};
use zip::write::SimpleFileOptions;

use crate::commands::storage::paths::doc_dir;

/// Marker stored in `manifest.json` to recognise our archives on import.
const BUNDLE_FORMAT: &str = "jstudio-bundle";
/// Bundle format version — bump if the on-disk layout ever changes.
const BUNDLE_VERSION: u32 = 1;

// ────────────────────────────────────────────────
// Export
// ────────────────────────────────────────────────

/// Export one document into a `.jnote` ZIP archive at `dest_path`.
///
/// Packages `document.json`, a `manifest.json`, and the whole `assets/`
/// folder. The caller (frontend) chooses `dest_path` via a save dialog.
#[tauri::command]
pub fn export_document_bundle(doc_id: String, dest_path: String) -> Result<(), String> {
    let dir = doc_dir(&doc_id);

    // Read the body from the database (canonical store), falling back to a
    // legacy on-disk `document.json` for content not yet migrated.
    let doc_bytes: Vec<u8> = {
        let body: Option<String> = {
            let conn = crate::db::db()?;
            conn.query_row(
                "SELECT body FROM documents WHERE id = ?1",
                rusqlite::params![doc_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|e| format!("read document body {doc_id}: {e}"))?
            .flatten()
        };

        match body {
            Some(s) if !s.trim().is_empty() => s.into_bytes(),
            _ => {
                let doc_json_path = dir.join("document.json");
                if !doc_json_path.exists() {
                    return Err(format!("document not found: {doc_id}"));
                }
                fs::read(&doc_json_path)
                    .map_err(|e| format!("failed to read document.json: {e}"))?
            }
        }
    };

    // Parse the title (best-effort) purely to enrich the manifest.
    let title = serde_json::from_slice::<Value>(&doc_bytes)
        .ok()
        .and_then(|v| v["title"].as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    let manifest = serde_json::json!({
        "format": BUNDLE_FORMAT,
        "version": BUNDLE_VERSION,
        "id": doc_id,
        "title": title,
        "exportedAt": chrono_now(),
    });
    let manifest_bytes =
        serde_json::to_vec_pretty(&manifest).map_err(|e| format!("manifest serialize: {e}"))?;

    let file = File::create(&dest_path)
        .map_err(|e| format!("failed to create bundle {dest_path}: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // manifest.json
    zip.start_file("manifest.json", opts)
        .map_err(|e| format!("zip manifest: {e}"))?;
    zip.write_all(&manifest_bytes)
        .map_err(|e| format!("write manifest: {e}"))?;

    // document.json
    zip.start_file("document.json", opts)
        .map_err(|e| format!("zip document: {e}"))?;
    zip.write_all(&doc_bytes)
        .map_err(|e| format!("write document: {e}"))?;

    // assets/* (optional — a document may have no assets)
    let assets_dir = dir.join("assets");
    if assets_dir.is_dir() {
        let rd =
            fs::read_dir(&assets_dir).map_err(|e| format!("failed to read assets dir: {e}"))?;
        for entry in rd.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };
            let data = fs::read(&path).map_err(|e| format!("read asset {name}: {e}"))?;
            zip.start_file(format!("assets/{name}"), opts)
                .map_err(|e| format!("zip asset {name}: {e}"))?;
            zip.write_all(&data)
                .map_err(|e| format!("write asset {name}: {e}"))?;
        }
    }

    zip.finish().map_err(|e| format!("finalize bundle: {e}"))?;
    Ok(())
}

// ────────────────────────────────────────────────
// Import
// ────────────────────────────────────────────────

/// Import a `.jnote` archive from `src_path` into a fresh document folder
/// `documents/{new_doc_id}/`.
///
/// The caller supplies `new_doc_id` (e.g. `doc-<timestamp>`) so id generation
/// stays consistent with the rest of the app and collisions are impossible.
///
/// Returns the parsed `Document` JSON (with its `id` rewritten to
/// `new_doc_id`) so the frontend can register it in the index and load it
/// into memory.
#[tauri::command]
pub fn import_document_bundle(src_path: String, new_doc_id: String) -> Result<Value, String> {
    let file =
        File::open(&src_path).map_err(|e| format!("failed to open bundle {src_path}: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("invalid bundle (not a zip): {e}"))?;

    // ── Read manifest + document.json out of the archive ──
    let mut document_raw: Option<Vec<u8>> = None;
    // Collected asset (name, bytes) pairs to write after we create the folder.
    let mut assets: Vec<(String, Vec<u8>)> = Vec::new();
    let mut manifest_ok = false;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("read zip entry {i}: {e}"))?;
        let name = entry.name().to_string();

        if name == "manifest.json" {
            let mut buf = String::new();
            entry
                .read_to_string(&mut buf)
                .map_err(|e| format!("read manifest: {e}"))?;
            if let Ok(m) = serde_json::from_str::<Value>(&buf) {
                manifest_ok = m["format"].as_str() == Some(BUNDLE_FORMAT);
            }
            continue;
        }

        if name == "document.json" {
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("read document.json: {e}"))?;
            document_raw = Some(buf);
            continue;
        }

        // assets/<file>  — guard against path traversal / nested dirs.
        if let Some(rest) = name.strip_prefix("assets/") {
            if rest.is_empty() || rest.contains('/') || rest.contains('\\') || rest.contains("..") {
                continue;
            }
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("read asset {rest}: {e}"))?;
            assets.push((rest.to_string(), buf));
        }
    }

    if !manifest_ok {
        return Err("not a JStudio backup bundle (.jnote)".to_string());
    }
    let document_raw = document_raw.ok_or("bundle is missing document.json")?;

    // ── Parse + rewrite the document id ──
    let mut doc: Value =
        serde_json::from_slice(&document_raw).map_err(|e| format!("parse document.json: {e}"))?;
    doc["id"] = Value::String(new_doc_id.clone());

    // ── Write assets to disk: documents/{new_doc_id}/assets/ ──
    if !assets.is_empty() {
        let assets_dir = doc_dir(&new_doc_id).join("assets");
        fs::create_dir_all(&assets_dir).map_err(|e| format!("create assets dir: {e}"))?;
        for (name, data) in &assets {
            fs::write(assets_dir.join(name), data)
                .map_err(|e| format!("write asset {name}: {e}"))?;
        }
    }

    // ── Write the body + metadata into the database ──
    // The frontend follows up with a `write_index` (metadata UPSERT); we still
    // seed the metadata columns here so the row is complete immediately.
    let body = serde_json::to_string(&doc).map_err(|e| format!("serialize doc: {e}"))?;
    let title = doc["title"].as_str().unwrap_or("");
    let emoji = doc["emoji"].as_str().unwrap_or("");
    let created_at = doc["createdAt"].as_str().unwrap_or("");
    let updated_at = doc["updatedAt"].as_str().unwrap_or("");

    let conn = crate::db::db()?;
    conn.execute(
        "INSERT INTO documents (id, title, emoji, created_at, updated_at, body) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(id) DO UPDATE SET \
           body = excluded.body, \
           title = excluded.title, \
           emoji = excluded.emoji, \
           updated_at = excluded.updated_at",
        rusqlite::params![new_doc_id, title, emoji, created_at, updated_at, body],
    )
    .map_err(|e| format!("write document to db: {e}"))?;

    Ok(doc)
}

// ────────────────────────────────────────────────
// Small helper — current time as ISO-8601-ish string
// ────────────────────────────────────────────────

/// Return the current time as a millisecond UNIX timestamp string.
///
/// We avoid pulling in a date crate just for the manifest; an epoch-ms value
/// is unambiguous and enough for backup provenance.
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    ms.to_string()
}
