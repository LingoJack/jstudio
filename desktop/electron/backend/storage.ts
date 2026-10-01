/**
 * storage.ts — documents / folders / settings / agent config / backups /
 * snapshots handlers. Port of src-tauri/src/commands/storage/{documents.rs,
 * folders.rs, settings.rs, backups.rs, snapshots.rs, paths.rs (fs helpers)}.
 *
 * Semantics preserved exactly — the tricky ones are documented inline:
 *   - write_index is a metadata-only UPSERT (never touches `body`, never
 *     deletes missing rows — trashed docs are owned by delete_document).
 *   - write_document snapshots the previous body into `.backups/` first and
 *     runs abnormal-shrink detection (block/char/node counts).
 *   - read_document falls back to the legacy filesystem when the DB body is
 *     empty and backfills on success.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getDb, withTx } from "./db";
import { notify } from "./protocol";
import { docDir, documentsDir, ensureDir, jdataDir, revealInFileManager, studioDir } from "./paths";
import type { HandlerTable } from "./router";
import { takeArray, takeObject, takeRaw, takeString } from "./params";

// ── documents.rs ─────────────────────────────────────────────────────────────

function readIndex(): unknown[] {
  const rows = getDb()
    .prepare(
      "SELECT id, title, emoji, folder_id, is_favorite, created_at, updated_at, trashed_at FROM documents ORDER BY updated_at DESC",
    )
    .all() as Array<
    Record<string, string | number | null>
  >;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    emoji: r.emoji,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isFavorite: Number(r.is_favorite) !== 0,
    folderId: r.folder_id ?? null,
    trashedAt: r.trashed_at ?? null,
  }));
}

function writeIndex(entries: unknown): null {
  if (!Array.isArray(entries)) throw new Error("write_index: expected JSON array");
  withTx(getDb(), () => {
    const up = getDb().prepare(
      "INSERT INTO documents (id, title, emoji, folder_id, is_favorite, created_at, updated_at, trashed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(id) DO UPDATE SET title = excluded.title, emoji = excluded.emoji, folder_id = excluded.folder_id, is_favorite = excluded.is_favorite, created_at = excluded.created_at, updated_at = excluded.updated_at, trashed_at = excluded.trashed_at",
    );
    for (const entry of entries as Array<Record<string, unknown>>) {
      const id = entry["id"];
      if (typeof id !== "string") throw new Error("write_index: missing id");
      const folderId = entry["folderId"];
      const trashedAt = entry["trashedAt"];
      up.run(
        id,
        typeof entry["title"] === "string" ? entry["title"] : "",
        typeof entry["emoji"] === "string" ? entry["emoji"] : "",
        typeof folderId === "string" ? folderId : null,
        entry["isFavorite"] === true ? 1 : 0,
        typeof entry["createdAt"] === "string" ? entry["createdAt"] : "",
        typeof entry["updatedAt"] === "string" ? entry["updatedAt"] : "",
        typeof trashedAt === "string" ? trashedAt : null,
      );
    }
  });
  return null;
}

function readDocument(docId: string): unknown {
  // 1. Database body (canonical store).
  const row = getDb()
    .prepare("SELECT body FROM documents WHERE id = ?1")
    .get(docId) as { body: string | null } | undefined;
  const body = row?.body ?? null;
  if (body != null && body.trim() !== "") {
    return JSON.parse(body) as unknown;
  }

  // 2. Legacy filesystem fallback, then backfill into the DB.
  const newPath = path.join(docDir(docId), "document.json");
  const legacyPath = path.join(documentsDir(), `${docId}.json`);
  const p = fs.existsSync(newPath)
    ? newPath
    : fs.existsSync(legacyPath)
      ? legacyPath
      : null;
  if (!p) throw new Error(`document not found: ${docId}`);

  const data = fs.readFileSync(p, "utf8");
  const parsed = JSON.parse(data) as unknown;

  try {
    getDb()
      .prepare("UPDATE documents SET body = ?2 WHERE id = ?1 AND (body IS NULL OR body = '')")
      .run(docId, data);
  } catch {
    // non-fatal, same as Rust's `let _ =`
  }
  return parsed;
}

function writeDocument(docId: string, doc: Record<string, unknown>): null {
  backupBeforeWrite(docId, doc);

  const body = JSON.stringify(doc);
  const title = typeof doc["title"] === "string" ? doc["title"] : "";
  const emoji = typeof doc["emoji"] === "string" ? doc["emoji"] : "";
  const createdAt = typeof doc["createdAt"] === "string" ? doc["createdAt"] : "";
  const updatedAt = typeof doc["updatedAt"] === "string" ? doc["updatedAt"] : "";

  getDb()
    .prepare(
      "INSERT INTO documents (id, title, emoji, created_at, updated_at, body) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET body = excluded.body, title = excluded.title, emoji = excluded.emoji, updated_at = excluded.updated_at",
    )
    .run(docId, title, emoji, createdAt, updatedAt, body);
  return null;
}

function deleteDocument(docId: string): null {
  const dir = docDir(docId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const legacy = path.join(documentsDir(), `${docId}.json`);
  if (fs.existsSync(legacy)) {
    fs.rmSync(legacy, { force: true });
  }

  const db = getDb();
  db.prepare("DELETE FROM documents WHERE id = ?1").run(docId);
  db.prepare("DELETE FROM trashed_assets WHERE doc_id = ?1").run(docId);
  db.prepare("INSERT OR IGNORE INTO deleted_documents (id) VALUES (?1)").run(docId);
  return null;
}

// ── folders.rs ───────────────────────────────────────────────────────────────

function readFolders(): unknown[] {
  const rows = getDb()
    .prepare(
      "SELECT id, name, parent_id, sort_order, collapsed, trashed_at FROM folders ORDER BY sort_order ASC",
    )
    .all() as Array<Record<string, string | number | null>>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: Number(r.sort_order),
    collapsed: Number(r.collapsed) !== 0,
    parentId: r.parent_id ?? null,
    trashedAt: r.trashed_at ?? null,
  }));
}

function writeFolders(entries: unknown): null {
  if (!Array.isArray(entries)) throw new Error("write_folders: expected JSON array");
  withTx(getDb(), () => {
    getDb().exec("DELETE FROM folders");
    const ins = getDb().prepare(
      "INSERT OR REPLACE INTO folders (id, name, parent_id, sort_order, collapsed, trashed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    );
    for (const entry of entries as Array<Record<string, unknown>>) {
      const id = entry["id"];
      if (typeof id !== "string") throw new Error("write_folders: missing id");
      const parentId = entry["parentId"];
      const trashedAt = entry["trashedAt"];
      ins.run(
        id,
        typeof entry["name"] === "string" ? entry["name"] : "",
        typeof parentId === "string" ? parentId : null,
        typeof entry["sortOrder"] === "number" ? entry["sortOrder"] : 0,
        entry["collapsed"] === true ? 1 : 0,
        typeof trashedAt === "string" ? trashedAt : null,
      );
    }
  });
  return null;
}

// ── settings.rs ──────────────────────────────────────────────────────────────

function readSettings(): Record<string, unknown> {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings")
    .all() as Array<{ key: string; value: string }>;
  const obj: Record<string, unknown> = {};
  for (const { key, value } of rows) {
    try {
      obj[key] = JSON.parse(value) as unknown;
    } catch {
      obj[key] = null;
    }
  }
  return obj;
}

/** Partial upsert — keys absent from the payload keep their current value. */
function writeSettings(settings: unknown): null {
  if (settings == null || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("write_settings: expected JSON object");
  }
  withTx(getDb(), () => {
    const up = getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)");
    for (const [key, val] of Object.entries(settings as Record<string, unknown>)) {
      up.run(key, JSON.stringify(val ?? null));
    }
  });
  return null;
}

