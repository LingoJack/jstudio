import { useEffect, useRef, useCallback } from "react";
function useDiagramEditMode(editing) {
  const rootRef = useRef(null);
  const handleRootRef = useCallback((el) => {
    rootRef.current = el;
  }, []);
  useEffect(() => {
    if (!editing) return;
    const root = rootRef.current;
    if (!root) return;
    if (root.tabIndex < 0) root.tabIndex = -1;
    root.focus({ preventScroll: true });
  }, [editing]);
  return {
    editing,
    rootRef,
    handleRootRef
  };
}
export {
  useDiagramEditMode
};
