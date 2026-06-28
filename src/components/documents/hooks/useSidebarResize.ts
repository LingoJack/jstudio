import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../../../store/useStore';

/**
 * useSidebarResize — manages the drag-to-resize behavior for the sidebar.
 *
 * Returns:
 *   - `isResizing`: whether a drag is currently in progress (for cursor / styling)
 *   - `onResizeStart`: mousedown handler to attach to the resize handle
 *
 * The actual width value lives in the UI store (`sidebarWidth`), so it
 * persists across sessions. Dragging updates the store on every mousemove.
 */
export function useSidebarResize() {
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);

  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = sidebarWidth;
      setIsResizing(true);
    },
    [sidebarWidth],
  );

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - startXRef.current;
      setSidebarWidth(startWidthRef.current + delta);
    };
    const onMouseUp = () => {
      resizingRef.current = false;
      setIsResizing(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  return { isResizing, onResizeStart };
}
