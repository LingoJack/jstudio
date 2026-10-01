/**
 * kv.ts — in-memory payload caches keyed by window label.
 *
 * Port of src-tauri/src/commands/detach.rs: three independent caches
 * (preview data, diagram updates, terminal detach payloads) used to move
 * large payloads from a parent window to a freshly opened child window
 * without URL-length limits or cross-window event permissions.
 *
 * `get_*` is a DESTRUCTIVE read — the child window consumes the payload
 * once on startup (the renderer's fetch-dedupe relies on this).
 */

import type { HandlerTable } from "./router";
import { takeString, takeRaw } from "./params";

function makeCache() {
  const map = new Map<string, unknown>();
  return {
    set: (label: string, payload: unknown) => void map.set(label, payload),
    get: (label: string) => {
      const v = map.get(label);
      map.delete(label);
      return v ?? null;
    },
    clear: (label: string) => void map.delete(label),
  };
}

const previewData = makeCache();
const diagramUpdate = makeCache();
const terminalDetach = makeCache();

export const kvHandlers: HandlerTable = {
  set_preview_data: (p) => (previewData.set(takeString(p, "label"), takeRaw(p, "data")), null),
  get_preview_data: (p) => previewData.get(takeString(p, "label")),
  clear_preview_data: (p) => (previewData.clear(takeString(p, "label")), null),

  set_diagram_update: (p) => (diagramUpdate.set(takeString(p, "label"), takeRaw(p, "data")), null),
  get_diagram_update: (p) => diagramUpdate.get(takeString(p, "label")),
  clear_diagram_update: (p) => (diagramUpdate.clear(takeString(p, "label")), null),

  set_terminal_detach_payload: (p) =>
    (terminalDetach.set(takeString(p, "label"), takeRaw(p, "payload")), null),
  get_terminal_detach_payload: (p) => terminalDetach.get(takeString(p, "label")),
  clear_terminal_detach_payload: (p) => (terminalDetach.clear(takeString(p, "label")), null),
};
