/**
 * misc.ts — build metadata handler.
 *
 * Port of src-tauri/src/commands/debug.rs (BuildInfo half). The commit hash
 * is written next to backend.cjs by scripts/write-build-info.mjs at bundle
 * time (the Rust side baked env!("JSTUDIO_BUILD_COMMIT") at compile time —
 * same idea); `is_dev` arrives from main as an env var because only the
 * main process knows `app.isPackaged`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { HandlerTable } from "./router";

function bakedCommit(): string {
  try {
    const info = JSON.parse(
      fs.readFileSync(path.join(__dirname, "build-info.json"), "utf8"),
    ) as { commit?: unknown };
    return typeof info.commit === "string" ? info.commit : "unknown";
  } catch {
    return "unknown";
  }
}

export const miscHandlers: HandlerTable = {
  get_build_info: () => ({
    commit: bakedCommit(),
    is_dev: process.env.JSTUDIO_IS_DEV === "1",
  }),
};
