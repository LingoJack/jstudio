/**
 * bundle.ts — lossless document backup bundles (.jnote).
 * Port of src-tauri/src/commands/bundle.rs.
 *
 * A .jnote is a plain ZIP: manifest.json + document.json + assets/*. The
 * manifest carries `format: "jstudio-bundle"` so imports reject foreign
 * archives. Rust-side zips (zip crate, Deflated) and Node-side zips (fflate,
 * Deflated) are mutually readable — old bundles must keep importing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { unzipSync, zipSync } from "fflate";
import { getDb } from "./db";
import { docDir } from "./paths";
import type { HandlerTable } from "./router";
import { takeString } from "./params";

const BUNDLE_FORMAT = "jstudio-bundle";
const BUNDLE_VERSION = 1;

function exportDocumentBundle(docId: string, destPath: string): null {
  const dir = docDir(docId);

  // Body from the database (canonical store), legacy document.json fallback.
  const row = getDb()
    .prepare("SELECT body FROM documents WHERE id = ?1")
    .get(docId) as { body: string | null } | undefined;
  const body = row?.body ?? null;
  let docBytes: Buffer;
  if (body != null && body.trim() !== "") {
    docBytes = Buffer.from(body, "utf8");
  } else {
    const docJsonPath = path.join(dir, "document.json");
    if (!fs.existsSync(docJsonPath)) throw new Error(`document not found: ${docId}`);
    docBytes = fs.readFileSync(docJsonPath);
  }

  // Parse the title (best-effort) purely to enrich the manifest.
  let title = "";
  try {
    const parsed = JSON.parse(docBytes.toString("utf8")) as Record<string, unknown>;
    if (typeof parsed["title"] === "string") title = parsed["title"];
  } catch {
    // unparseable body — manifest title stays empty, same as Rust
  }

  const manifest = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    id: docId,
    title,
    exportedAt: String(Date.now()),
  };

  const files: Record<string, Uint8Array> = {
    "manifest.json": Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    "document.json": docBytes,
  };

  const assetsDir = path.join(dir, "assets");
  if (fs.existsSync(assetsDir) && fs.statSync(assetsDir).isDirectory()) {
    for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      files[`assets/${entry.name}`] = fs.readFileSync(path.join(assetsDir, entry.name));
    }
  }

  try {
    fs.writeFileSync(destPath, zipSync(files));
  } catch (e) {
    throw new Error(`finalize bundle: ${String(e)}`);
  }
  return null;
}

function importDocumentBundle(srcPath: string, newDocId: string): unknown {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(srcPath);
  } catch (e) {
    throw new Error(`failed to open bundle ${srcPath}: ${String(e)}`);
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(raw));
  } catch (e) {
    throw new Error(`invalid bundle (not a zip): ${String(e)}`);
  }

  let manifestOk = false;
  let documentRaw: Uint8Array | null = null;
  const assets: Array<[string, Uint8Array]> = [];

  for (const [name, data] of Object.entries(entries)) {
    if (name === "manifest.json") {
      try {
        const m = JSON.parse(Buffer.from(data).toString("utf8")) as Record<string, unknown>;
        manifestOk = m["format"] === BUNDLE_FORMAT;
      } catch {
        // malformed manifest — stays unflagged, same as Rust
      }
      continue;
    }
    if (name === "document.json") {
      documentRaw = data;
      continue;
    }
    // assets/<file> — guard against path traversal / nested dirs.
    if (name.startsWith("assets/")) {
      const rest = name.slice("assets/".length);
      if (rest === "" || rest.includes("/") || rest.includes("\\") || rest.includes("..")) {
        continue;
      }
      assets.push([rest, data]);
    }
  }

  if (!manifestOk) throw new Error("not a JStudio backup bundle (.jnote)");
  if (!documentRaw) throw new Error("bundle is missing document.json");

  const doc = JSON.parse(
    Buffer.from(documentRaw).toString("utf8"),
  ) as Record<string, unknown>;
  doc["id"] = newDocId;

  if (assets.length > 0) {
    const assetsDir = path.join(docDir(newDocId), "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    for (const [name, data] of assets) {
      fs.writeFileSync(path.join(assetsDir, name), data);
    }
  }

  // Seed the DB row (metadata + body); the frontend follows up with
  // write_index for the sidebar metadata.
  const body = JSON.stringify(doc);
  const title = typeof doc["title"] === "string" ? doc["title"] : "";
  const emoji = typeof doc["emoji"] === "string" ? doc["emoji"] : "";
  const createdAt = typeof doc["createdAt"] === "string" ? doc["createdAt"] : "";
  const updatedAt = typeof doc["updatedAt"] === "string" ? doc["updatedAt"] : "";

  getDb()
    .prepare(
      "INSERT INTO documents (id, title, emoji, created_at, updated_at, body) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET body = excluded.body, title = excluded.title, emoji = excluded.emoji, updated_at = excluded.updated_at",
    )
    .run(newDocId, title, emoji, createdAt, updatedAt, body);

  return doc;
}

export const bundleHandlers: HandlerTable = {
  export_document_bundle: (p) =>
    exportDocumentBundle(takeString(p, "docId"), takeString(p, "destPath")),
  import_document_bundle: (p) =>
    importDocumentBundle(takeString(p, "srcPath"), takeString(p, "newDocId")),
};
