import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { createDocumentWindow } from '../../lib/windows/documentDetach';
import { Plus, X, FileText, ExternalLink } from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
import type { UnifiedTab } from '../../store/workspaceSlice';

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
 *   - `+` button → new document
 */
export default function DocumentTabs() {
  const { t } = useI18n();
  const allTabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const closeOtherTabs = useStore((s) => s.closeOtherTabs);
  const docList = useStore((s) => s.docList);
  const createDocument = useStore((s) => s.createDocument);

  // Filter to document tabs only.
  const docTabs = allTabs.filter((tab) => tab.kind === 'document');

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

  // Drag tear-off state
  const dragTab = useRef<UnifiedTab | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    title: string;
    outside: boolean;
  } | null>(null);

  // ── Scroll active tab into view ──────────────────────────────────
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTabId]);

  // ── 滚动渐变遮罩显示/隐藏 ───────────────────────────────────────
  useEffect(() => {
    const scroller = scrollRef.current;
    const container = scroller?.parentElement;
    if (!scroller || !container) return;

    const leftFade = container.querySelector('[data-scroll-left-fade]') as HTMLElement;
    const rightFade = container.querySelector('[data-scroll-right-fade]') as HTMLElement;

    const updateFades = () => {
      const { scrollLeft, scrollWidth, clientWidth } = scroller;
      const canScrollLeft = scrollLeft > 4;
      const canScrollRight = scrollLeft < scrollWidth - clientWidth - 4;
      if (leftFade) leftFade.style.opacity = canScrollLeft ? '1' : '0';
      if (rightFade) rightFade.style.opacity = canScrollRight ? '1' : '0';
    };

    updateFades();
    scroller.addEventListener('scroll', updateFades);
    window.addEventListener('resize', updateFades);
    return () => {
      scroller.removeEventListener('scroll', updateFades);
      window.removeEventListener('resize', updateFades);
    };
  }, []);

  // ── Close context menu on outside click ─────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    requestAnimationFrame(() => {
      window.addEventListener('click', handler);
    });
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // ── Resolve document title ───────────────────────────────────────
  const getDocTitle = useCallback(
    (tab: UnifiedTab): string => {
      const meta = docList.find((d) => d.id === tab.docId);
      return meta?.title || t('doclist.untitled');
    },
    [docList, t],
  );

  // ── Tab tear-off drag handlers ───────────────────────────────────
  const isOutsideTabBar = useCallback((clientX: number, clientY: number) => {
    const bar = tabBarRef.current;
    if (!bar) return false;
    const r = bar.getBoundingClientRect();
    return (
      clientX < r.left ||
      clientX > r.right ||
      clientY < r.top ||
      clientY > r.bottom
    );
  }, []);

  const handleTabDragStart = useCallback(
    (e: React.DragEvent, tab: UnifiedTab) => {
      if (allTabs.length < 2) {
        e.preventDefault();
        return;
      }
      dragTab.current = tab;
      e.dataTransfer.effectAllowed = 'move';
      const img = new Image();
      img.src =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(img, 0, 0);
    },
    [allTabs.length],
  );

  const handleTabDrag = useCallback(
    (e: React.DragEvent, title: string) => {
      if (e.clientX === 0 && e.clientY === 0) return;
      const outside = isOutsideTabBar(e.clientX, e.clientY);
      setGhost({ x: e.clientX, y: e.clientY, title, outside });
    },
    [isOutsideTabBar],
  );

  const handleTabDragEnd = useCallback(
    (e: React.DragEvent) => {
      const tab = dragTab.current;
      dragTab.current = null;
      setGhost(null);

      if (!tab) return;
      if (e.clientX === 0 && e.clientY === 0) return;

      if (isOutsideTabBar(e.clientX, e.clientY) && tab.docId) {
        createDocumentWindow(tab.docId, tab.id, { x: e.screenX, y: e.screenY });
      }
    },
    [isOutsideTabBar],
  );

  const handleDetach = useCallback((tab: UnifiedTab) => {
    if (tab.docId) createDocumentWindow(tab.docId, tab.id);
  }, []);

  // Don't render if there are no document tabs.
  if (docTabs.length === 0) return null;

  return (
    <>
      {/* 悬浮液态玻璃胶囊 tab bar —不占据空间，完全悬浮 */}
      <div
        ref={tabBarRef}
        className="absolute left-0 right-0 bottom-0 flex items-center justify-center pb-3 z-10"
      >
        <div
          className="relative flex items-center overflow-x-auto min-w-0 max-w-[80%] gap-0.5 px-2 py-1.5 rounded-full"
          style={{
            scrollbarWidth: 'thin',
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          {/* 左侧渐变遮罩 —提示左侧有更多内容 */}
          <div
            className="absolute left-0 top-0 bottom-0 w-8 rounded-l-full pointer-events-none opacity-0 transition-opacity duration-150"
            style={{
              background: 'linear-gradient(to right, rgba(255,255,255,0.06), transparent)',
            }}
            data-scroll-left-fade
          />
          {/* 右侧渐变遮罩 —提示右侧有更多内容 */}
          <div
            className="absolute right-0 top-0 bottom-0 w-8 rounded-r-full pointer-events-none opacity-0 transition-opacity duration-150"
            style={{
              background: 'linear-gradient(to left, rgba(255,255,255,0.06), transparent)',
            }}
            data-scroll-right-fade
          />
          <div
            ref={scrollRef}
            className="flex items-center overflow-x-auto min-w-0 gap-0.5"
            style={{ scrollbarWidth: 'none' }}
          >
          {docTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const title = getDocTitle(tab);

            return (
              <div
                key={tab.id}
                ref={isActive ? activeTabRef : null}
                draggable={allTabs.length > 1}
                onDragStart={(e) => handleTabDragStart(e, tab)}
                onDrag={(e) => handleTabDrag(e, title)}
                onDragEnd={handleTabDragEnd}
                onClick={() => setActiveTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                }}
                className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer shrink-0 transition-colors duration-75 ${
                  isActive
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]'
                    : 'text-[var(--vscode-descriptionForeground)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--vscode-foreground)]'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0 opacity-70" />
                <span className="text-[13px] font-medium flex-1 min-w-0 truncate max-w-[140px]">
                  {title}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-full transition-all duration-75 hover:bg-[rgba(255,255,255,0.15)] ${
                    isActive
                      ? 'opacity-70'
                      : 'opacity-0 group-hover:opacity-70'
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          </div>
          {/* `+` button — outside scroll container, always visible */}
          <button
            onClick={() => createDocument()}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[var(--vscode-descriptionForeground)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--vscode-foreground)] transition-colors duration-75 cursor-pointer"
            title={t('doclist.newDocument')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <MenuList x={contextMenu.x} y={contextMenu.y} onClick={(e) => e.stopPropagation()}>
          {allTabs.length > 1 && (
            <>
              <MenuItem
                icon={<ExternalLink className="w-4 h-4" />}
                onClick={() => {
                  const tab = allTabs.find((tt) => tt.id === contextMenu.tabId);
                  if (tab) handleDetach(tab);
                  setContextMenu(null);
                }}
              >
                {t('workspace.detachToWindow')}
              </MenuItem>
              <MenuDivider />
            </>
          )}
          <MenuItem
            icon={<X className="w-4 h-4" />}
            onClick={() => {
              closeTab(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            {t('workspace.closeTab')}
          </MenuItem>
          {docTabs.length > 1 && (
            <MenuItem
              onClick={() => {
                closeOtherTabs(contextMenu.tabId);
                setContextMenu(null);
              }}
            >
              {t('workspace.closeOthers')}
            </MenuItem>
          )}
        </MenuList>
      )}

      {/* Drag ghost */}
      {ghost &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none select-none"
            style={{ left: ghost.x + 12, top: ghost.y + 12 }}
          >
            <div
              className={`flex flex-col gap-0.5 px-3 py-2 rounded-md shadow-2xl border text-xs font-medium transition-colors ${
                ghost.outside
                  ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]'
                  : 'border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] text-[var(--vscode-descriptionForeground)]'
              }`}
            >
              <span className="max-w-[200px] truncate">{ghost.title}</span>
              {ghost.outside && (
                <span className="text-tiny text-[var(--vscode-focusBorder)]">
                  {t('workspace.releaseToDetach')}
                </span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
