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
 * overlay) does not produce an intersecting native browser Range here, so
 * the overlay naturally stays empty in that case — matching the existing
 * "border-only, no text fill" NodeSelection chrome.
 *
 * Usage
 * -----
 *   const codeRef = useRef<HTMLPreElement>(null);
 *   const selectionOverlayRef = useCodeBlockSelectionOverlay(codeRef);
 *   <pre ref={codeRef}>
 *     <div ref={selectionOverlayRef} className="code-block-selection-overlay" />
 *     <NodeViewContent .../>
 *   </pre>
 */

import { type RefObject, useCallback, useEffect, useRef } from 'react';

export function useCodeBlockSelectionOverlay(
  codeRef: RefObject<HTMLElement | null>,
): RefObject<HTMLDivElement | null> {
  const overlayRef = useRef<HTMLDivElement>(null);

  const update = useCallback(() => {
    const container = codeRef.current;
    const overlay = overlayRef.current;
    const contentEl = container?.querySelector('.hljs') as HTMLElement | null;
    if (!container || !overlay || !contentEl) return;

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
