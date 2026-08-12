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
 * We deliberately do NOT call `preventDefault()` *globally* — that would
 * cancel the browser's native caret placement and can break inner inputs
 * (see LinkView).  However, for `contentEditable={false}` targets (e.g.
 * FileView's card) we DO preventDefault, because such elements steal DOM
 * focus on mousedown: the browser moves `document.activeElement` onto the
 * card, so subsequent keydown events target the card instead of `view.dom`,
 * and PM's `eventBelongsToView` rejects them (the NodeView's `stopEvent`
 * returns `true` for non-editable targets) — Backspace / Delete then can't
 * delete the selected node.  preventDefault stops this focus theft; we then
 * focus `view.dom` explicitly so keyboard events reach PM.
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
  /**
   * When true, always preventDefault the mousedown — even when the target
   * reports `isContentEditable=true`. Use this for targets that inherit
   * editability from view.dom but have no editable content of their own
   * (e.g. ImageView's <img>): keeping the native default there could let
   * WKWebView's Live Text kick in. The primary Live Text defence is now
   * CSS `user-select: none` on the <img> (see ImageView.tsx); this flag is
   * a belt-and-suspenders backstop for any edge cases CSS alone misses.
   */
  forcePreventDefault?: boolean;
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
  const { ignoreSelector, skipWhenSelected = false, selected = false, forcePreventDefault = false } = options;

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

      // For contentEditable={false} targets (e.g. FileView's card,
      // DiagramBlockView's overlay) preventDefault the mousedown to stop the
      // browser from moving DOM focus onto the clicked element.  Without this,
      // clicking the card leaves `document.activeElement` on the card, so
      // subsequent keydown events target the card and PM's eventBelongsToView
      // rejects them — Backspace / Delete never reaches PM and the selected
      // node can't be deleted via keyboard.  preventDefault must run inside
      // the mousedown handler (before the default focus action), which is why
      // we do it here rather than in a separate click handler.
      //
      // Editable targets (e.g. LinkView's inner inputs) skip preventDefault
      // so the browser's native caret placement is preserved — unless the
      // caller passes forcePreventDefault (ImageView's <img>: it only
      // inherits editability from view.dom, and its native default action is
      // WKWebView Live Text selection, not caret placement).
      const isEditableTarget =
        target instanceof HTMLElement ? target.isContentEditable : false;
      if (forcePreventDefault || !isEditableTarget) {
        e.preventDefault();
      }

      editor.commands.setNodeSelection(pos);

      // Ensure view.dom (not the clicked element) holds focus.  The
      // preventDefault above stopped the browser from stealing focus, so
      // this call actually takes effect.
      if (!editor.view.hasFocus()) {
        editor.view.focus();
      }
    },
    [editor, getPos, selectorList, skipWhenSelected, selected, forcePreventDefault],
  );
}
