/**
 * Code-block line boundary helpers.
 *
 * When the caret is inside a code block, Cmd+ArrowLeft/Right should jump to
 * the start/end of the *visual* line (wrapping included), not the entire
 * code block text. These two functions work together:
 *
 * 1. `logicalCodeLineBoundary` - fast `\n`-delimited boundary (fallback)
 * 2. `visualCodeLineBoundary`  - uses native `Selection.modify('lineboundary')`
 *    for accurate wrapping-aware boundaries, with full save/restore of the
 *    selection so the user sees no flicker.
 */

import type { Editor } from '@tiptap/react';

/**
 * Find the `\n`-delimited line boundary in `text` relative to `offset`.
 * `toStart=true` finds the line start, `false` finds the line end.
 */
export function logicalCodeLineBoundary(
  text: string,
  offset: number,
  toStart: boolean,
): number {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  if (toStart) {
    const previousNewline =
      safeOffset > 0 ? text.lastIndexOf('\n', safeOffset - 1) : -1;
    return previousNewline === -1 ? 0 : previousNewline + 1;
  }
  const nextNewline = text.indexOf('\n', safeOffset);
  return nextNewline === -1 ? text.length : nextNewline;
}

/**
 * Use the native `Selection.modify('move', dir, 'lineboundary')` to find the
 * visual line boundary (respects CSS wrapping). Saves and restores the
 * selection so the user sees no flicker.
 *
 * Returns the ProseMirror position of the boundary, or `null` if the native
 * API is unavailable or the result falls outside the code block's range.
 */
export function visualCodeLineBoundary(
  editor: Editor,
  head: number,
  blockStart: number,
  blockEnd: number,
  toStart: boolean,
): number | null {
  const { view } = editor;
  const nativeSelection = view.dom.ownerDocument.getSelection();
  if (
    !nativeSelection ||
    typeof nativeSelection.modify !== 'function' ||
    typeof nativeSelection.setBaseAndExtent !== 'function' ||
    !nativeSelection.anchorNode ||
    !nativeSelection.focusNode ||
    !view.dom.contains(nativeSelection.focusNode)
  ) {
    return null;
  }

  const saved = {
    anchorNode: nativeSelection.anchorNode,
    anchorOffset: nativeSelection.anchorOffset,
    focusNode: nativeSelection.focusNode,
    focusOffset: nativeSelection.focusOffset,
    range: nativeSelection.rangeCount > 0
      ? nativeSelection.getRangeAt(0).cloneRange()
      : null,
  };

  try {
    const nativeHead = view.posAtDOM(saved.focusNode, saved.focusOffset);
    if (nativeHead !== head) return null;

    nativeSelection.collapse(saved.focusNode, saved.focusOffset);
    nativeSelection.modify('move', toStart ? 'left' : 'right', 'lineboundary');
    const focusNode = nativeSelection.focusNode;
    if (!focusNode || !view.dom.contains(focusNode)) return null;

    const mapped = view.posAtDOM(
      focusNode,
      nativeSelection.focusOffset,
      toStart ? -1 : 1,
    );
    return mapped >= blockStart && mapped <= blockEnd ? mapped : null;
  } catch {
    return null;
  } finally {
    try {
      nativeSelection.setBaseAndExtent(
        saved.anchorNode,
        saved.anchorOffset,
        saved.focusNode,
        saved.focusOffset,
      );
    } catch {
      nativeSelection.removeAllRanges();
      if (saved.range) nativeSelection.addRange(saved.range);
    }
  }
}
