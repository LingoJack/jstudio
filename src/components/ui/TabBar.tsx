/**
 * TabBar — reusable glassmorphism tab bar with Apple-style sliding indicator.
 *
 * Features:
 *   - Liquid glass capsule container (blur + glass light)
 *   - Scroll with gradient fade masks (left/right)
 *   - Apple-style sliding selection indicator (spring/bounce curve)
 *   - Tab tear-off drag (spawn new OS window)
 *   - Right-click context menu
 *   - Ripple effect on action buttons (new / history)
 *
 * This is a headless UI component — the caller provides:
 *   - tabs: array of tab items (id, title, isActive, icon, paneCount, etc.)
 *   - onClick: handler for tab activation
 *   - onClose: handler for tab close (optional)
 *   - onNew: handler for new tab
 *   - onDetach: handler for tear-off (optional)
 *   - onRename: handler for inline rename (optional)
 *   - renderContextMenu: function to render the right-click menu
 *   - extraActions: additional buttons after the scroll container (history, etc.)
 *
 * Usage:
 *   <TabBar
 *     tabs={tabs}
 *     activeTabId={activeId}
 *     onTabClick={(id) => setActive(id)}
 *     onTabClose={(id) => close(id)}
 *     onNew={() => create()}
 *     onDetach={(id) => detach(id)}
 *   />
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import RippleButton from './RippleButton';

export interface TabItem {
  id: string;
  title: string;
  icon?: React.ReactNode;
  isActive: boolean;
  paneCount?: number; // optional badge (e.g. terminal pane count)
  isRenaming?: boolean;
  renameValue?: string;
  canClose?: boolean; // default: true (except last tab)
  canDrag?: boolean; // default: true (except single tab)
}

export interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onTabClick: (id: string) => void;
  onTabClose?: (id: string) => void;
  onTabDragStart?: (e: React.DragEvent, id: string) => void;
  onTabDrag?: (e: React.DragEvent, title: string) => void;
  onTabDragEnd?: (e: React.DragEvent) => void;
  onNew: () => void;
  onDetach?: (id: string) => void;
  onRename?: (id: string) => void;
  onRenameChange?: (value: string) => void;
  onRenameConfirm?: () => void;
  onRenameCancel?: () => void;
  renderContextMenu?: (id: string, x: number, y: number, close: () => void) => React.ReactNode;
  extraActions?: React.ReactNode; // additional buttons after + (e.g. history clock)
  rippleColor?: string; // CSS color for ripple (default: rgba(255,255,255,0.25))
  className?: string; // optional wrapper class
  textColor?: string; // CSS color for inactive tab text (default: var(--vscode-descriptionForeground))
  accentColor?: string; // CSS color for active tab / focus (default: var(--vscode-list-activeSelectionBackground))
  renameBorderColor?: string; // CSS color for rename input border (optional)
  /**
   * Glassmorphism background opacity (0.02–0.15).
   * Controls the transparency of the floating pill-shaped container.
   * Default: 0.06 (subtle glass effect).
   */
  glassOpacity?: number;
  /**
   * Tab bar position relative to the content area.
   * 'top' = above content, 'bottom' = below content (default).
   */
  position?: 'top' | 'bottom';
}