function agentConfigPath(): string {
  return path.join(jdataDir(), "agent", "data", "agent_config.json");
}

function readAgentConfig(): unknown {
  const p = agentConfigPath();
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
}

function writeAgentConfig(config: unknown): null {
  const p = agentConfigPath();
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(config, null, 2));
  return null;
}

// ── backups.rs ───────────────────────────────────────────────────────────────

const MAX_BACKUPS = 50;
const ABNORMAL_FRACTION = 0.2;
const ABNORMAL_OLD_MIN = 5;
const ABNORMAL_CHAR_FRACTION = 0.5;
const ABNORMAL_CHAR_OLD_MIN = 200;

function backupsDir(docId: string): string {
  return path.join(docDir(docId), ".backups");
}

function countBlocks(body: string): number {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return Array.isArray(parsed["blocks"]) ? parsed["blocks"].length : 0;
  } catch {
    return 0;
  }
}

/** Recursive sum of every `text` node's value — chars counted as unicode
 *  scalar values ([...s].length) to match Rust's `chars().count()`. */
function countTextCharsValue(v: unknown): number {
  let total = 0;
  if (Array.isArray(v)) {
    for (const item of v) total += countTextCharsValue(item);
  } else if (v != null && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (obj["type"] === "text" && typeof obj["text"] === "string") {
      total += [...obj["text"]].length;
    }
    for (const child of Object.values(obj)) total += countTextCharsValue(child);
  }
  return total;
}

