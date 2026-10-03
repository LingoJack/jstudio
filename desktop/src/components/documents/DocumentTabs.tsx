import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { createDocumentWindow } from '../../lib/windows/documentDetach';
import TabBar, { type TabItem } from '../ui/TabBar';
import type { UnifiedTab } from '../../store/workspaceSlice';
import OpenDocumentDialog from './OpenDocumentDialog';
import { DocumentTabContextMenu } from './DocumentTabContextMenu';
import { useTitlebarCenterSlot } from '../layout/titlebarSlot';
import { SCRATCH_DOC_ID } from '../../store/documentsSlice';
import { OUTLINE_WIDTH } from '../editor/sectionEditor/SectionOutline';
import { SIDEBAR } from '../../lib/constants';

/**
 * Max document tabs rendered at once.
 *
 * Every tab is 130px wide, so beyond a handful the capsule exceeds its
 * `maxWidth` and starts scrolling horizontally — which defeats the
 * floating pill design. Tabs beyond this limit stay OPEN but are not
 * rendered: the visible window always contains the active tab, and hidden
 * ones remain reachable via Cmd+Option+←/→ (cycleTab walks all tabs) or by
 * clicking the document in the sidebar.
 */
const MAX_VISIBLE_DOC_TABS = 6;

/**
 * DocumentTabs — tab bar for document tabs only.
 *
 * Terminal tabs have their own tab bar inside TerminalPanel/TerminalTabs.
 * Both share the same workspace state (workspaceSlice), so the global
 * cycle shortcut (Cmd+Option+←/→) can jump between document and terminal
 * tabs.
 *
 * Features:
 *   - Click tab → switch to that document
 *   - Close button (X) on each tab (hidden when only 1 remains)
 *   - Right-click → context menu (Detach / Close / Close Others)
 *   - Drag a tab outside → tear off into a new OS window
 *   - `+` button -> open search dialog to find/open existing documents
 *   - Apple-style sliding indicator + ripple effect on `+`
 */
