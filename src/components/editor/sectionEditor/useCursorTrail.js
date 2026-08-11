import { useEffect, useRef } from "react";
import { EditorCursorTrail } from "../../ui/cursor/EditorCursorTrail";
function useCursorTrail({
  readOnly,
  hasActiveDoc,
  editorDocId,
  editorCursorAnimationEnabled,
  editorCursorStyle,
  cursorTrailRegistry,
  scrollContainerRef,
  sectionsWrapperRef
}) {
  const trailOverlayRef = useRef(null);
  const trailRef = useRef(null);
  useEffect(() => {
    if (readOnly) return;
    if (!hasActiveDoc) return;
    if (!editorCursorAnimationEnabled) return;
    const overlay = trailOverlayRef.current;
    const editorEl = sectionsWrapperRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!overlay || !editorEl || !scrollContainer) return;
    const cssColor = getComputedStyle(document.documentElement).getPropertyValue("--vscode-editorCursor-foreground").trim() || getComputedStyle(document.documentElement).getPropertyValue("--vscode-focusBorder").trim() || "#007fd4";
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none"
    });
    overlay.appendChild(canvas);
    let trail;
    try {
      trail = new EditorCursorTrail(canvas, cssColor, editorEl, scrollContainer);
    } catch {
      overlay.removeChild(canvas);
      return;
    }
    trail.resize();
    trail.start();
    trailRef.current = trail;
    cursorTrailRegistry.attachTrail(trail);
    const markDirty = () => cursorTrailRegistry.markDirty();
    scrollContainer.addEventListener("scroll", markDirty, { passive: true, capture: true });
    const safetyTick = window.setInterval(() => {
      if (editorEl.contains(document.activeElement)) markDirty();
    }, 400);
    const resizeObserver = new ResizeObserver(() => trail.resize());
    resizeObserver.observe(overlay);
    return () => {
      window.clearInterval(safetyTick);
      scrollContainer.removeEventListener("scroll", markDirty, { capture: true });
      resizeObserver.disconnect();
      cursorTrailRegistry.attachTrail(null);
      trail.dispose();
      trailRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [readOnly, hasActiveDoc, editorDocId, editorCursorAnimationEnabled, cursorTrailRegistry]);
  useEffect(() => {
    if (readOnly) return;
    const trail = trailRef.current;
    if (!trail) return;
    const updateColor = () => {
      const cssColor = getComputedStyle(document.documentElement).getPropertyValue("--vscode-editorCursor-foreground").trim() || getComputedStyle(document.documentElement).getPropertyValue("--vscode-focusBorder").trim() || "#007fd4";
      trail.setColor(cssColor);
    };
    updateColor();
    const observer = new MutationObserver(() => {
      updateColor();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"]
    });
    return () => observer.disconnect();
  }, [readOnly, editorDocId]);
  useEffect(() => {
    if (readOnly) return;
    trailRef.current?.setCursorStyle(editorCursorStyle);
  }, [editorCursorStyle, editorDocId, readOnly]);
  return { trailOverlayRef, trailRef };
}
export {
  useCursorTrail
};