function countNodesValue(v: unknown): number {
  let total = 0;
  if (Array.isArray(v)) {
    for (const item of v) total += countNodesValue(item);
  } else if (v != null && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("type" in obj) total += 1;
    for (const child of Object.values(obj)) total += countNodesValue(child);
  }
  return total;
}

function pruneBackups(dir: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.length <= MAX_BACKUPS) return;
  const sorted = entries
    .map((e) => {
      const full = path.join(dir, e.name);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(full).mtimeMs;
      } catch {
        // treat unreadable entries as oldest
      }
      return { full, mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const { full } of sorted.slice(0, sorted.length - MAX_BACKUPS)) {
    fs.rmSync(full, { force: true });
  }
}

/**
 * Snapshot the current body into `.backups/{ms}.json`, prune, and emit
 * `document:abnormal-shrink` when the incoming content is suspiciously
 * smaller (block-count AND text-char signals, exactly like the Rust side).
 */
function backupBeforeWrite(docId: string, newDoc: Record<string, unknown>): void {
  const row = getDb()
    .prepare("SELECT body FROM documents WHERE id = ?1")
    .get(docId) as { body: string | null } | undefined;
  const oldBody = row?.body ?? null;
  if (oldBody == null || oldBody.trim() === "") return;

  const oldCount = countBlocks(oldBody);
  const oldChars = countTextCharsValue(JSON.parse(oldBody));
  const oldNodes = countNodesValue(JSON.parse(oldBody));
  let ts = Date.now();

  const dir = backupsDir(docId);
  ensureDir(dir);
  // Monotonic file name: a same-ms collision must NOT overwrite the previous
  // envelope — restore_doc_backup reads it back, and the Node sidecar is fast
  // enough to hit that window deterministically (the Rust side had the same
  // latent race but judged it acceptable; here it broke the smoke gate).
  while (fs.existsSync(path.join(dir, `${ts}.json`))) ts += 1;
  const envelope = {
    timestampMs: ts,
    blockCount: oldCount,
    charCount: oldChars,
    nodeCount: oldNodes,
    body: oldBody,
  };
  fs.writeFileSync(path.join(dir, `${ts}.json`), JSON.stringify(envelope));
  pruneBackups(dir);

  const newCount = Array.isArray(newDoc["blocks"]) ? newDoc["blocks"].length : 0;
  const newChars = countTextCharsValue(newDoc);
  const newNodes = countNodesValue(newDoc);

  const blockShrink =
    oldCount > ABNORMAL_OLD_MIN && newCount < oldCount * ABNORMAL_FRACTION;
  const charShrink =
    oldChars > ABNORMAL_CHAR_OLD_MIN && newChars < oldChars * ABNORMAL_CHAR_FRACTION;

  if (blockShrink || charShrink) {
    notify("document:abnormal-shrink", {
      docId,
      oldCount,
      newCount,
      oldCharCount: oldChars,
      newCharCount: newChars,
      oldNodeCount: oldNodes,
      newNodeCount: newNodes,
    });
  }
}

function listDocBackups(docId: string): unknown[] {
  const dir = backupsDir(docId);
  if (!fs.existsSync(dir)) return [];

  const out: Array<Record<string, unknown>> = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;
    const full = path.join(dir, entry);
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      // unreadable entry — size 0, same as Rust's unwrap_or(0)
    }
    let ts = 0;
    let blockCount = 0;
    let charCount = 0;
    let nodeCount = 0;
    try {
      const v = JSON.parse(fs.readFileSync(full, "utf8")) as Record<string, unknown>;
      ts = typeof v["timestampMs"] === "number" ? v["timestampMs"] : 0;
      blockCount = typeof v["blockCount"] === "number" ? v["blockCount"] : 0;
      charCount = typeof v["charCount"] === "number" ? v["charCount"] : 0;
      nodeCount = typeof v["nodeCount"] === "number" ? v["nodeCount"] : 0;
    } catch {
      // envelope unreadable — zeros, same as Rust
    }
    out.push({
      id: entry.replace(/\.json$/, ""),
      timestampMs: ts,
      blockCount,
      charCount,
      nodeCount,
      size,
    });
  }
  out.sort((a, b) => Number(b.timestampMs) - Number(a.timestampMs));
  return out;
}

function readBackupEnvelope(docId: string, backupId: string): Record<string, unknown> {
  const p = path.join(backupsDir(docId), `${backupId}.json`);
  if (!fs.existsSync(p)) throw new Error(`backup not found: ${backupId}`);
  const envelope = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
  const bodyStr = envelope["body"];
  if (typeof bodyStr !== "string") throw new Error("backup envelope missing body");
  return JSON.parse(bodyStr) as Record<string, unknown>;
}

