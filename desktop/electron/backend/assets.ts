/**
 * assets.ts — document-private assets + per-document recycle bin +
 * markdown directory scan. Port of src-tauri/src/commands/storage/
 * {assets.rs, markdown.rs}.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getDb } from "./db";
import { docAssetsDir, docTrashDir, studioDir } from "./paths";
import type { HandlerTable } from "./router";
import { takeArray, takeNumber, takeString } from "./params";

// ── helpers (assets.rs) ──────────────────────────────────────────────────────

/** `photo.png` → `photo-1.png` → `photo-2.png` … until a free name is found. */
function resolveUniqueName(dir: string, fileName: string): string {
  if (!fs.existsSync(path.join(dir, fileName))) return fileName;
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  for (let i = 1; i < 2 ** 32; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
  return `${stem}-overflow${ext}`;
}

function guessMime(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "html":
    case "htm":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
    case "mjs":
      return "text/javascript";
    case "ts":
      return "text/typescript";
    case "json":
      return "application/json";
    case "txt":
    case "md":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

/** Same rounding ladder as Rust's format_file_size. */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const value = bytes / 1024 ** i;
  const rounded = i === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[i]}`;
}

// ── assets (filesystem) ──────────────────────────────────────────────────────

function saveDocAsset(docId: string, fileName: string, data: number[]): string {
  const dir = docAssetsDir(docId);
  fs.mkdirSync(dir, { recursive: true });
  const finalName = resolveUniqueName(dir, fileName);
  fs.writeFileSync(path.join(dir, finalName), Buffer.from(data));
  return finalName;
}

function listDocAssets(docId: string): unknown[] {
  const dir = docAssetsDir(docId);
  if (!fs.existsSync(dir)) return [];

  const entries: Array<Record<string, unknown>> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const dot = entry.name.lastIndexOf(".");
    const name = dot > 0 ? entry.name.slice(0, dot) : entry.name;
    const ext = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : "";

    entries.push({
      fileName: entry.name,
      name,
      type: guessMime(ext),
      size: formatFileSize(stat.size),
      sizeBytes: stat.size,
      createdAt: Math.floor(stat.mtimeMs),
    });
  }

  entries.sort(
    (a, b) => Number(b["createdAt"] ?? 0) - Number(a["createdAt"] ?? 0),
  );
  return entries;
}

// ── recycle bin (.trash/ + trashed_assets table) ────────────────────────────

function trashDocAsset(docId: string, fileName: string): null {
  const src = path.join(docAssetsDir(docId), fileName);
  if (!fs.existsSync(src)) return null; // already gone — no-op success

  let sizeBytes = 0;
  try {
    sizeBytes = fs.statSync(src).size;
  } catch {
    // treat unreadable as empty, same as Rust's unwrap_or(0)
  }
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";

  const trashDir = docTrashDir(docId);
  fs.mkdirSync(trashDir, { recursive: true });
  const trashName = resolveUniqueName(trashDir, fileName);
  fs.renameSync(src, path.join(trashDir, trashName));

  getDb()
    .prepare(
      "INSERT INTO trashed_assets (doc_id, trash_name, original_name, mime, size_bytes, trashed_at) VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .run(docId, trashName, fileName, guessMime(ext), sizeBytes);
  return null;
}

function listTrashedAssets(): unknown[] {
  return getDb()
    .prepare(
      "SELECT id, doc_id, trash_name, original_name, mime, size_bytes, trashed_at FROM trashed_assets ORDER BY trashed_at DESC",
    )
    .all()
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: Number(row.id),
        docId: row.doc_id,
        trashName: row.trash_name,
        originalName: row.original_name,
        type: row.mime,
        sizeBytes: Number(row.size_bytes),
        trashedAt: row.trashed_at,
      };
    });
}

function restoreTrashedAsset(id: number): null {
  const row = getDb()
    .prepare("SELECT doc_id, trash_name, original_name FROM trashed_assets WHERE id = ?1")
    .get(id) as { doc_id: string; trash_name: string; original_name: string } | undefined;
  if (!row) return null;

  const src = path.join(docTrashDir(row.doc_id), row.trash_name);
  if (fs.existsSync(src)) {
    const assets = docAssetsDir(row.doc_id);
    fs.mkdirSync(assets, { recursive: true });
    const finalName = resolveUniqueName(assets, row.original_name);
    fs.renameSync(src, path.join(assets, finalName));
  }

  getDb().prepare("DELETE FROM trashed_assets WHERE id = ?1").run(id);
  return null;
}

function deleteTrashedAsset(id: number): null {
  const row = getDb()
    .prepare("SELECT doc_id, trash_name FROM trashed_assets WHERE id = ?1")
    .get(id) as { doc_id: string; trash_name: string } | undefined;
  if (row) {
    const p = path.join(docTrashDir(row.doc_id), row.trash_name);
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
  getDb().prepare("DELETE FROM trashed_assets WHERE id = ?1").run(id);
  return null;
}

// ── markdown.rs — recursive directory scan ───────────────────────────────────

function isMarkdown(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ext === ".md" || ext === ".markdown" || ext === ".mdown";
}

function collectMarkdown(root: string, current: string, out: Array<Record<string, unknown>>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch (e) {
    throw new Error(`failed to read dir ${current}: ${String(e)}`);
  }
  for (const entry of entries) {
    // Skip hidden files/directories (dotfiles like .git, .DS_Store, …)
    if (entry.name.startsWith(".")) continue;
    const full = path.join(current, entry.name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      out.push({ path: full, relativePath: rel, isDir: true });
      collectMarkdown(root, full, out);
    } else if (isMarkdown(entry.name)) {
      out.push({ path: full, relativePath: rel, isDir: false });
    }
  }
}

function listMarkdownFiles(dir: string): unknown[] {
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`not a directory: ${dir}`);
  }
  const entries: Array<Record<string, unknown>> = [];
  collectMarkdown(dir, dir, entries);
  // Sort by relative path — directories land before the files they contain,
  // which the frontend relies on to create folders first.
  entries.sort((a, b) =>
    String(a["relativePath"]).localeCompare(String(b["relativePath"])),
  );
  return entries;
}

export const assetsHandlers: HandlerTable = {
  save_doc_asset: (p) =>
    saveDocAsset(takeString(p, "docId"), takeString(p, "fileName"), takeArray<number>(p, "data")),
  delete_doc_asset: (p) => {
    const full = path.join(docAssetsDir(takeString(p, "docId")), takeString(p, "fileName"));
    if (fs.existsSync(full)) fs.rmSync(full, { force: true });
    return null;
  },
  list_doc_assets: (p) => listDocAssets(takeString(p, "docId")),

  clean_global_assets: () => {
    const dir = path.join(studioDir(), "assets");
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    return null;
  },

  trash_doc_asset: (p) => trashDocAsset(takeString(p, "docId"), takeString(p, "fileName")),
  list_trashed_assets: () => listTrashedAssets(),
  restore_trashed_asset: (p) => restoreTrashedAsset(takeNumber(p, "id")),
  delete_trashed_asset: (p) => deleteTrashedAsset(takeNumber(p, "id")),

  list_markdown_files: (p) => listMarkdownFiles(takeString(p, "dir")),
};
