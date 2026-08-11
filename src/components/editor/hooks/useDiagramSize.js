import { useEffect, useRef, useCallback } from "react";
import { useNodeResize } from "./useNodeResize";
import { useEditorWidth } from "./useEditorWidth";
function useDiagramSize({
  attrs,
  updateAttributes,
  minWidth = 300,
  minHeight = 200,
  fallbackWidth = 520,
  fallbackHeight = 600
}) {
  const { width, widthPct, height, heightPct } = attrs;
  const editorWidth = useEditorWidth();
  const figureRefInternal = useRef(null);
  useEffect(() => {
    if (width != null && widthPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round(width / editorWidth * 100)));
      updateAttributes({ widthPct: pct, width: null });
    }
  }, [width, widthPct, editorWidth, updateAttributes]);
  useEffect(() => {
    if (height != null && heightPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round(height / editorWidth * 100)));
      updateAttributes({ heightPct: pct, height: null });
    }
  }, [height, heightPct, editorWidth, updateAttributes]);
  const widthPx = widthPct != null ? Math.round(widthPct * editorWidth / 100) : width;
  const heightPx = heightPct != null ? Math.round(heightPct * editorWidth / 100) : height;
  const { ref: figureRef, displayWidth, displayHeight, onResizeStart } = useNodeResize({
    width: widthPx,
    height: heightPx,
    updateAttributes,
    minWidth,
    minHeight,
    fallbackWidth,
    fallbackHeight,
    maxWidth: () => {
      const el = figureRefInternal.current;
      const editorSurface = el?.closest(".ProseMirror");
      if (editorSurface) {
        const style = getComputedStyle(editorSurface);
        const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        return editorSurface.clientWidth - padX - 24;
      }
      return window.innerWidth - 24;
    },
    onCommit: (finalWidth, finalHeight) => {
      const pct = editorWidth > 0 ? Math.min(100, Math.max(1, Math.round(finalWidth / editorWidth * 100))) : 50;
      const attrs2 = { widthPct: pct, width: null };
      if (finalHeight !== null) {
        const hPct = editorWidth > 0 ? Math.min(100, Math.max(1, Math.round(finalHeight / editorWidth * 100))) : null;
        attrs2.heightPct = hPct;
        attrs2.height = null;
      }
      return attrs2;
    }
  });
  const setFigureRef = useCallback((el) => {
    figureRef.current = el;
    figureRefInternal.current = el;
  }, []);
  return {
    figureRef,
    setFigureRef,
    displayWidth,
    displayHeight,
    onResizeStart
  };
}
export {
  useDiagramSize
};