function readDocBackup(docId: string, backupId: string): unknown {
  return readBackupEnvelope(docId, backupId);
}

function restoreDocBackup(docId: string, backupId: string): null {
  // Snapshot the current body first — the restore itself stays reversible.
  backupBeforeWrite(docId, { blocks: [] });

  const body = readBackupEnvelope(docId, backupId);
  getDb()
    .prepare(
      "UPDATE documents SET body = ?2, title = ?3, emoji = ?4, updated_at = ?5 WHERE id = ?1",
    )
    .run(
      docId,
      JSON.stringify(body),
      typeof body["title"] === "string" ? body["title"] : "",
      typeof body["emoji"] === "string" ? body["emoji"] : "",
      typeof body["updatedAt"] === "string" ? body["updatedAt"] : "",
    );
  return null;
}

// ── snapshots.rs ─────────────────────────────────────────────────────────────

const SNAPSHOT_ROTATION_KEEP = 3;

function saveDocSnapshot(docId: string, sections: unknown): null {
  const dir = path.join(docDir(docId), ".snapshots");
  ensureDir(dir);

  // Rotate: shift editor.{n} → editor.{n+1}; oldest dropped by overwrite.
  for (let n = SNAPSHOT_ROTATION_KEEP - 2; n >= 0; n--) {
    const from = path.join(dir, `editor.${n}.json`);
    const to = path.join(dir, `editor.${n + 1}.json`);
    try {
      fs.renameSync(from, to);
    } catch {
      // missing file — nothing to shift
    }
  }

  const envelope = { timestampMs: Date.now(), docId, sections };
  const finalPath = path.join(dir, "editor.0.json");
  const tmpPath = path.join(dir, "editor.0.json.tmp");
  fs.writeFileSync(tmpPath, JSON.stringify(envelope));
  fs.renameSync(tmpPath, finalPath);
  return null;
}

function readDocSnapshot(docId: string): unknown {
  const p = path.join(docDir(docId), ".snapshots", "editor.0.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
}

// ── paths.rs commands ────────────────────────────────────────────────────────

function ensureStudioDir(): string {
  ensureDir(documentsDir());
  getDb(); // force lazy init (tables + migrations), same as init_db()
  return studioDir();
}

export const storageHandlers: HandlerTable = {
  ensure_studio_dir: () => ensureStudioDir(),
  open_studio_dir: () => (revealInFileManager(studioDir()), null),
  open_doc_dir: (p) => (revealInFileManager(docDir(takeString(p, "docId"))), null),
  get_doc_path: (p) => {
    const docId = takeString(p, "docId");
    const full = path.join(docDir(docId), "document.json");
    if (!fs.existsSync(full)) {
      const legacy = path.join(documentsDir(), `${docId}.json`);
      if (fs.existsSync(legacy)) return legacy;
    }
    return full;
  },
  read_file_bytes: (p) => {
    const file = takeString(p, "path");
    return [...fs.readFileSync(file)];
  },
  write_file_bytes: (p) => {
    const file = takeString(p, "path");
    const data = takeArray<number>(p, "data");
    fs.writeFileSync(file, Buffer.from(data));
    return null;
  },

  read_index: () => readIndex(),
  write_index: (p) => writeIndex(takeRaw(p, "entries")),
  read_document: (p) => readDocument(takeString(p, "docId")),
  write_document: (p) => {
    const doc = takeObject(p, "doc");
    return writeDocument(takeString(p, "docId"), doc);
  },
  delete_document: (p) => deleteDocument(takeString(p, "docId")),

  list_doc_backups: (p) => listDocBackups(takeString(p, "docId")),
  read_doc_backup: (p) => readDocBackup(takeString(p, "docId"), takeString(p, "backupId")),
  restore_doc_backup: (p) =>
    restoreDocBackup(takeString(p, "docId"), takeString(p, "backupId")),

  save_doc_snapshot: (p) => saveDocSnapshot(takeString(p, "docId"), takeRaw(p, "sections")),
  read_doc_snapshot: (p) => readDocSnapshot(takeString(p, "docId")),

  read_folders: () => readFolders(),
  write_folders: (p) => writeFolders(takeRaw(p, "entries")),

  read_settings: () => readSettings(),
  write_settings: (p) => writeSettings(takeRaw(p, "settings")),

  read_agent_config: () => readAgentConfig(),
  write_agent_config: (p) => writeAgentConfig(takeRaw(p, "config")),
};
