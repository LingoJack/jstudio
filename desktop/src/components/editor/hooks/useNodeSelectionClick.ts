/**
 * useNodeSelectionClick — click-to-select + drag-to-select for NodeView blocks.
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
 * The fix (click)
 * ---------------
 * Attach the returned handler to the block's root `onMouseDown`. React's
 * synthetic mousedown is delegated at the React root, which sits *above*
 * `view.dom`, so it fires *after* ProseMirror has already handled the native
 * event. We then explicitly `setNodeSelection(getPos())`:
 *   - if ProseMirror already selected the node, this is a no-op on the same node;
 *   - if ProseMirror missed (the glitch), this reliably selects it.
 *
 * The fix (drag)
 * --------------
 * Chromium never starts a native selection drag from a `contentEditable=false`
 * element, so pressing on a block and sliding used to select nothing at all.
 * This handler therefore *drives* the drag itself: once the pointer travels
 * past {@link DRAG_THRESHOLD_PX} it converts the press into a `TextSelection`
 * running from the block's edge to `view.posAtCoords()` and updates it on every
 * mousemove. Dragging down selects from the block's start; dragging up selects
 * to the block's end — either way the block itself is part of the selection.
 *
 * Because the selection is driven manually we must NOT `preventDefault()` the
 * mousedown (that would cancel the gesture) — but without it Chromium turns the
 * drag into a native drag-and-drop of the block, which *moves* the node when
 * released (silently mutating the document). So while a press is active we also
 * swallow `dragstart`. See docs/bug-graveyard.md.
 *
 * Clicks on interactive chrome (buttons, inputs, the resize handle, …) are
 * ignored via `ignoreSelector` so they keep their own behavior.
 */

import { useCallback, useEffect, useRef } from 'react';
import { TextSelection } from '@tiptap/pm/state';
import type { NodeViewProps } from '@tiptap/react';

/** Controls that must keep their own click behavior, never trigger a select. */
const DEFAULT_IGNORE_SELECTOR =
  'button, input, textarea, select, a, .block-resize-handle, [data-drag-handle]';

/**
 * Pointer travel (px) after which a press is treated as a drag rather than a
 * click. Mirrors ProseMirror's own threshold in
 * `LeftMouseDown.updateAllowDefault` so both agree on what a "click" is.
 */
const DRAG_THRESHOLD_PX = 4;

export interface UseNodeSelectionClickOptions {
  /**
   * Extra CSS selector (comma-separated). If the click target matches (via
   * `closest`) either this or the default ignore list, selection is skipped.
   * Use this for editable content (e.g. `.code-block-body`) or chrome that
   * has its own handlers (dropdowns, toolbars).
   */
  ignoreSelector?: string;
  /**
   * When true, a *click* on an already-selected node does nothing. Useful for
   * blocks whose selected state enables inner interaction (e.g. a file
   * preview's iframe / video / PDF controls) that a re-select would steal
   * focus from. Only the click path is skipped — dragging out of an
   * already-selected block still selects.
   */
  skipWhenSelected?: boolean;
  /** Current `selected` flag from NodeViewProps (required for skipWhenSelected). */
  selected?: boolean;
}

/** State of the press currently being tracked (mousedown → mouseup). */
interface PressState {
  /** Pointer position at mousedown — the drag threshold is measured from here. */
  x: number;
  y: number;
  /** Document range of the pressed block node. */
  from: number;
  to: number;
  /** True once the pointer travelled far enough to count as a drag. */
  dragging: boolean;
  /** Last selection we wrote — re-asserted on mouseup (see below). */
  lastFrom: number;
  lastTo: number;
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

