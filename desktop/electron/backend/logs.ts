/**
 * logs.ts — runtime log file handlers (~/.jdata/studio/logs/).
 *
 * Port of src-tauri/src/commands/debug.rs (log half). The frontend logger
 * pre-formats lines (timestamp/level/source) and flushes them here; the
 * backend writes verbatim + newline. Date bucket is UTC by design (same as
 * the Rust side) — it only groups files, per-line timestamps come from JS.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { HandlerTable } from "./router";
import { takeString } from "./params";
import { ensureDir, logsDir, revealInFileManager } from "./paths";

/** `logs/app-YYYY-MM-DD.log` — UTC date bucket, same rule as the Rust side. */
export function todayLogPath(): string {
  const [y, m, d] = new Date().toISOString().slice(0, 10).split("-");
  return path.join(logsDir(), `app-${y}-${m}-${d}.log`);
}

export const logsHandlers: HandlerTable = {
  append_log_line: (p) => {
    const file = todayLogPath();
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, takeString(p, "line") + "\n");
    return null;
  },

  get_log_file_path: () => todayLogPath(),

  open_logs_dir: () => {
    ensureDir(logsDir());
    revealInFileManager(logsDir());
    return null;
  },

  clear_logs: () => {
    const dir = logsDir();
    if (!fs.existsSync(dir)) return 0;
    let removed = 0;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        if (fs.statSync(full).isFile()) {
          fs.unlinkSync(full);
          removed += 1;
        }
      } catch {
        // Best effort — same as the Rust side's is_ok() filter.
      }
    }
    return removed;
  },
};
