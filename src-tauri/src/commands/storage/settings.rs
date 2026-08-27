//! App settings + agent config (both backed by SQLite / filesystem).

use serde_json::Value;
use std::fs;
use std::path::PathBuf;

/// Read all settings from the database, assembled into a single JSON object.
///
/// Each row in the `settings` table stores one key with a JSON-encoded value;
/// this function rehydrates them into `{ key1: value1, key2: value2, ... }`.
pub fn read_settings() -> Result<Value, String> {
    let conn = crate::db::db()?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| format!("failed to prepare settings query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let value_str: String = row.get(1)?;
            Ok((key, value_str))
        })
        .map_err(|e| format!("failed to query settings: {e}"))?;

    let mut obj = serde_json::Map::new();
    for row in rows {
        let (key, value_str) = row.map_err(|e| format!("settings row error: {e}"))?;
        let val: Value = serde_json::from_str(&value_str).unwrap_or(Value::Null);
        obj.insert(key, val);
    }
    Ok(Value::Object(obj))
}

/// Write settings (partial upsert).
///
/// The frontend sends **partial** objects (e.g. `{ "theme": "dark" }`).
/// Each key in the incoming object is upserted into the `settings` table;
/// keys not present in the incoming object are left untouched — this
/// preserves the existing shallow-merge semantics.
pub fn write_settings(settings: Value) -> Result<(), String> {
    let obj = settings
        .as_object()
        .ok_or("write_settings: expected JSON object")?;

    let mut conn = crate::db::db()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin settings tx: {e}"))?;

    for (key, val) in obj {
        let value_str = serde_json::to_string(val).unwrap_or_else(|_| "null".into());
        tx.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value_str],
        )
        .map_err(|e| format!("failed to upsert setting '{key}': {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("failed to commit settings tx: {e}"))
}

// ────────────────────────────────────────────────
// Agent config (~/.jdata/agent/data/agent_config.json)
// ────────────────────────────────────────────────

/// `~/.jdata/agent/data/agent_config.json`  (jcli agent 主配置)
fn agent_config_path() -> PathBuf {
    crate::commands::storage::paths::jdata_dir()
        .join("agent")
        .join("data")
        .join("agent_config.json")
}

/// Read the jcli agent configuration file.
/// Returns `{}` if the file does not exist yet — JStudio can create it
/// on first save, so no external initialisation step is required.
pub fn read_agent_config() -> Result<Value, String> {
    let path = agent_config_path();
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

/// Write the full jcli agent configuration file.
/// Creates the parent directory tree if it does not exist.
pub fn write_agent_config(config: Value) -> Result<(), String> {
    let path = agent_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