  const pressRef = useRef<PressState | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  const detach = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
  }, []);

  // A press can outlive the component (section unmount mid-drag) — make sure
  // the document-level listeners never leak.
  useEffect(() => detach, [detach]);

  return useCallback(
    (e: React.MouseEvent) => {
      if (!editor || editor.isDestroyed) return;
      // Only react to a plain primary-button press — never on right-click,
      // middle-click, or modifier-extended selections.
      if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && target.closest(selectorList)) return;

      const pos = typeof getPos === 'function' ? getPos() : null;
      if (pos == null) return;
      const node = editor.state.doc.nodeAt(pos);
      if (!node) return;

      // NOTE: deliberately no `preventDefault()` here. Cancelling the
      // mousedown would stop the browser from ever turning this gesture into a
      // selection, which is exactly the drag-to-select support we want.
      // Focus theft (the browser moving `document.activeElement` onto the
      // block) is handled on mouseup instead, by focusing `view.dom` — by then
      // we also know whether the gesture was a click or a drag. Without that
      // re-focus, keydown events would target the block and PM's
      // `eventBelongsToView` would reject them, so Backspace/Delete could not
      // delete the selected node.

      const press: PressState = {
        x: e.clientX,
        y: e.clientY,
        from: pos,
        to: pos + node.nodeSize,
        dragging: false,
        lastFrom: pos,
        lastTo: pos + node.nodeSize,
      };
      pressRef.current = press;

      const onMove = (ev: MouseEvent) => {
        const current = pressRef.current;
        if (!current || editor.isDestroyed) return;
        if (!current.dragging) {
          if (
            Math.abs(ev.clientX - current.x) < DRAG_THRESHOLD_PX &&
            Math.abs(ev.clientY - current.y) < DRAG_THRESHOLD_PX
          ) {
            return;
          }
          current.dragging = true;
        }
        // `posAtCoords` returns null as soon as the pointer leaves this
        // section's contenteditable — a cross-section drag is owned by
        // `useCrossSectionSelection`, so we simply stand down.
        const coords = editor.view.posAtCoords({
          left: ev.clientX,
          top: ev.clientY,
        });
        if (!coords) return;

        let from: number;
        let to: number;
        if (coords.pos >= current.to) {
          // Dragged below the block — select from the block's start.
          from = current.from;
          to = coords.pos;
        } else if (coords.pos <= current.from) {
          // Dragged above the block — select to the block's end.
          from = coords.pos;
          to = current.to;
        } else {
          // Still within the block's own range — nothing to extend yet.
          return;
        }
        if (from === to) return;
        if (
          editor.state.selection.from === from &&
          editor.state.selection.to === to
        ) {
          return;
        }
        const selection = TextSelection.create(editor.state.doc, from, to);
        current.lastFrom = selection.from;
        current.lastTo = selection.to;
        editor.view.dispatch(editor.state.tr.setSelection(selection));
      };

      const onUp = (ev: MouseEvent) => {
        const current = pressRef.current;
        pressRef.current = null;
        detach();
        if (!current || editor.isDestroyed) return;

        // A drag that ends outside this section's contenteditable is owned by
        // `useCrossSectionSelection` — touching the selection here would
        // clobber the cross-section range it just painted.
        const releasedInside =
          current.dragging &&
          editor.view.posAtCoords({ left: ev.clientX, top: ev.clientY }) != null;
        if (current.dragging && !releasedInside) return;

        if (!current.dragging) {
          // Only the click path honours `skipWhenSelected`: an already-selected
          // block may hold focus inside its own live preview, and re-selecting
          // (or re-focusing the editor) would yank it away. A drag is still
          // driven, otherwise drag-to-select would be dead on any block the
          // user had just clicked.
          if (skipWhenSelected && selected) return;
          // A genuine click → select the whole block. Re-read the position:
          // `getPos()` is live, whereas `current.from` may be stale.
          const livePos = typeof getPos === 'function' ? getPos() : null;
          if (livePos != null) {
            editor.commands.setNodeSelection(livePos);
          }
        } else {
          // Re-assert the final range: Chromium re-normalises a selection that
          // ends on a block boundary when the mouse gesture is released, which
          // would collapse an upward drag (pointer → block end).
          const max = editor.state.doc.content.size;
          const selection = TextSelection.create(
            editor.state.doc,
            Math.min(current.lastFrom, max),
            Math.min(current.lastTo, max),
          );
          editor.view.dispatch(editor.state.tr.setSelection(selection));
        }

        // Keep keyboard focus on the editor so Backspace/Delete reaches PM.
        if (!editor.view.hasFocus()) {
          editor.view.focus();
        }
      };

      // While the press is active, block native drag-and-drop: Chromium
      // otherwise drags the block (or the selection covering it) and drops a
      // copy elsewhere, mutating the document on a plain click-and-slide.
      const onDragStart = (ev: DragEvent) => {
        ev.preventDefault();
      };

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
      document.addEventListener('dragstart', onDragStart, true);
      detachRef.current = () => {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
        document.removeEventListener('dragstart', onDragStart, true);
      };
    },
    [editor, getPos, selectorList, skipWhenSelected, selected, detach],
  );
}
