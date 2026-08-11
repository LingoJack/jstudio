import { useState, useCallback, useMemo } from "react";
function useCollapsibleTree(initialExpanded) {
  const [expanded, setExpanded] = useState(
    () => new Set(initialExpanded ?? [])
  );
  const toggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expand = useCallback((id) => {
    setExpanded((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const collapse = useCallback((id) => {
    setExpanded((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const isExpanded = useCallback((id) => expanded.has(id), [expanded]);
  return useMemo(
    () => ({ expanded, toggle, expand, collapse, isExpanded, setExpanded }),
    [expanded, toggle, expand, collapse, isExpanded]
  );
}
export {
  useCollapsibleTree
};
