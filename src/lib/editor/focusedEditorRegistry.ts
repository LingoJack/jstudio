/**
 * Focused TipTap editor registry — module-level singleton.
 *
 * The unified shortcut system dispatches actions through `commandRegistry`
 * without any DOM-event target context. Native menu events (e.g. macOS
 * Format > Inline Code bound to Cmd+`) arrive with no DOM target at all,
 * so `editorForKeyboardTarget(document.activeElement)` is unreliable when
 * the focus has already shifted to the menu bar.
 *
 * `SectionedEditorPanel` records the most recently focused section editor
 * here on every editor 'focus' event and clears it on 'destroy'. Any
 * module (commandRegistry, ShortcutManager, future palette actions) can
 * then read the live focused editor via `getFocusedEditor()`.
 *
 * This is intentionally a tiny module-scoped singleton rather than a Zustand
 * slice: the focused editor is an ephemeral runtime reference, not persisted
 * state, and subscribing to it via the store would cause unnecessary
 * re-renders of components that read store state.
 */

import type { Editor } from '@tiptap/react';

let focusedEditor: Editor | null = null;

/** Record the editor that currently holds focus. Called from editor 'focus'. */
export function setFocusedEditor(editor: Editor | null): void {
  focusedEditor = editor;
}

/** Clear the recorded editor if it matches (called on editor 'destroy'). */
export function clearFocusedEditor(editor: Editor): void {
  if (focusedEditor === editor) {
    focusedEditor = null;
  }
}

/** Return the currently focused editor, if any. */
export function getFocusedEditor(): Editor | null {
  return focusedEditor;
}
