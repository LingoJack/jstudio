/**
 * GapCursorClickFix - improves gap cursor triggering between isolating/atom
 * block nodes (e.g. collapsibles).
 *
 * Problem:
 *   ProseMirror's gap cursor plugin has a `handleClick` that bails out when
 *   `posAtCoords` resolves the click as being "inside" a selectable node.
 *   For clicks in the margin/gap between two collapsibles, `posAtCoords`
 *   often resolves `inside` to the lower collapsible (which is selectable),
 *   so the gap cursor is never created.  The browser then places the caret
 *   inside the lower block instead.
 *
 *   Only clicks at the far-left edge work, because there `posAtCoords`
 *   resolves `inside = -1` and the bail-out guard does not fire.
 *
 * Fix:
 *   Intercept `mousedown` events that land directly on the editor's content
 *   DOM (i.e. in margin/gap areas between blocks, not on any node view).
 *   Check whether a valid gap cursor position exists (trying both the
 *   resolved text position and the "inside" node position).  If so, create
 *   the gap cursor immediately and prevent the browser's default behaviour.
 *
 *   Handling `mousedown` (rather than `handleClick`) is intentional: it runs
 *   *before* ProseMirror's internal mouse handling, so the browser never
 *   gets a chance to focus the lower block's title input.
 */

import { Extension } from '@tiptap/core';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export const GapCursorClickFix = Extension.create({
  name: 'gapCursorClickFix',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('gapCursorClickFix'),
        props: {
          handleDOMEvents: {
            mousedown: (view: EditorView, event: MouseEvent) => {
              // Skip in read-only mode
              if (!view.editable) return false;

              // Only handle plain left-clicks (no modifier keys)
              if (
                event.button !== 0 ||
                event.shiftKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey
              ) {
                return false;
              }

              // Only intercept clicks that land directly on the editor's
              // content DOM — i.e. clicks in margin/gap areas that are not
              // on any node view element.
              const el = document.elementFromPoint(
                event.clientX,
                event.clientY,
              );
              if (el !== view.dom && el !== view.contentDOM) {
                return false;
              }

              // Resolve the click to a document position
              const clickPos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });
              if (!clickPos) return false;

              // Attempt 1: the resolved text position itself
              const $pos = view.state.doc.resolve(clickPos.pos);
              if (GapCursor.valid($pos)) {
                view.dispatch(
                  view.state.tr.setSelection(new GapCursor($pos)),
                );
                view.focus();
                event.preventDefault();
                return true;
              }

              // Attempt 2: the "inside" position — when the click is closest
              // to the start of a node, `inside` holds that node's position.
              // This is the position *between* the node and its predecessor,
              // which is the actual gap cursor location.
              if (clickPos.inside > -1) {
                const $insidePos = view.state.doc.resolve(clickPos.inside);
                if (GapCursor.valid($insidePos)) {
                  view.dispatch(
                    view.state.tr.setSelection(new GapCursor($insidePos)),
                  );
                  view.focus();
                  event.preventDefault();
                  return true;
                }
              }

              return false;
            },
          },
        },
      }),
    ];
  },
});
