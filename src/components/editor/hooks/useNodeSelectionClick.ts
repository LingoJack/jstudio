/**
 * useNodeSelectionClick — reliable "click-to-select" for NodeView blocks.
 *
 * Why this exists
 * ---------------
 * A block NodeView shows its selection ring when ProseMirror holds a
 * `NodeSelection` on it (`NodeViewProps.selected === true`). Turning a click
 * into that NodeSelection is normally left to ProseMirror's own mousedown
 * handler, which relies on `view.posAtCoords()` → the browser's
 * `caretRangeFromPoint` / `caretPositionFromPoint`.
 *
 * Under Tauri's WKWebView (macOS) those APIs are *unreliable* for
 * `contentEditable=false` atom elements (images, file cards, code-block
 * chrome): depending on the exact pixel / render timing the hit point is
 * occasionally resolved to an adjacent position, so ProseMirror drops a caret
 * next to the node instead of selecting it. The result is the well-known
 * "sometimes a click doesn't select the block" glitch.
 *
 * The fix
 * -------
 * Attach the returned handler to the block's root `onMouseDown`. React's
 * synthetic mousedown is delegated at the React root, which sits *above*
 * `view.dom`, so it fires *after* ProseMirror has already handled the native
 * event. We then explicitly `setNodeSelection(getPos())`:
 *   - if ProseMirror already selected the node, this is a no-op on the same node;
 *   - if ProseMirror missed (the glitch), this reliably selects it.
 *
 * We deliberately do NOT call `preventDefault()` (that would cancel the
 * browser's native caret placement and can break inner inputs — see LinkView).
 *
 * Clicks on interactive chrome (buttons, inputs, the resize handle, …) are
 * ignored via `ignoreSelector` so they keep their own behavior.
 */

import { useCallback } from 'react';
import type { NodeViewProps } from '@tiptap/react';

/** Controls that must keep their own click behavior, never trigger a select. */
const DEFAULT_IGNORE_SELECTOR =
  'button, input, textarea, select, a, .block-resize-handle';

export interface UseNodeSelectionClickOptions {
  /**
   * Extra CSS selector (comma-separated). If the click target matches (via
   * `closest`) either this or the default ignore list, selection is skipped.
   * Use this for editable content (e.g. `.code-block-body`) or chrome that
   * has its own handlers (dropdowns, toolbars).
   */
  ignoreSelector?: string;
  /**
   * When true, do nothing if the node is already selected. Useful for blocks
   * whose selected state enables inner interaction (e.g. a file preview's
   * iframe / video / PDF controls) that a re-select would steal focus from.
   */
  skipWhenSelected?: boolean;
  /** Current `selected` flag from NodeViewProps (required for skipWhenSelected). */
  selected?: boolean;
}

/**
 * @param editor   The TipTap editor (from NodeViewProps).
 * @param getPos   NodeViewProps.getPos.
 * @param options  See {@link UseNodeSelectionClickOptions}.
 * @returns A `mousedown` handler to spread onto the block's root element.
 */
export function useNodeSelectionClick(
  editor: NodeViewProps['editor'] | null,
  getPos: NodeViewProps['getPos'],
  options: UseNodeSelectionClickOptions = {},
): (e: React.MouseEvent) => void {
  const { ignoreSelector, skipWhenSelected = false, selected = false } = options;

  const selectorList = ignoreSelector
    ? `${DEFAULT_IGNORE_SELECTOR}, ${ignoreSelector}`
    : DEFAULT_IGNORE_SELECTOR;

  return useCallback(
    (e: React.MouseEvent) => {
      if (!editor) return;
      // Only react to a plain primary-button click — never on right-click,
      // middle-click, or modifier-extended selections.
      if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (skipWhenSelected && selected) return;

      const target = e.target as HTMLElement | null;
      if (target && target.closest(selectorList)) return;

      const pos = typeof getPos === 'function' ? getPos() : null;
      if (pos == null) return;

      editor.commands.setNodeSelection(pos);
    },
    [editor, getPos, selectorList, skipWhenSelected, selected],
  );
}
