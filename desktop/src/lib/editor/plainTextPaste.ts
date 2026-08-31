/**
 * Module-level flag for "paste plain text" mode (Cmd+Shift+V).
 *
 * Two trigger paths set the flag:
 *   - **macOS native menu**: The Rust `on_menu_event` handler (for
 *     `app.pastePlainText`) calls `window.__setPlainTextPaste()` via `eval`,
 *     then forwards the native `paste:` action. The `eval` runs before the
 *     paste event is dispatched, so the flag is set in time.
 *   - **Non-macOS fallback**: The editor's `handleKeyDown` detects
 *     Cmd+Shift+V, calls `setPlainTextPaste()`, and lets the browser fire the
 *     native paste event.
 *
 * `ClipboardEvent` has no modifier-key state, so we cannot detect Shift
 * inside the paste handler itself -- the flag must be set externally.
 *
 * Two paste handlers run in sequence (ProseMirror plugin first, then
 * editorProps.handlePaste):
 *   1. The PasteMarkdown plugin calls {@link isPlainTextPaste} (peek) and,
 *      if true, returns `false` so it does NOT parse Markdown.
 *   2. The main paste handler in `editorPasteDrop.ts` calls
 *      {@link consumePlainTextPaste} (read + reset) and inserts only the raw
 *      `text/plain` content.
 */

let _active = false;

/** Mark the next paste as plain-text-only. */
export function setPlainTextPaste(): void {
  _active = true;
}

/** Peek without resetting. Earlier paste handlers use this to defer. */
export function isPlainTextPaste(): boolean {
  return _active;
}

/** Read AND reset. The final paste handler uses this. */
export function consumePlainTextPaste(): boolean {
  const v = _active;
  _active = false;
  return v;
}

// Expose for the native macOS menu handler. When the user presses Cmd+Shift+V,
// Rust evals `window.__setPlainTextPaste()` before forwarding the native
// `paste:` action to the webview.
if (typeof window !== "undefined") {
  (window as unknown as { __setPlainTextPaste: typeof setPlainTextPaste }).__setPlainTextPaste =
    setPlainTextPaste;
}