export default function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabDragStart,
  onTabDrag,
  onTabDragEnd,
  onNew,
  onDetach,
  onRename,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  renderContextMenu,
  extraActions,
  rippleColor = 'rgba(255,255,255,0.25)',
  className,
  textColor = 'var(--vscode-descriptionForeground)',
  accentColor = 'var(--vscode-list-activeSelectionBackground)',
  renameBorderColor,
  glassOpacity = 0.06,
  position = 'bottom',
}: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── Apple-style sliding selection indicator ──────────────────────
  const [indicatorPos, setIndicatorPos] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const activeEl = tabRefsRef.current.get(activeTabId ?? '');
    const scroller = scrollRef.current;
    if (!activeEl || !scroller) return;

    const updatePos = () => {
      const tabRect = activeEl.getBoundingClientRect();
      const scrollRect = scroller.getBoundingClientRect();
      const left = tabRect.left - scrollRect.left;
      const width = tabRect.width;
      setIndicatorPos({ left, width });
    };

    updatePos();

    const handleResize = () => updatePos();
    const handleScroll = () => updatePos();
    window.addEventListener('resize', handleResize);
    scroller.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('resize', handleResize);
      scroller.removeEventListener('scroll', handleScroll);
    };
  }, [activeTabId, tabs]);

  // ── Scroll active tab into view ──────────────────────────────────
  useEffect(() => {
    const activeEl = tabRefsRef.current.get(activeTabId ?? '');
    activeEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  // ── Gradient fade masks ───────────────────────────────────────────
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

  // ── Drag ghost state (tear-off) ───────────────────────────────────
  const dragTabRef = useRef<{ id: string; title: string } | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    title: string;
    outside: boolean;
  } | null>(null);

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

  const handleDragStart = useCallback(
    (e: React.DragEvent, id: string, title: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab || !tab.canDrag) {
        e.preventDefault();
        return;
      }
      dragTabRef.current = { id, title };
      onTabDragStart?.(e, id);
      e.dataTransfer.effectAllowed = 'move';
      const img = new Image();
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(img, 0, 0);
    },
    [tabs, onTabDragStart]
  );

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) return;
      const title = dragTabRef.current?.title ?? '';
      const outside = isOutsideTabBar(e.clientX, e.clientY);
      setGhost({ x: e.clientX, y: e.clientY, title, outside });
      onTabDrag?.(e, title);
    },
    [isOutsideTabBar, onTabDrag]
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent) => {
      const info = dragTabRef.current;
      dragTabRef.current = null;
      setGhost(null);

      if (!info) return;
      if (e.clientX === 0 && e.clientY === 0) return;

      onTabDragEnd?.(e);
      if (isOutsideTabBar(e.clientX, e.clientY) && onDetach) {
        onDetach(info.id);
      }
    },
    [isOutsideTabBar, onTabDragEnd, onDetach]
  );

  // ── Context menu state ───────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    requestAnimationFrame(() => {
      window.addEventListener('click', handler);
    });
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  if (tabs.length === 0) return null;

  const isLastTab = tabs.length <= 1;

  return (
    <>
      {/* Floating glassmorphism capsule tab bar */}
      <div
        ref={tabBarRef}
        className={`absolute left-0 right-0 ${position === 'top' ? 'top-0 pt-3' : 'bottom-0 pb-3'} flex items-center justify-center z-20 ${className ?? ''}`}
      >
        <div
          className="relative flex items-center overflow-x-auto min-w-0 max-w-[80%] gap-0.5 px-2 py-1.5 rounded-full border border-[var(--vscode-menu-border)]"
          style={{
            scrollbarWidth: 'thin',
            background: `rgba(255,255,255,${glassOpacity})`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          {/* Left gradient fade mask */}
          <div
            className="absolute left-0 top-0 bottom-0 w-10 rounded-l-full pointer-events-none opacity-0 transition-opacity duration-250 ease-out"
            style={{
              background: `linear-gradient(to right, rgba(255,255,255,${glassOpacity * 1.5}), transparent)`,
            }}
            data-scroll-left-fade
          />
          {/* Right gradient fade mask */}
          <div
            className="absolute right-0 top-0 bottom-0 w-10 rounded-r-full pointer-events-none opacity-0 transition-opacity duration-250 ease-out"
            style={{
              background: `linear-gradient(to left, rgba(255,255,255,${glassOpacity * 1.5}), transparent)`,
            }}
            data-scroll-right-fade
          />

          <div
            ref={scrollRef}
            className="flex items-center overflow-x-auto min-w-0 gap-0.5"
            style={{ scrollbarWidth: 'none' }}
          >
            {/* Apple-style sliding selection indicator with glass glow */}
            <div
              className="absolute top-1.5 bottom-1.5 rounded-full pointer-events-none"
              style={{
                left: `calc(8px + ${indicatorPos.left}px)`,
                width: indicatorPos.width,
                background: accentColor,
                boxShadow: `0 0 16px 3px color-mix(in srgb, ${accentColor} 50%, transparent), 0 1px 3px rgba(0,0,0,0.1)`,
                transition: 'left 320ms cubic-bezier(0.34, 1.4, 0.64, 1), width 320ms cubic-bezier(0.34, 1.4, 0.64, 1), box-shadow 200ms ease-out',
              }}
            />

            {tabs.map((tab) => {
              const canClose = tab.canClose ?? !isLastTab;
              const canDrag = tab.canDrag ?? tabs.length > 1;

              return (
                <div
                  key={tab.id}
                  ref={(el) => {
                    if (el) tabRefsRef.current.set(tab.id, el);
                    else tabRefsRef.current.delete(tab.id);
                  }}
                  draggable={canDrag && !tab.isRenaming}
                  onDragStart={(e) => handleDragStart(e, tab.id, tab.title)}
                  onDrag={handleDrag}
                  onDragEnd={handleDragEnd}
                  onClick={() => onTabClick(tab.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                  }}
                  className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer shrink-0 transition-all duration-200 ${
                    tab.isActive
                      ? 'text-[var(--vscode-foreground)]'
                      : `text-[${textColor}] hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--vscode-foreground)]`
                  }`}
                >
                  {tab.isRenaming ? (
                    <input
                      value={tab.renameValue ?? ''}
                      onChange={(e) => onRenameChange?.(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (handleNativeSelectAll(e)) return;
                        if (e.key === 'Enter') onRenameConfirm?.();
                        else if (e.key === 'Escape') onRenameCancel?.();
                      }}
                      onBlur={onRenameConfirm}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[13px] font-medium border rounded px-1.5 py-0.5 outline-none w-full text-center bg-[var(--vscode-editor-background)]"
                      style={{
                        borderColor: renameBorderColor ?? accentColor,
                      }}
                    />
                  ) : (
                    <>
                      {tab.icon && (
                        <span className={`shrink-0 transition-all duration-200 ${
                          tab.isActive ? 'opacity-90 scale-[1.02]' : 'opacity-70 group-hover:opacity-80'
                        }`}>{tab.icon}</span>
                      )}
                      <span className={`text-[13px] font-medium flex-1 min-w-0 truncate max-w-[140px] transition-all duration-200 ${
                        tab.isActive ? 'tracking-wide' : ''
                      }`}>
                        {tab.title}
                      </span>

                      {tab.paneCount && tab.paneCount > 1 && (
                        <span className={`text-[11px] shrink-0 transition-all duration-200 ${
                          tab.isActive ? 'opacity-60' : 'opacity-50'
                        }`}>
                          {tab.paneCount}
                        </span>
                      )}

                      {canClose && onTabClose && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTabClose(tab.id);
                          }}
                          className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-full transition-all duration-150 hover:bg-[rgba(255,255,255,0.15)] hover:scale-110 ${
                            tab.isActive
                              ? 'opacity-70'
                              : 'opacity-0 group-hover:opacity-70'
                          }`}
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* `+` button — outside scroll container, always visible */}
          <RippleButton
            onClick={onNew}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[var(--vscode-descriptionForeground)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--vscode-foreground)] transition-colors duration-75 cursor-pointer"
            rippleColor={rippleColor}
            rippleDuration={500}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </RippleButton>

          {/* Extra actions (history, etc.) */}
          {extraActions}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && renderContextMenu?.(
        contextMenu.tabId,
        contextMenu.x,
        contextMenu.y,
        () => setContextMenu(null)
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
              {ghost.outside && onDetach && (
                <span className="text-tiny text-[var(--vscode-focusBorder)]">
                  Release to detach
                </span>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}