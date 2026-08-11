import { useCallback, useEffect, useRef, useState } from "react";
const COLLAPSE_DELAY = 180;
function useSidebarHover({
  sidebarPinned,
  leftPanelHovered,
  toggleSidebarPinned,
  suppressCollapse
}) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverCollapseTimer = useRef(null);
  const isSidebarHovered = useRef(false);
  const lastPointerPos = useRef({ x: -1, y: -1 });
  const suppressCollapseRef = useRef(false);
  suppressCollapseRef.current = suppressCollapse ?? false;
  const prevSuppressRef = useRef(false);
  const scheduleCollapse = useCallback(() => {
    if (hoverCollapseTimer.current) clearTimeout(hoverCollapseTimer.current);
    hoverCollapseTimer.current = setTimeout(() => {
      if (!suppressCollapseRef.current && !isSidebarHovered.current) {
        setHoverExpanded(false);
      }
    }, COLLAPSE_DELAY);
  }, []);
  const handleHoverEnter = useCallback(() => {
    isSidebarHovered.current = true;
    if (sidebarPinned ?? false) return;
    if (hoverCollapseTimer.current) {
      clearTimeout(hoverCollapseTimer.current);
      hoverCollapseTimer.current = null;
    }
    setHoverExpanded(true);
  }, [sidebarPinned]);
  const handleHoverLeave = useCallback(() => {
    isSidebarHovered.current = false;
    if (sidebarPinned ?? false) return;
    if (suppressCollapseRef.current) return;
    scheduleCollapse();
  }, [sidebarPinned, scheduleCollapse]);
  useEffect(() => {
    const onMove = (e) => {
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  useEffect(() => {
    if (sidebarPinned ?? false) return;
    if (leftPanelHovered) {
      if (hoverCollapseTimer.current) {
        clearTimeout(hoverCollapseTimer.current);
        hoverCollapseTimer.current = null;
      }
      setHoverExpanded(true);
    } else if (!isSidebarHovered.current) {
      if (suppressCollapseRef.current) return;
      scheduleCollapse();
    }
  }, [leftPanelHovered, sidebarPinned, scheduleCollapse]);
  useEffect(() => {
    const wasSuppressed = prevSuppressRef.current;
    prevSuppressRef.current = suppressCollapse ?? false;
    if (suppressCollapse) return;
    if (!wasSuppressed) return;
    if (sidebarPinned ?? false) return;
    const { x, y } = lastPointerPos.current;
    if (x >= 0 && y >= 0) {
      const el = document.elementFromPoint(x, y);
      isSidebarHovered.current = !!(el && el.closest("[data-sidebar-root]"));
    }
    if (!isSidebarHovered.current) {
      scheduleCollapse();
    }
    const reeval = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const overSidebar = !!(el && el.closest("[data-sidebar-root]"));
      isSidebarHovered.current = overSidebar;
      if (!overSidebar && !suppressCollapseRef.current) scheduleCollapse();
    };
    window.addEventListener("mousemove", reeval, { once: true });
    return () => window.removeEventListener("mousemove", reeval);
  }, [suppressCollapse, sidebarPinned, scheduleCollapse]);
  const handleTogglePin = useCallback(() => {
    toggleSidebarPinned?.();
    setHoverExpanded(false);
  }, [toggleSidebarPinned]);
  return {
    hoverExpanded,
    handleHoverEnter,
    handleHoverLeave,
    handleTogglePin
  };
}
export {
  useSidebarHover
};
