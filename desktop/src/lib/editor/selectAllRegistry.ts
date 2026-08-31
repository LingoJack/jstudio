/**
 * Select-all handler registry — module-level singleton.
 *
 * The macOS "Select All" menu item (Cmd+A) is forwarded to the frontend via
 * `native-command` → `commandRegistry.executeShortcutAction("app.selectAll")`.
 * The action checks `document.activeElement` for inputs/textareas, then looks
 * here for the editor's custom select-all handler (code-block scoping +
 * cross-section selection), then falls back to browser content / native
 * select-all.
 *
 * `DocumentPanel` registers its handler on mount and clears it on
 * unmount. Pattern mirrors `focusedEditorRegistry.ts`.
 */

let handler: (() => void) | null = null;

/** Register the editor's select-all handler (called from DocumentPanel). */
export function registerSelectAllHandler(fn: (() => void) | null): void {
  handler = fn;
}

/** Return the registered select-all handler, if any. */
export function getSelectAllHandler(): (() => void) | null {
  return handler;
}
