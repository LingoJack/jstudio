/**
 * db.ts — SQLite storage layer (node:sqlite), port of src-tauri/src/db/
 * (connection.rs + schema.rs + migrate.rs + reconcile.rs + backfill.rs).
 *
 * The database lives at `~/.jdata/studio/studio.db` (WAL). Opening runs the
 * same init pipeline as the Rust side, in the same order, so a database
 * created by the Rust sidecar keeps working unchanged:
 *   1. pragmas (WAL / synchronous NORMAL / foreign_keys ON)
 *   2. create_tables (idempotent DDL + ensure_column incremental migrations)
 *   3. migrate_from_json (legacy JSON import, idempotent, renames to *.bak)
 *   4. reconcile_orphan_documents (register on-disk docs missing from the
 *      index; skip blanks; dedupe by body fingerprint; honor tombstones)
 *   5. migrate_document_bodies (backfill `body` from document.json files)
 *
 * DDL and migrations are ported line-for-line — user databases already
 * carry these tables, and a divergent schema here would brick them.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { documentsDir, ensureDir, studioDir } from "./paths";

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  db = openAndInit();
  return db;
}

function openAndInit(): DatabaseSync {
  ensureDir(studioDir());
  const conn = new DatabaseSync(path.join(studioDir(), "studio.db"));

  // Enable WAL for better read concurrency; NORMAL sync is the same
  // safety/speed balance the Rust side chose. foreign_keys ON so folder
  // cascades behave identically.
  conn.exec("PRAGMA journal_mode = WAL");
  conn.exec("PRAGMA synchronous = NORMAL");
  conn.exec("PRAGMA foreign_keys = ON");

  createTables(conn);
  migrateFromJson(conn);
  reconcileOrphanDocuments(conn);
  migrateDocumentBodies(conn);
  return conn;
}

/** Run `fn` inside a transaction, rolling back on throw. */
export function withTx<T>(conn: DatabaseSync, fn: () => T): T {
  conn.exec("BEGIN");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (e) {
    try {
      conn.exec("ROLLBACK");
    } catch {
      // already rolled back / no tx
    }
    throw e;
  }
}

// ── schema.rs ────────────────────────────────────────────────────────────────

function createTables(conn: DatabaseSync): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS documents (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL DEFAULT '',
        emoji       TEXT NOT NULL DEFAULT '',
        folder_id   TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        trashed_at  TEXT,
        body        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
    CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);

    CREATE TABLE IF NOT EXISTS folders (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        parent_id  TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        collapsed  INTEGER NOT NULL DEFAULT 0,
        trashed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deleted_documents (
        id        TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trashed_assets (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id        TEXT NOT NULL,
        trash_name    TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime          TEXT NOT NULL DEFAULT '',
        size_bytes    INTEGER NOT NULL DEFAULT 0,
        trashed_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trashed_assets_doc ON trashed_assets(doc_id);
  `);

  // Incremental migrations — add columns that earlier versions lacked.
  ensureColumn(conn, "documents", "trashed_at", "TEXT");
  ensureColumn(conn, "documents", "body", "TEXT");
  ensureColumn(conn, "folders", "trashed_at", "TEXT");
}

function ensureColumn(
  conn: DatabaseSync,
  table: string,
  column: string,
  colType: string,
): void {
  const rows = conn.prepare(`PRAGMA table_info(${table})`).all() as Array<
    Record<string, unknown>
  >;
  const has = rows.some((r) => r.name === column);
  if (!has) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${colType}`);
  }
}

// ── migrate.rs — legacy JSON import (idempotent) ─────────────────────────────

function tableIsEmpty(conn: DatabaseSync, table: string): boolean {
  const row = conn.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number | bigint;
  };
  return Number(row.n) === 0;
}

function migrateFromJson(conn: DatabaseSync): void {
  // ── index.json → documents ──
  const idx = path.join(studioDir(), "index.json");
  if (
    fs.existsSync(idx) &&
    tableIsEmpty(conn, "documents") &&
    readJsonArray(idx) !== null
  ) {
    const entries = readJsonArray(idx)!;
    withTx(conn, () => {
      const ins = conn.prepare(
        "INSERT OR REPLACE INTO documents (id, title, emoji, folder_id, is_favorite, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      );
      for (const entry of entries) {
        const id = str(entry["id"]);
        if (!id) continue;
        ins.run(
          id,
          str(entry["title"]),
          str(entry["emoji"]),
          optStr(entry["folderId"]),
          entry["isFavorite"] === true ? 1 : 0,
          str(entry["createdAt"]),
          str(entry["updatedAt"]),
        );
      }
    });
    renameToBak(idx);
  }

  // ── folders.json → folders ──
  const fpath = path.join(studioDir(), "folders.json");
  if (
    fs.existsSync(fpath) &&
    tableIsEmpty(conn, "folders") &&
    readJsonArray(fpath) !== null
  ) {
    const entries = readJsonArray(fpath)!;
    withTx(conn, () => {
      const ins = conn.prepare(
        "INSERT OR REPLACE INTO folders (id, name, parent_id, sort_order, collapsed) VALUES (?1, ?2, ?3, ?4, ?5)",
      );
      for (const entry of entries) {
        const id = str(entry["id"]);
        if (!id) continue;
        ins.run(
          id,
          str(entry["name"]),
          optStr(entry["parentId"]),
          typeof entry["sortOrder"] === "number" ? entry["sortOrder"] : 0,
          entry["collapsed"] === true ? 1 : 0,
        );
      }
    });
    renameToBak(fpath);
  }

  // ── settings.json → settings ──
  const spath = path.join(studioDir(), "settings.json");
  if (
    fs.existsSync(spath) &&
    tableIsEmpty(conn, "settings") &&
    readJsonObject(spath) !== null
  ) {
    const map = readJsonObject(spath)!;
    withTx(conn, () => {
      const ins = conn.prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
      );
      for (const [key, val] of Object.entries(map)) {
        ins.run(key, JSON.stringify(val ?? null));
      }
    });
    renameToBak(spath);
  }
}

