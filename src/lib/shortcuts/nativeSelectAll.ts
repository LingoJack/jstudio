import type { KeyboardEvent } from 'react';

/**
 * handleNativeSelectAll — explicit Cmd/Ctrl+A handling for plain
 * `<input>`/`<textarea>` elements.
 *
 * Why this exists: the app's custom macOS menu (see `build_app_menu` in
 * `src-tauri/src/lib.rs`) deliberately omits Edit > Select All so that
 * Cmd+A reaches the ProseMirror editor as a plain DOM keydown instead of
 * being swallowed by the native menu key-equivalent (see
 * `docs/bug-graveyard.md` #001 for the same class of WKWebView quirk).
 *
 * Side effect: plain `<input>`/`<textarea>` elements outside the editor no
 * longer receive the OS-driven "select all" action either, since that
 * action was tied to the very same menu item. Call this at the top of an
 * input's `onKeyDown` to restore select-all explicitly.
 *
 * Usage:
 *   const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
 *     if (handleNativeSelectAll(e)) return;
 *     ...
 *   };
 *
 * @returns true if the event was handled (Cmd/Ctrl+A) — caller should
 *          `return` immediately after.
 */
export function handleNativeSelectAll(
  e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
): boolean {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    e.currentTarget.select();
    return true;
  }
  return false;
}
