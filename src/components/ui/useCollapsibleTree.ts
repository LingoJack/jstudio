import { useState, useCallback, useMemo } from 'react';

/**
 * Shared hook for managing collapsible tree / accordion state.
 *
 * Used by:
 * - `Settings.tsx` — sidebar nav with expandable sections
 * - `DocumentSidebar.tsx` — folder tree with expandable folders
 *
 * State is a `Set<string>` of expanded item ids.
 */
export function useCollapsibleTree(initialExpanded?: Iterable<string>) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialExpanded ?? []),
  );

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expand = useCallback((id: string) => {
    setExpanded((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const collapse = useCallback((id: string) => {
    setExpanded((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isExpanded = useCallback((id: string) => expanded.has(id), [expanded]);

  return useMemo(
    () => ({ expanded, toggle, expand, collapse, isExpanded, setExpanded }),
    [expanded, toggle, expand, collapse, isExpanded],
  );
}
