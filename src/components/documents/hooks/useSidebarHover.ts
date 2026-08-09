/**
 * useSidebarHover - 从 DocumentSidebar 提取的悬停展开逻辑。
 *
 * 职责：
 *   - 管理 hoverExpanded 状态 + 相关 ref（isSidebarHovered, lastPointerPos, hoverCollapseTimer）
 *   - scheduleCollapse / handleHoverEnter / handleHoverLeave / handleTogglePin
 *   - pointermove 跟踪 effect
 *   - leftPanelHovered 响应 effect
 *   - suppressCollapse 重新评估 effect（菜单关闭后检测鼠标是否仍在 sidebar 上）
 *
 * suppressCollapse 由外部组件从 9 个菜单/重命名/搜索状态计算后传入。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const COLLAPSE_DELAY = 180;

export interface UseSidebarHoverParams {
  sidebarPinned: boolean;
  leftPanelHovered: boolean;
  toggleSidebarPinned: () => void;
  suppressCollapse: boolean;
}

export function useSidebarHover({
  sidebarPinned,
  leftPanelHovered,
  toggleSidebarPinned,
  suppressCollapse,
}: UseSidebarHoverParams) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSidebarHovered = useRef(false);
  // Last known pointer position - used by the suppressCollapse effect to
  // determine whether the cursor is still over the sidebar when a floating
  // menu closes, without waiting for the next mousemove event.
  const lastPointerPos = useRef({ x: -1, y: -1 });

  // Mirror suppressCollapse into a ref so scheduleCollapse (a stable useCallback)
  // can read the latest value without re-creating.
  const suppressCollapseRef = useRef(false);
  suppressCollapseRef.current = suppressCollapse;
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
    if (sidebarPinned) return;
    if (hoverCollapseTimer.current) {
      clearTimeout(hoverCollapseTimer.current);
      hoverCollapseTimer.current = null;
    }
    setHoverExpanded(true);
  }, [sidebarPinned]);

  const handleHoverLeave = useCallback(() => {
    isSidebarHovered.current = false;
    if (sidebarPinned) return;
    if (suppressCollapseRef.current) return;
    scheduleCollapse();
  }, [sidebarPinned, scheduleCollapse]);

  // Track pointer position globally so the suppressCollapse effect can use it.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Respond to leftPanelHovered changes from the store.
  useEffect(() => {
    if (sidebarPinned) return;
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

  // When suppressCollapse transitions from true -> false (e.g. a context menu
  // closes), re-evaluate whether the cursor is still over the sidebar and
  // schedule a collapse if not.
  useEffect(() => {
    const wasSuppressed = prevSuppressRef.current;
    prevSuppressRef.current = suppressCollapse;
    if (suppressCollapse) return;
    if (!wasSuppressed) return;
    if (sidebarPinned) return;

    const { x, y } = lastPointerPos.current;
    if (x >= 0 && y >= 0) {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      isSidebarHovered.current = !!(el && el.closest('[data-sidebar-root]'));
    }

    if (!isSidebarHovered.current) {
      scheduleCollapse();
    }

    const reeval = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const overSidebar = !!(el && el.closest('[data-sidebar-root]'));
      isSidebarHovered.current = overSidebar;
      if (!overSidebar && !suppressCollapseRef.current) scheduleCollapse();
    };
    window.addEventListener('mousemove', reeval, { once: true });
    return () => window.removeEventListener('mousemove', reeval);
  }, [suppressCollapse, sidebarPinned, scheduleCollapse]);

  const handleTogglePin = useCallback(() => {
    toggleSidebarPinned();
    setHoverExpanded(false);
  }, [toggleSidebarPinned]);

  return {
    hoverExpanded,
    handleHoverEnter,
    handleHoverLeave,
    handleTogglePin,
  };
}
