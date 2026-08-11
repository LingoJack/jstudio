import { useCallback, useEffect, useRef } from "react";
function useCodeBlockSelectionOverlay(codeRef, isNodeSelected) {
  const overlayRef = useRef(null);
  const isNodeSelectedRef = useRef(isNodeSelected);
  isNodeSelectedRef.current = isNodeSelected;
  const update = useCallback(() => {
    const container = codeRef.current;
    const overlay = overlayRef.current;
    const contentEl = container?.querySelector(".hljs");
    if (!container || !overlay || !contentEl) return;
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
      const bar = document.createElement("div");
      bar.className = "code-block-selection-rect";
      bar.style.left = `${r.left - containerRect.left}px`;
      bar.style.top = `${r.top - containerRect.top}px`;
      bar.style.width = `${r.width}px`;
      bar.style.height = `${r.height}px`;
      frag.appendChild(bar);
    }
    overlay.replaceChildren(frag);
  }, [codeRef]);
  useEffect(() => {
    document.addEventListener("selectionchange", update);
    const ro = new ResizeObserver(update);
    if (codeRef.current) ro.observe(codeRef.current);
    return () => {
      document.removeEventListener("selectionchange", update);
      ro.disconnect();
    };
  }, [update, codeRef]);
  return overlayRef;
}
export {
  useCodeBlockSelectionOverlay
};