export default function DocumentTabs() {
  const { t } = useI18n();
  const allTabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const selectTab = useStore((s) => s.selectTab);
  const closeTab = useStore((s) => s.closeTab);
  const closeOtherTabs = useStore((s) => s.closeOtherTabs);
  const docList = useStore((s) => s.docList);
  const tabBarGlassOpacity = useStore((s) => s.tabBarGlassOpacity);
  const tabBarPosition = useStore((s) => s.tabBarPosition);
  const isOpenDocDialogOpen = useStore((s) => s.isOpenDocDialogOpen);
  const setOpenDocDialogOpen = useStore((s) => s.setOpenDocDialogOpen);
  const isOutlineOpen = useStore((s) => s.isOutlineOpen);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const sidebarPinMode = useStore((s) => s.sidebarPinMode);
  const leftPanelHovered = useStore((s) => s.leftPanelHovered);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const revealDocInSidebar = useStore((s) => s.revealDocInSidebar);

  // ── Capsule max width: keep clear of BOTH side panels ──
  // The capsule centers on the window, so its cap is 80% minus the space
  // occupied by the sidebar (left; 48px collapsed / sidebarWidth expanded)
  // and the outline panel (right; OUTLINE_WIDTH when open).
  // The sidebar is expanded when locked open, or in hover mode while the
  // pointer is over the left panel; locked-collapsed always counts as 48px.
  const sidebarEffective = !isSidebarOpen
    ? 0
    : sidebarPinMode === 'collapsed'
      ? SIDEBAR.COLLAPSED
      : sidebarPinMode === 'open' || leftPanelHovered
        ? sidebarWidth
        : SIDEBAR.COLLAPSED;
  const outlineOffset = isOutlineOpen ? OUTLINE_WIDTH : 0;
  const capsuleMaxWidth = `calc(80% - ${sidebarEffective + outlineOffset}px)`;

  // Filter to document tabs only.
  const docTabs = allTabs.filter((tab) => tab.kind === 'document');

  // ── Visible window (cap the rendered tab count) ──────────────────
  // A `MAX_VISIBLE_DOC_TABS`-wide slice centred on the active tab, so the
  // capsule never overflows. `activeDocTabIndex` is -1 while a terminal tab
  // is active — the window then just stays anchored at the first tab.
  const activeDocTabIndex = docTabs.findIndex((tab) => tab.id === activeTabId);

  // ── User-shiftable visible window ────────────────────────────
  // Auto-centers on the active tab (windowStartUser = null). The mouse
  // wheel / trackpad pan moves it tab-by-tab — revealing tabs outside the
  // rendered slice (+N badge counts them). Re-centers on doc-tab switch;
  // the +N badge click resets too. The user's position is ABSOLUTE (not an
  // offset from the centered anchor): an anchor-relative shift gets clamped
  // away whenever the active tab sits near the list's end, eating the
  // shift — the bug this model replaces.
  const [windowStartUser, setWindowStartUser] = useState<number | null>(null);
  useEffect(() => {
    userStartRef.current = null;
    setWindowStartUser(null);
  }, [activeDocTabIndex]);

  const centeredStart = activeDocTabIndex - Math.floor((MAX_VISIBLE_DOC_TABS - 1) / 2);
  const maxStart = Math.max(0, docTabs.length - MAX_VISIBLE_DOC_TABS);
  const windowStart = Math.max(
    0,
    Math.min(windowStartUser ?? centeredStart, maxStart),
  );
  const visibleDocTabs = docTabs.slice(
    windowStart,
    windowStart + MAX_VISIBLE_DOC_TABS,
  );
  const hiddenTabCount = docTabs.length - visibleDocTabs.length;

  // TEMP DEBUG (remove after tab-strip wheel verification)
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__jtabs = {
      userStart: windowStartUser,
      len: docTabs.length,
      idx: activeDocTabIndex,
      start: windowStart,
      maxStart: Math.max(0, docTabs.length - MAX_VISIBLE_DOC_TABS),
    };
  }

  // Mouse wheel / trackpad pan over the strip: one tab per ~120px of
  // scroll, both axes (mouse wheel = deltaY, macOS trackpad swipe =
  // deltaX). Capture phase on the wrapper; stopped after handling so
  // nothing double-moves.
  const tabBarWheelRef = useRef<HTMLDivElement>(null);
  /** Latest lengths/indices for the deps-free handler (refs mirror render). */
  const docTabsLenRef = useRef(0);
  docTabsLenRef.current = docTabs.length;
  const activeIdxRef = useRef(0);
  activeIdxRef.current = activeDocTabIndex;
  const userStartRef = useRef<number | null>(null);
  userStartRef.current = windowStartUser;
  const wheelAccumRef = useRef(0);
  useEffect(() => {
    const el = tabBarWheelRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 2) return;
      wheelAccumRef.current += delta;
      const STEP = 120;
      const steps = Math.trunc(wheelAccumRef.current / STEP);
      if (steps === 0) { e.preventDefault(); return; } // swallow sub-step jitter

      const maxStart = Math.max(0, docTabsLenRef.current - MAX_VISIBLE_DOC_TABS);
      const centered = activeIdxRef.current - Math.floor((MAX_VISIBLE_DOC_TABS - 1) / 2);
      const cur = Math.max(0, Math.min(userStartRef.current ?? centered, maxStart));
      const next = Math.max(0, Math.min(cur + steps, maxStart));
      if (next === cur) {
        wheelAccumRef.current = 0;
        return; // at an edge — nothing left to reveal in that direction
      }
      e.preventDefault();
      e.stopPropagation();
      wheelAccumRef.current -= steps * STEP;
      userStartRef.current = next;
      setWindowStartUser(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }); // no deps — re-attach per render: an HMR-recreated wrapper element
      // must always carry the listener (same rule as TabBar's effects)

  // Title-bar center slot (live element from the registry — survives
  // AppTitleBar remounts / HMR, unlike a state-cached reference).
  const titlebarSlot = useTitlebarCenterSlot();

  // ── Resolve document title ───────────────────────────────────────
  const getDocTitle = useCallback(
    (tab: UnifiedTab): string => {
      // The in-memory scratch doc is not in docList (never persisted).
      if (tab.docId === SCRATCH_DOC_ID) return '临时草稿';
      const meta = docList.find((d) => d.id === tab.docId);
      return meta?.title || t('doclist.untitled');
    },
    [docList, t],
  );

  // ── Map UnifiedTab → TabItem ─────────────────────────────────────
  const tabItems: TabItem[] = visibleDocTabs.map((tab) => ({
    id: tab.id,
    title: getDocTitle(tab),
    isActive: tab.id === activeTabId,
    canClose: allTabs.length > 1,
    canDrag: allTabs.length > 1,
  }));

  // ── Detach handler ───────────────────────────────────────────────
  const handleDetach = useCallback((tabId: string) => {
    const tab = allTabs.find((t) => t.id === tabId);
    if (tab?.docId) createDocumentWindow(tab.docId, tab.id);
  }, [allTabs]);

  // ── Context menu renderer ───────────────────────────────────────
  const renderContextMenu = useCallback(
    (tabId: string, x: number, y: number, close: () => void) => {
      const tab = allTabs.find((tb) => tb.id === tabId);
      return (
        <DocumentTabContextMenu
          tabId={tabId}
          docId={tab?.docId}
          x={x}
          y={y}
          canDetach={allTabs.length > 1 && !!tab?.docId}
          canCloseOthers={docTabs.length > 1}
          onCloseMenu={close}
          onDetach={(tid) => {
            if (tab?.docId) createDocumentWindow(tab.docId, tid);
          }}
          onRevealInSidebar={revealDocInSidebar}
          onClose={closeTab}
          onCloseOthers={closeOtherTabs}
        />
      );
    },
    [allTabs, docTabs, closeTab, closeOtherTabs, revealDocInSidebar]
  );

  // Don't render if there are no document tabs.
  if (docTabs.length === 0) return null;

  // 隐藏模式（设置 → 外观 → 标签栏位置）：胶囊整体不渲染。
  if (tabBarPosition === 'hidden') return null;

  const tabBar = (
    <div ref={tabBarWheelRef} data-tab-strip-window="1">
    <TabBar
      tabs={tabItems}
      activeTabId={activeTabId}
      onTabClick={selectTab}
      onTabClose={closeTab}
      onNew={() => setOpenDocDialogOpen(true)}
      onDetach={handleDetach}
      renderContextMenu={renderContextMenu}
      glassOpacity={tabBarGlassOpacity}
      position={tabBarPosition === 'top' ? 'titlebar' : 'bottom'}
      maxWidth={capsuleMaxWidth}
      extraActions={
        hiddenTabCount > 0 ? (
          <span
            className="shrink-0 px-1 text-[11px] font-medium text-[var(--vscode-descriptionForeground)] opacity-70"
            title={t('workspace.hiddenTabs', { count: hiddenTabCount })}
          onClick={() => { userStartRef.current = null; setWindowStartUser(null); }}
          >
            +{hiddenTabCount}
          </span>
        ) : null
      }
    />
    </div>
  );

  return (
    <>
      {/* position 'top' = dock the capsule into the app title bar's center
          slot (portal) instead of floating over the content area. */}
      {tabBarPosition === 'top'
        ? titlebarSlot
          ? createPortal(tabBar, titlebarSlot)
          : null
        : tabBar}
      <OpenDocumentDialog
        open={isOpenDocDialogOpen}
        onClose={() => setOpenDocDialogOpen(false)}
      />
    </>
  );
}

