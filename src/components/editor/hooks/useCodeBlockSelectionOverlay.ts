/**
 * useCodeBlockSelectionOverlay — paints a text-selection highlight that hugs
 * the actual rendered glyph width, instead of the browser's native
 * `::selection` background.
 *
 * Why this exists
 * ----------------
 * The code block's content (`NodeViewContent`) uses `white-space: pre-wrap` +
 * `overflow-wrap: anywhere` so long lines wrap instead of requiring a
 * horizontal scrollbar (see CodeBlockView.tsx). Chromium/WebKit's native
 * `::selection` rendering has an inherent quirk for `pre-wrap` text: as long
 * as the container *can* wrap, every selected line except the very last one
 * gets its highlight background stretched to the full container width —
 * even a short line that never actually wraps — as soon as the selection
 * continues onto a following line. Switching to `white-space: pre` avoids
 * this, but reintroduces horizontal scrolling, which is the exact thing the
 * wrapping design was meant to avoid.
 *
 * `Range.getClientRects()`, however, already returns tight rects that match
 * the real rendered text width for each visual line (verified: it does NOT
 * exhibit the "stretch to container edge" quirk). So instead of relying on
 * native `::selection` (disabled for code blocks — see `vscode-theme.css`),
 * this hook listens for `selectionchange`, and — when the current selection
 * intersects this code block's text — draws one small `<div>` per client
 * rect onto an absolutely-positioned overlay layer.
 *
 * A real `NodeSelection` on this node (e.g. clicking the HTML-preview
 * overlay, or triple-clicking the block — see `handleTripleClickOn` in
 * codeBlockExtension.tsx) is intended to show ONLY the existing
 * "border-only, no text fill" NodeSelection chrome (`.is-selected` in
 * vscode-theme.css). It does NOT, however, produce a *collapsed* native
 * browser Selection: ProseMirror still syncs a native DOM Range spanning
 * the whole node's content for a NodeSelection (needed for native
 * copy/cut). Left unchecked, that Range intersects `contentEl` here and
 * gets painted as one glyph-accurate rect per line — which, since most
 * lines are close to full width, visually reproduces the exact "solid
 * block" native-::selection look this overlay was built to avoid, just for
 * a NodeSelection instead of the old ::selection quirk. `isNodeSelected`
 * lets the caller (CodeBlockView) report that state so we can bail out and
 * leave the border-only chrome as the only selected-state indicator.
 *
 * Usage
 * -----
 *   const codeRef = useRef<HTMLPreElement>(null);
 *   const selectionOverlayRef = useCodeBlockSelectionOverlay(codeRef, () => selected);
 *   <pre ref={codeRef}>
 *     <div ref={selectionOverlayRef} className="code-block-selection-overlay" />
 *     <NodeViewContent .../>
 *   </pre>
 */

import { type RefObject, useCallback, useEffect, useRef } from 'react';

export function useCodeBlockSelectionOverlay(
  codeRef: RefObject<HTMLElement | null>,
  /** Live check: true when the block is currently NodeSelection-selected
   *  (e.g. triple-click). Read via a ref so `update()` (invoked from the
   *  `selectionchange` listener) always sees the current value regardless
   *  of React's render/commit timing. */
  isNodeSelected?: () => boolean,
): RefObject<HTMLDivElement | null> {
  const overlayRef = useRef<HTMLDivElement>(null);
  const isNodeSelectedRef = useRef(isNodeSelected);
  isNodeSelectedRef.current = isNodeSelected;

  const update = useCallback(() => {
    const container = codeRef.current;
    const overlay = overlayRef.current;
    const contentEl = container?.querySelector('.hljs') as HTMLElement | null;
    if (!container || !overlay || !contentEl) return;

    // A `.cross-section-selected` decoration is already painting this
    // selection (within-section mirror or cross-section selection — see
    // sectionHighlightSelection.ts); painting our rects on top would double
    // the highlight.
    if (container.closest('.cross-section-anchor-hide-selection')) {
      overlay.replaceChildren();
      return;
    }

    // Whole-block NodeSelection → border-only chrome, no text-fill overlay.
    if (isNodeSelectedRef.current?.()) {
      overlay.replaceChildren();
      return;
    }

    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      overlay.replaceChildren();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!range.intersectsNode(contentEl)) {
      overlay.replaceChildren();
      return;
    }

    // The native selection may extend in from a paragraph before/after this
    // code block — clamp it to this block's text before measuring rects.
    const clamped = range.cloneRange();
    const bounds = document.createRange();
    bounds.selectNodeContents(contentEl);
    if (clamped.compareBoundaryPoints(Range.START_TO_START, bounds) < 0) {
      clamped.setStart(bounds.startContainer, bounds.startOffset);
    }
    if (clamped.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) {
      clamped.setEnd(bounds.endContainer, bounds.endOffset);
    }

    const containerRect = container.getBoundingClientRect();
    const frag = document.createDocumentFragment();
    for (const r of clamped.getClientRects()) {
      if (r.width <= 0 || r.height <= 0) continue;
      const bar = document.createElement('div');
      bar.className = 'code-block-selection-rect';
      bar.style.left = `${r.left - containerRect.left}px`;
      bar.style.top = `${r.top - containerRect.top}px`;
      bar.style.width = `${r.width}px`;
      bar.style.height = `${r.height}px`;
      frag.appendChild(bar);
    }
    overlay.replaceChildren(frag);
  }, [codeRef]);

  useEffect(() => {
    document.addEventListener('selectionchange', update);
    // Dragging the resize handle (useNodeResize) changes line-wrap points,
    // so an active selection's highlight rects need to be recomputed too.
    const ro = new ResizeObserver(update);
    if (codeRef.current) ro.observe(codeRef.current);
    return () => {
      document.removeEventListener('selectionchange', update);
      ro.disconnect();
    };
  }, [update, codeRef]);

  return overlayRef;
}
