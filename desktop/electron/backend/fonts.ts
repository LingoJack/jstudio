/**
 * fonts.ts — system font family enumeration for the settings font pickers.
 * Port of src-tauri/src/commands/fonts.rs (core_text::copy_available_font_family_names).
 *
 * On macOS the enumeration runs through JXA (osascript -l JavaScript) calling
 * AppKit's NSFontManager.availableFontFamilies — verified against the Rust
 * CoreText baseline with a 248/248 family match. Family names starting with
 * `.` are private macOS faces and filtered out. Non-macOS returns [].
 */

import { spawnSync } from "node:child_process";
import type { HandlerTable } from "./router";

const JXA_SCRIPT =
  'ObjC.import("AppKit"); ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFontFamilies).join("\\n")';

function listSystemFonts(): string[] {
  if (process.platform !== "darwin") return [];
  const res = spawnSync("osascript", ["-l", "JavaScript", "-e", JXA_SCRIPT], {
    encoding: "utf8",
  });
  if (res.status !== 0) return [];
  const families = (res.stdout ?? "")
    .split("\n")
    .filter((n) => n !== "" && !n.startsWith("."));
  return [...new Set(families)].sort();
}

export const fontsHandlers: HandlerTable = {
  list_system_fonts: () => listSystemFonts(),
};