function readJsonArray(p: string): Array<Record<string, unknown>> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (e): e is Record<string, unknown> => e != null && typeof e === "object",
    );
  } catch {
    return null;
  }
}

function readJsonObject(p: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(p, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function renameToBak(p: string): void {
  try {
    fs.renameSync(p, p.replace(/\.json$/, ".json.bak"));
  } catch {
    // best effort, same as the Rust side's `let _ =`
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function optStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// ── reconcile.rs — orphan document recovery ─────────────────────────────────

/**
 * First piece of real text content from a document's `blocks` array: a plain
 * `content` string, a rich-text span array (`{ text, … }`), or
 * `properties.text`. Empty string when there is no textual content.
 */
function blockTextPreview(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  for (const b of blocks as Array<Record<string, unknown>>) {
    if (b == null || typeof b !== "object") continue;
    const content = (b as Record<string, unknown>)["content"];
    if (typeof content === "string" && content.trim() !== "") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const joined = content
        .map((sp) =>
          sp && typeof sp === "object" && typeof (sp as Record<string, unknown>)["text"] === "string"
            ? ((sp as Record<string, unknown>)["text"] as string)
            : "",
        )
        .join("");
      if (joined.trim() !== "") return joined.trim();
    }
    const props = (b as Record<string, unknown>)["properties"];
    if (props && typeof props === "object") {
      const t = (props as Record<string, unknown>)["text"];
      if (typeof t === "string" && t.trim() !== "") return t.trim();
    }
  }
  return "";
}

function reconcileOrphanDocuments(conn: DatabaseSync): void {
  const docs = documentsDir();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(docs, { withFileTypes: true });
  } catch {
    return;
  }

  // Sort by id so iteration is deterministic — document ids embed a creation
  // timestamp (`doc-<ms>`), so the earliest of a duplicate pair recovers.
  const dirNames = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const tombstones = new Set(
    (conn.prepare("SELECT id FROM deleted_documents").all() as Array<{ id: string }>).map(
      (r) => r.id,
    ),
  );

  const orphans: Array<[string, string, string, string, string]> = [];
  const seenBodies = new Set<string>();

  for (const docId of dirNames) {
    if (!docId) continue;
    const dir = path.join(docs, docId);

    // Already registered? Skip.
    const exists = conn.prepare("SELECT 1 FROM documents WHERE id = ?1").get(docId);
    if (exists) continue;

    // Explicitly deleted earlier — never resurrect; clean up leftovers.
    if (tombstones.has(docId)) {
      fs.rmSync(dir, { recursive: true, force: true });
      continue;
    }

    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(
        fs.readFileSync(path.join(dir, "document.json"), "utf8"),
      ) as Record<string, unknown>;
    } catch {
      continue;
    }

    const title =
      typeof doc["title"] === "string" ? doc["title"].trim() : "";
    const preview = blockTextPreview(doc["blocks"]);

    // Skip blank throwaway drafts; clean their folders to avoid buildup.
    if (title === "" && preview === "") {
      fs.rmSync(dir, { recursive: true, force: true });
      continue;
    }

    // Dedupe by body fingerprint — identical duplicate saves recover once.
    const fingerprint = safeStringify(doc["blocks"]);
    if (fingerprint !== "" && seenBodies.has(fingerprint)) continue;
    if (fingerprint !== "") seenBodies.add(fingerprint);

    const emoji = typeof doc["emoji"] === "string" ? doc["emoji"] : "";
    const createdAt = typeof doc["createdAt"] === "string" ? doc["createdAt"] : "";
    const updatedAt = typeof doc["updatedAt"] === "string" ? doc["updatedAt"] : "";
    orphans.push([docId, title, emoji, createdAt, updatedAt]);
  }

  if (orphans.length === 0) return;

  withTx(conn, () => {
    const ins = conn.prepare(
      "INSERT OR IGNORE INTO documents (id, title, emoji, folder_id, is_favorite, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, 0, ?4, ?5)",
    );
    for (const [id, title, emoji, createdAt, updatedAt] of orphans) {
      ins.run(id, title, emoji, createdAt, updatedAt);
    }
  });
}

// ── backfill.rs — document body migration (filesystem → DB) ─────────────────

function migrateDocumentBodies(conn: DatabaseSync): void {
  const rows = conn
    .prepare("SELECT id FROM documents WHERE body IS NULL OR body = ''")
    .all() as Array<{ id: string }>;
  if (rows.length === 0) return;

  const docs = documentsDir();
  const bodies: Array<[string, string]> = [];
  for (const { id } of rows) {
    const newPath = path.join(docs, id, "document.json");
    const legacyPath = path.join(docs, `${id}.json`);
    const p = fs.existsSync(newPath) ? newPath : fs.existsSync(legacyPath) ? legacyPath : null;
    if (!p) continue;
    try {
      const data = fs.readFileSync(p, "utf8");
      JSON.parse(data); // validate — skip corrupt files, same as Rust
      bodies.push([id, data]);
    } catch {
      continue;
    }
  }
  if (bodies.length === 0) return;

  withTx(conn, () => {
    const upd = conn.prepare(
      "UPDATE documents SET body = ?2 WHERE id = ?1 AND (body IS NULL OR body = '')",
    );
    for (const [id, body] of bodies) upd.run(id, body);
  });
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
}
