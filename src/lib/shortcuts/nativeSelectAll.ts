import type { KeyboardEvent } from 'react';

/**
 * handleNativeSelectAll — explicit Cmd/Ctrl+A handling for plain
 * `<input>`/`<textarea>` elements.
 *
 * Historical context: the app's custom macOS menu previously omitted Edit >
 * Select All so that Cmd+A reached the editor as a plain DOM keydown. Plain
 * inputs lost the OS-driven select-all as a side effect, so each input called
 * this helper in its `onKeyDown` to compensate.
 *
 * Current architecture: the menu now includes a custom "Select All" MenuItem
 * (Cmd+A) that forwards via `native-command` → `commandRegistry`
 * ("app.selectAll"), which checks `document.activeElement` and calls
 * `el.select()` for inputs. The keydown path no longer fires for Cmd+A (the
 * menu item intercepts it at `performKeyEquivalent:` time), so these calls are
 * now legacy fallbacks — kept for safety in case the menu forwarding is ever
 * bypassed.
 *
 * @returns true if the event was handled (Cmd/Ctrl+A) — caller should
 *          `return` immediately after.
 */
export function handleNativeSelectAll(e: KeyboardEvent<Element>): boolean {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    // `select()` only exists on input/textarea; guard so the handler can be
    // attached to any element (e.g. a palette root) without a type error.
    const target = e.currentTarget as Partial<
      HTMLInputElement & HTMLTextAreaElement
    >;
    target.select?.();
    return true;
  }
  return false;
}
