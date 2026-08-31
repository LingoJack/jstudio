//! Folder tree CRUD (SQLite).

use serde_json::Value;

/// Read all folders from the database, ordered by `sort_order`.
pub fn read_folders() -> Result<Value, String> {
    let conn = crate::db::db()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, parent_id, sort_order, collapsed, trashed_at \
             FROM folders ORDER BY sort_order ASC",
        )
        .map_err(|e| format!("failed to prepare folders query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let parent_id: Option<String> = row.get(2)?;
            let sort_order: i64 = row.get(3)?;
            let collapsed: i64 = row.get(4)?;
            let trashed_at: Option<String> = row.get(5)?;

            let mut obj = serde_json::json!({
                "id": id,
                "name": name,
                "sortOrder": sort_order,
                "collapsed": collapsed != 0,
            });
            // Always emit `parentId` / `trashedAt` explicitly (null when absent).
            // If we skip the key entirely, JS receives `undefined` instead of
            // `null`, which breaks strict-equality filters like
            // `f.parentId === null` in buildFolderTree and makes top-level
            // folders invisible after reload.
            obj["parentId"] = match parent_id {
                Some(pid) => Value::String(pid),
                None => Value::Null,
            };
            obj["trashedAt"] = match trashed_at {
                Some(ta) => Value::String(ta),
                None => Value::Null,
            };
            Ok(obj)
        })
        .map_err(|e| format!("failed to query folders: {e}"))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("folders row error: {e}"))?);
    }
    Ok(Value::Array(entries))
}

/// Replace the entire folder tree in a single transaction.
pub fn write_folders(entries: Value) -> Result<(), String> {
    let arr = entries
        .as_array()
        .ok_or("write_folders: expected JSON array")?;

    let mut conn = crate::db::db()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin folders tx: {e}"))?;

    tx.execute("DELETE FROM folders", [])
        .map_err(|e| format!("failed to clear folders: {e}"))?;

    for entry in arr {
        let id = entry["id"].as_str().ok_or("write_folders: missing id")?;
        let name = entry["name"].as_str().unwrap_or("");
        let parent_id = entry["parentId"].as_str();
        let sort_order = entry["sortOrder"].as_i64().unwrap_or(0);
        let collapsed = if entry["collapsed"].as_bool() == Some(true) {
            1
        } else {
            0
        };
        let trashed_at = entry["trashedAt"].as_str();

        tx.execute(
            "INSERT OR REPLACE INTO folders \
             (id, name, parent_id, sort_order, collapsed, trashed_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, name, parent_id, sort_order, collapsed, trashed_at],
        )
        .map_err(|e| format!("failed to insert folder {id}: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("failed to commit folders tx: {e}"))
}
