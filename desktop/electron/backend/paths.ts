/**
 * paths.ts — shared filesystem locations and OS reveal helpers for the Node
 * sidecar. Mirrors src-tauri/src/commands/storage/paths.rs.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** The shared jdata root: `~/.jdata/` (all jcli/jstudio data lives here). */
export function jdataDir(): string {
  return path.join(os.homedir(), ".jdata");
}

const STUDIO_DIR_OVERRIDE = process.env.JSTUDIO_STUDIO_DIR;

/** The studio data root: `~/.jdata/studio/`.
 *
 * `JSTUDIO_STUDIO_DIR` overrides the location — the parity/smoke harnesses
 * set it to a sandbox copy so tests never touch the user's live data. */
export function studioDir(): string {
  return STUDIO_DIR_OVERRIDE ?? path.join(jdataDir(), "studio");
}

/** `~/.jdata/studio/documents/` */
export function documentsDir(): string {
  return path.join(studioDir(), "documents");
}

/** `~/.jdata/studio/documents/{docId}/` */
export function docDir(docId: string): string {
  return path.join(documentsDir(), docId);
}

/** `~/.jdata/studio/documents/{docId}/assets/` */
export function docAssetsDir(docId: string): string {
  return path.join(docDir(docId), "assets");
}

/** `~/.jdata/studio/documents/{docId}/.trash/` */
export function docTrashDir(docId: string): string {
  return path.join(docDir(docId), ".trash");
}

/** `~/.jdata/studio/logs/` */
export function logsDir(): string {
  return path.join(studioDir(), "logs");
}

/** Cross-platform "reveal in file manager" — macOS uses `open -R`. */
export function revealInFileManager(target: string): void {
  if (process.platform === "darwin") {
    spawn("open", ["-R", target], { stdio: "ignore" });
  } else if (process.platform === "win32") {
    spawn("explorer", [`/select,${target}`], { stdio: "ignore" });
  } else {
    // Linux has no reveal primitive in most shells — open the parent dir.
    spawn("xdg-open", [path.dirname(target)], { stdio: "ignore" });
  }
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
