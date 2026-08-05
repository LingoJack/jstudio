/**
 * GapCursorClickFix - improves gap cursor triggering between isolating/atom
 * block nodes (e.g. collapsibles, code blocks).
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
 *   The same issue occurs for code blocks nested inside a collapsible:
 *   clicks in the gap between two code blocks land on the collapsible's
 *   `contentDOM` (not `view.dom`), and `posAtCoords` resolves `inside` to
 *   one of the code blocks (which is selectable).
 *
 * Fix:
 *   Intercept `mousedown` events that land on a block container element
 *   (either `view.dom` for top-level gaps, or a node-view's `contentDOM`
 *   for gaps inside a container like a collapsible).  Check whether a valid
 *   gap cursor position exists (trying both the resolved text position and
 *   the "inside" node position).  If so, create the gap cursor immediately
 *   and prevent the browser's default behaviour.
 *
 *   Handling `mousedown` (rather than `handleClick`) is intentional: it runs
 *   *before* ProseMirror's internal mouse handling, so the browser never
 *   gets a chance to focus the lower block's title input.
 */

import { Extension } from '@tiptap/core';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

// `GapCursor.valid` exists at runtime but is missing from the
// prosemirror-gapcursor TypeScript type definitions.
const GapCursorValid = (
  GapCursor as unknown as {
    valid: ($pos: ReturnType<EditorView['state']['doc']['resolve']>) => boolean;
  }
).valid;

/**
 * Checks whether a DOM element is a "block container" - i.e. an element
 * that directly holds block-level children and therefore represents a gap
 * area when the element itself is returned by `elementFromPoint`.
 *
 * This includes:
 *   - `view.dom` (the editor's content element; gaps between top-level blocks)
 *   - A node-view's `contentDOM` (gaps between blocks nested inside a
 *     container such as a collapsible)
 *
 * Clicks on a node-view's chrome (header, buttons, figure border, etc.)
 * never reach this check because ProseMirror's `eventBelongsToView` /
 * TipTap's `stopEvent` filters them out earlier.  Likewise, clicks inside
 * a text block's content element are not block containers and will be
 * rejected here.
 */
function isContentContainer(
  view: EditorView,
  el: Element | null,
): boolean {
  if (!el || !view.dom.contains(el)) return false;
  if (el === view.dom) return true;

  // Walk up from `el` to `view.dom`.  If we find a ViewDesc whose
  // `contentDOM` is `el`, then `el` is a node-view's content container.
  // However, we only care about containers that hold *block-level*
  // children (e.g. a collapsible's content area).  Textblock contentDOMs
  // (e.g. a code block's `<code>` element) hold inline text and must be
  // excluded — a click there is inside editable content, not a gap.
  for (
    let node: Element | null = el;
    node && node !== view.dom;
    node = node.parentElement
  ) {
    const desc = (
      node as unknown as {
        pmViewDesc?: {
          contentDOM?: Element | null;
          node?: { type: { isTextblock: boolean } };
        };
      }
    ).pmViewDesc;
    if (desc && desc.contentDOM === el) {
      // Exclude textblocks (paragraphs, code blocks, etc.) — their
      // contentDOM holds inline text, not block-level children.
      if (desc.node?.type.isTextblock) return false;
      return true;
    }
  }
  return false;
}

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

              // Only intercept clicks in margin/gap areas between blocks.
              // These resolve to a block container element - either
              // `view.dom` (top-level gaps) or a node-view's contentDOM
              // (e.g. gaps between code blocks nested inside a collapsible).
              const el = document.elementFromPoint(
                event.clientX,
                event.clientY,
              );
              if (!isContentContainer(view, el)) {
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
              if (GapCursorValid($pos)) {
                view.dispatch(
                  view.state.tr.setSelection(new GapCursor($pos)),
                );
                view.focus();
                event.preventDefault();
                return true;
              }

              // Attempt 2: the "inside" position - when the click is closest
              // to the start of a node, `inside` holds that node's position.
              // This is the position *between* the node and its predecessor,
              // which is the actual gap cursor location.
              //
              // Guard: skip when the click landed inside a text block's
              // content (`$pos.parent.inlineContent`). In that case the user
              // is clicking inside editable text, not in a gap area, so
              // creating a gap cursor would be wrong.
              if (clickPos.inside > -1 && !$pos.parent.inlineContent) {
                const $insidePos = view.state.doc.resolve(clickPos.inside);
                if (GapCursorValid($insidePos)) {
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
