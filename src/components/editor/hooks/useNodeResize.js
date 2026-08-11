import { useCallback, useEffect, useRef, useState } from "react";
function useNodeResize(options) {
  const {
    width,
    height,
    updateAttributes,
    minWidth = 80,
    maxWidth,
    fallbackWidth = 300,
    minHeight = 100,
    maxHeight,
    fallbackHeight = 300,
    onCommit
  } = options;
  const trackHeight = height !== void 0;
  const ref = useRef(null);
  const resizingRef = useRef(false);
  const [displayWidth, setDisplayWidth] = useState(width ?? null);
  const [displayHeight, setDisplayHeight] = useState(
    trackHeight ? height ?? null : null
  );
  const displayWidthRef = useRef(displayWidth);
  const displayHeightRef = useRef(displayHeight);
  displayWidthRef.current = displayWidth;
  displayHeightRef.current = displayHeight;
  useEffect(() => {
    if (!resizingRef.current) {
      setDisplayWidth(width ?? null);
    }
  }, [width]);
  useEffect(() => {
    if (!resizingRef.current && trackHeight) {
      setDisplayHeight(height ?? null);
    }
  }, [height, trackHeight]);
  const onResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = displayWidth ?? ref.current?.offsetWidth ?? fallbackWidth;
      const startHeight = trackHeight ? displayHeight ?? ref.current?.offsetHeight ?? fallbackHeight : 0;
      const resolvedMaxWidth = typeof maxWidth === "function" ? maxWidth() : maxWidth;
      const resolvedMaxHeight = typeof maxHeight === "function" ? maxHeight() : maxHeight;
      resizingRef.current = true;
      displayWidthRef.current = displayWidth ?? startWidth;
      if (trackHeight) {
        displayHeightRef.current = displayHeight ?? startHeight;
      }
      const onMove = (ev) => {
        const deltaX = ev.clientX - startX;
        let newWidth = Math.max(minWidth, startWidth + deltaX);
        if (resolvedMaxWidth !== void 0) {
          newWidth = Math.min(newWidth, resolvedMaxWidth);
        }
        setDisplayWidth(newWidth);
        displayWidthRef.current = newWidth;
        if (trackHeight) {
          const deltaY = ev.clientY - startY;
          let newHeight = Math.max(minHeight, startHeight + deltaY);
          if (resolvedMaxHeight !== void 0) {
            newHeight = Math.min(newHeight, resolvedMaxHeight);
          }
          setDisplayHeight(newHeight);
          displayHeightRef.current = newHeight;
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        resizingRef.current = false;
        const finalWidth = displayWidthRef.current ?? startWidth;
        const finalHeight = trackHeight ? displayHeightRef.current ?? startHeight : null;
        const attrs = onCommit ? onCommit(finalWidth, finalHeight) : trackHeight && finalHeight !== null ? { width: finalWidth, height: finalHeight } : { width: finalWidth };
        updateAttributes(attrs);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [
      displayWidth,
      displayHeight,
      trackHeight,
      updateAttributes,
      minWidth,
      maxWidth,
      fallbackWidth,
      minHeight,
      maxHeight,
      fallbackHeight,
      onCommit
    ]
  );
  return { ref, displayWidth, displayHeight, onResizeStart };
}
export {
  useNodeResize
};
