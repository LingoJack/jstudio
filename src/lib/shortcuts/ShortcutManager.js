import { listen } from "@tauri-apps/api/event";
import { useStore } from "../../store/useStore";
import {
  eventToBinding,
  resolveBinding,
  SHORTCUTS
} from "./keyboardShortcuts";
import { executeShortcutAction } from "../core/commandRegistry";
const FIXED_EDITOR_RESERVED_BINDINGS = /* @__PURE__ */ new Set([
  "mod+b",
  // bold
  "mod+i",
  // italic
  "mod+u",
  // underline
  "mod+shift+s",
  // strikethrough
  "mod+e",
  // inline code (TipTap Code extension default — dead key on macOS)
  "mod+`",
  // inline code (practical primary binding on macOS)
  "mod+z",
  // undo
  "mod+shift+z",
  // redo
  "mod+a"
  // select all
]);
function isEditorReservedBinding(binding, overrides) {
  if (FIXED_EDITOR_RESERVED_BINDINGS.has(binding)) return true;
  return SHORTCUTS.some(
    (def) => def.scope === "editor" && resolveBinding(def.id, overrides) === binding
  );
}
function isEditorFocus() {
  const active = document.activeElement;
  if (!active) return false;
  return active instanceof HTMLElement && (active.isContentEditable || active.closest('[contenteditable="true"], [data-editor-surface]') !== null);
}
class ShortcutManager {
  active = false;
  listenerGeneration = 0;
  unlistenNative = null;
  /**
   * Compute which scopes are currently active based on store state.
   */
  getActiveScopes(store) {
    const scopes = /* @__PURE__ */ new Set();
    scopes.add("global");
    if (store.activeSidebarView === "terminal") {
      scopes.add("terminal");
    }
    return scopes;
  }
  /**
   * Main keydown handler (capture phase).
   */
  handleKeyDown = (e) => {
    if (e.defaultPrevented) return;
    const binding = eventToBinding(e);
    if (!binding) return;
    const store = useStore.getState();
    const overrides = store.keyboardShortcuts;
    if (isEditorFocus() && isEditorReservedBinding(binding, overrides)) {
      return;
    }
    const activeScopes = this.getActiveScopes(store);
    for (const def of SHORTCUTS) {
      const effectiveBinding = resolveBinding(def.id, overrides);
      if (effectiveBinding !== binding) continue;
      if (!activeScopes.has(def.scope)) continue;
      if (def.scope === "editor") continue;
      const actionId = def.actionId ?? def.id;
      if (!executeShortcutAction(actionId, store)) continue;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  };
  /**
   * Start listening for keyboard events.
   */
  start() {
    if (this.active) return;
    this.active = true;
    const generation = ++this.listenerGeneration;
    window.addEventListener("keydown", this.handleKeyDown, true);
    void listen("native-command", (event) => {
      if (!this.active || generation !== this.listenerGeneration) return;
      executeShortcutAction(event.payload, useStore.getState());
    }).then((unlisten) => {
      if (!this.active || generation !== this.listenerGeneration) {
        unlisten();
        return;
      }
      this.unlistenNative = unlisten;
    }).catch((error) => {
      if (this.active && generation === this.listenerGeneration) {
        console.warn("[ShortcutManager] Failed to listen for native commands:", error);
      }
    });
  }
  /**
   * Stop listening for keyboard events.
   */
  stop() {
    if (!this.active) return;
    this.active = false;
    this.listenerGeneration += 1;
    window.removeEventListener("keydown", this.handleKeyDown, true);
    this.unlistenNative?.();
    this.unlistenNative = null;
  }
}
const shortcutManager = new ShortcutManager();
export {
  isEditorReservedBinding,
  shortcutManager
};
