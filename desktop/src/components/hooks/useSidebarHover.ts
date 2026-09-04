/**
 * useSidebarHover - 共享的侧边栏悬停展开逻辑。
 *
 * 被 DocumentSidebar、AgentSidebar、BrowserSidebar 共用。
 *
 * 职责：
 *   - 管理 hoverExpanded 状态 + 相关 ref（isSidebarHovered, lastPointerPos, hoverCollapseTimer）
 *   - scheduleCollapse / handleHoverEnter / handleHoverLeave / handleTogglePin
 *   - pin 命中区（handlePinZoneEnter/Leave）：指针压在折叠态 pin 上时不展开
 *   - pointermove 跟踪 effect
 *   - leftPanelHovered 响应 effect
 *   - suppressCollapse 重新评估 effect（菜单关闭后检测鼠标是否仍在 sidebar 上）
 *   - 窗口失焦（切到其他应用）时立即收起，避免悬停展开卡住
 *
 * pinMode / setSidebarPinMode / suppressCollapse 均为可选，
 * 以便不支持 pinning 的侧边栏（如 BrowserSidebar）也能复用。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { SidebarPinMode } from '../../types/settings';

const COLLAPSE_DELAY = 180;

export interface UseSidebarHoverParams {
  /**
   * How the sidebar holds its state. 'open' / 'collapsed' lock it in place
   * (hover neither expands nor collapses it); 'hover' is the auto-expand
   * mode. Default: 'hover' (sidebars without pinning, e.g. BrowserSidebar).
   */
  pinMode?: SidebarPinMode;
  leftPanelHovered: boolean;
  /** Set the pin mode. Only needed when pinning is supported. */
  setSidebarPinMode?: (mode: SidebarPinMode) => void;
  /** Suppress auto-collapse while a floating menu / modal is active. Default: false. */
  suppressCollapse?: boolean;
}

export function useSidebarHover({
  pinMode = 'hover',
  leftPanelHovered,
  setSidebarPinMode,
  suppressCollapse,
}: UseSidebarHoverParams) {
  /** Locked sidebars ignore hover entirely — neither expand nor collapse. */
  const isLocked = pinMode !== 'hover';
  const [hoverExpanded, setHoverExpanded] = useState(false);
  /**
   * Pointer is over the collapsed rail's pin hit area (the whole top row).
   *
   * Expanding there would swap the rail layout out from under the cursor and
   * move the pin to the far right of the expanded header, so the click never
   * lands. This masks the expansion instead of cancelling it — the pointer
   * reaches the pin in the same tick it enters the sidebar (enter fires
   * outermost-first), so cancelling would be too late, whereas a mask keeps
   * the rail in place no matter which order the two handlers run in.
   */
  const [pinZoneHovered, setPinZoneHovered] = useState(false);
  const hoverCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSidebarHovered = useRef(false);
  // Last known pointer position - used by the suppressCollapse effect to
  // determine whether the cursor is still over the sidebar when a floating
  // menu closes, without waiting for the next mousemove event.
  const lastPointerPos = useRef({ x: -1, y: -1 });

  // Mirror suppressCollapse into a ref so scheduleCollapse (a stable useCallback)
  // can read the latest value without re-creating.
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
    if (isLocked) return;
    if (hoverCollapseTimer.current) {
      clearTimeout(hoverCollapseTimer.current);
      hoverCollapseTimer.current = null;
    }
    setHoverExpanded(true);
  }, [isLocked]);

  const handleHoverLeave = useCallback(() => {
    isSidebarHovered.current = false;
    if (isLocked) return;
    if (suppressCollapseRef.current) return;
    scheduleCollapse();
  }, [isLocked, scheduleCollapse]);

  // ── Pin no-expand zone (collapsed rail) ────────────────────
  // The collapsed rail's pin is how you lock the sidebar collapsed, but it
  // lives inside the very area that triggers hover-expand. Its hit area
  // covers the whole top row of the rail, so parking the pointer anywhere on
  // that row keeps the rail (and the pin) in place and the click lands.
  // `hoverExpanded` is left untouched: moving off the row resumes normal
  // hover behaviour immediately — no delay is introduced anywhere.
  const handlePinZoneEnter = useCallback(() => {
    setPinZoneHovered(true);
  }, []);

  const handlePinZoneLeave = useCallback(() => {
    setPinZoneHovered(false);
  }, []);

  // ── Collapse when the window loses focus ────────────────────────
  // Switching to another app (Cmd+Tab, trackpad swipe to another Space)
  // never fires `mouseleave` on the sidebar, so a hover-expanded sidebar
  // would stay open indefinitely with the pointer gone. Window blur and
  // tab-hide both cover it: drop the hover state, cancel any pending
  // collapse timer and clear the ActivityBar's `leftPanelHovered` flag
  // (a stale `true` there would re-expand the sidebar on the next render).
  useEffect(() => {
    const collapseNow = () => {
      if (hoverCollapseTimer.current) {
        clearTimeout(hoverCollapseTimer.current);
        hoverCollapseTimer.current = null;
      }
      isSidebarHovered.current = false;
      setHoverExpanded(false);
      setPinZoneHovered(false);
      useStore.getState().setLeftPanelHovered(false);
    };
    const onVisibilityChange = () => {
      if (document.hidden) collapseNow();
    };
    window.addEventListener('blur', collapseNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', collapseNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

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
    if (isLocked) return;
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
  }, [leftPanelHovered, isLocked, scheduleCollapse]);

  // When suppressCollapse transitions from true -> false (e.g. a context menu
  // closes), re-evaluate whether the cursor is still over the sidebar and
  // schedule a collapse if not.
  useEffect(() => {
    const wasSuppressed = prevSuppressRef.current;
    prevSuppressRef.current = suppressCollapse ?? false;
    if (suppressCollapse) return;
    if (!wasSuppressed) return;
    if (isLocked) return;

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
  }, [suppressCollapse, isLocked, scheduleCollapse]);

  /** Whether the sidebar is visually expanded (pinned open, or hover-expanded). */
  const isExpanded =
    pinMode === 'open' || (!isLocked && hoverExpanded && !pinZoneHovered);

  const handleTogglePin = useCallback(() => {
    if (isLocked) {
      // Unlock: back to hover behaviour — stays expanded only while the
      // pointer is still over the sidebar (the click happens inside it).
      setSidebarPinMode?.('hover');
      setPinZoneHovered(false);
      setHoverExpanded(isSidebarHovered.current);
      return;
    }
    // Lock whatever the sidebar is SHOWING right now, not the internal
    // `hoverExpanded` flag: while the pointer sits on the collapsed rail's
    // pin, `hoverExpanded` is already true (the pin zone only masks the
    // expansion) even though the rail is visibly collapsed — reading it
    // here would lock the sidebar open on a click meant to lock it shut.
    setSidebarPinMode?.(isExpanded ? 'open' : 'collapsed');
  }, [isLocked, isExpanded, setSidebarPinMode]);

  return {
    hoverExpanded,
    isExpanded,
    handleHoverEnter,
    handleHoverLeave,
    handlePinZoneEnter,
    handlePinZoneLeave,
    handleTogglePin,
  };
}
