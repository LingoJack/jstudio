/**
 * Resolve a keyboard event target to its associated section Editor instance.
 *
 * Walks up the DOM from `target` to find the nearest element with a
 * `data-section-id` attribute, then looks up the corresponding Editor in the
 * provided map. Returns `null` if the target is inside a form control, the
 * editor is destroyed, or the DOM no longer matches.
 */

import type { Editor } from '@tiptap/react';

export function editorForKeyboardTarget(
  target: EventTarget | null,
  editors: ReadonlyMap<string, Editor>,
): Editor | null {
  const node = target instanceof Node ? target : null;
  const element = node instanceof Element ? node : node?.parentElement;
  if (!element) return null;
  if (element.closest('input, textarea, select, button, [contenteditable="false"]')) {
    return null;
  }

  const editorDom = element.closest<HTMLElement>('[data-section-id]');
  const sectionId = editorDom?.dataset.sectionId;
  if (!editorDom || !sectionId) return null;

  const editor = editors.get(sectionId);
  if (!editor || editor.isDestroyed || editor.view.dom !== editorDom) return null;
  return editorDom.contains(node) ? editor : null;
}
