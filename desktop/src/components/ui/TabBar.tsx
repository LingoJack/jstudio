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

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import RippleButton from './RippleButton';

/**
 * Tab geometry — single source of truth for tab sizing.
 *
 * All tabs share a fixed width so the capsule stays uniform regardless of
 * title length. `TAB_WIDTH_PX` must match the `w-[Npx]` class on each tab
 * and the sliding indicator's width.
 *
 * `TAB_BAR_OVERLAY_HEIGHT` is the total vertical space the floating tab
 * bar overlay webview occupies. It must comfortably fit the outer padding
 * (pt-2.5 = 10px top / pb-3.5 = 14px bottom) + the pill (py-1.5*2 + tab
 * content + 1px border ≈ 42-44px) + buffer for the pill's drop shadow
 * and sub-pixel rendering. 64px gives ~8px of shadow/breathing room
 * beyond the pill itself, preventing the glass capsule's rounded corners
 * from being clipped by the overlay webview's bounds.
 */
const TAB_WIDTH_PX = 130;
export const TAB_BAR_OVERLAY_HEIGHT = 64;

/** Horizontal padding of the pill container (matches `px-2` below). */
const PILL_PAD_X_PX = 8;

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
  rippleColor?: string; // CSS color for ripple (default: 20% foreground, theme-adaptive)
  className?: string; // optional wrapper class
  textColor?: string; // CSS color for inactive tab text (default: var(--vscode-descriptionForeground))
  accentColor?: string; // CSS color for active tab indicator / rename border fallback (default: var(--vscode-list-activeSelectionBackground))
  renameBorderColor?: string; // CSS color for rename input border (optional)
  /**
   * Glassmorphism background opacity (0.02–0.15).
   * Controls the transparency of the floating pill-shaped container.
   * Default: 0.06 (subtle glass effect).
   */
  glassOpacity?: number;
  /**
   * Max width of the capsule (any CSS length). Default '80%'.
   * DocumentTabs narrows it when the outline panel is open so the capsule
   * never reaches into the panel's zone.
   */
  maxWidth?: string;
  /**
   * Tab bar position relative to the content area.
   * 'top' = above content, 'bottom' = below content (default).
   * 'titlebar' = docked inline inside the app title bar (portaled by the
   * caller) — renders without the absolute floating wrapper.
   */
  position?: 'top' | 'bottom' | 'titlebar';
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
  rippleColor = 'color-mix(in srgb, var(--vscode-foreground) 20%, transparent)',
  className,
  textColor = 'var(--vscode-descriptionForeground)',
  accentColor = 'var(--vscode-list-activeSelectionBackground)',
  renameBorderColor,
  glassOpacity = 0.06,
  position = 'bottom',
  maxWidth = '80%',
}: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── Apple-style sliding selection indicator ──────────────────────
  // Uses `transform: translateX()` (compositor-thread) instead of `left`
  // (main-thread layout) so the slide stays smooth even when the main
  // thread is blocked by heavy work (e.g. ProseMirror instance creation
  // during a large-document tab switch). `useLayoutEffect` runs the
  // position measurement BEFORE passive effects (where SectionEditor
  // creates its ProseMirror instances), so the indicator is positioned
  // and its transition starts before the blocking work begins.
  /** `null` = no tab to highlight (e.g. the active tab is a terminal one, or
   *  the caller hides it) — the indicator is then hidden instead of being
   *  left stranded at a stale offset, which reads as a stray light pill. */
  const [indicatorLeft, setIndicatorLeft] = useState<number | null>(null);
  // Stable signature of tab order/identity — avoids re-running the layout
  // effect on every parent render (tabs is a fresh array each render).
  const tabSignature = tabs.map((t) => t.id).join('|');

  useLayoutEffect(() => {
    const activeEl = tabRefsRef.current.get(activeTabId ?? '');
    const scroller = scrollRef.current;
    if (!activeEl || !scroller) {
      setIndicatorLeft(null);
      return;
    }

    const updatePos = () => {
      const tabRect = activeEl.getBoundingClientRect();
      const scrollRect = scroller.getBoundingClientRect();
      const left = tabRect.left - scrollRect.left;
      setIndicatorLeft((prev) => (prev === left ? prev : left));
    };

    updatePos();

    // Throttle scroll-driven updates to one per frame.
    let raf = 0;
    const handleScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        updatePos();
        raf = 0;
      });
    };
    const handleResize = () => updatePos();
    window.addEventListener('resize', handleResize);
    scroller.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('resize', handleResize);
      scroller.removeEventListener('scroll', handleScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [activeTabId, tabSignature]);

  // ── Scroll active tab into view ──────────────────────────────────
  // Manual horizontal scrolling on the INNER scroller only. Deliberately not
  // `scrollIntoView()`: that walks up every scrollable ancestor, and the
  // capsule itself is one — `overflow-x: auto` forces `overflow-y` to
  // compute to `auto`, so it is scrollable on BOTH axes. Any sub-pixel
  // height difference (a closing tab changing the content height, the
  // capsule's own horizontal scrollbar eating clientHeight) made it nudge
  // the capsule vertically for one frame, which flashed a scrollbar strip
  // along the capsule's bottom edge.
  useEffect(() => {
    const activeEl = tabRefsRef.current.get(activeTabId ?? '');
    const scroller = scrollRef.current;
    if (!activeEl || !scroller) return;

    const tabRect = activeEl.getBoundingClientRect();
    const viewRect = scroller.getBoundingClientRect();
    if (tabRect.left < viewRect.left) {
      scroller.scrollLeft += tabRect.left - viewRect.left;
    } else if (tabRect.right > viewRect.right) {
      scroller.scrollLeft += tabRect.right - viewRect.right;
    }
  }, [activeTabId, tabSignature]);

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
    // `tabSignature` (not `[]`): closing a tab changes whether the strip
    // still overflows, and the fades would otherwise keep their stale
    // opacity until the next scroll/resize — a gradient band left hanging
    // over one end of the capsule.
  }, [tabSignature]);

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
        className={
          position === 'titlebar'
            ? // pointer-events-NONE is required: this wrapper is a FULL-WIDTH
              // strip across the title bar — with `auto` it swallows every
              // mousedown there, killing window dragging and double-click
              // maximize (the bar's own drag region lives underneath).
              `w-full flex items-center justify-center pointer-events-none ${className ?? ''}`
            : `absolute left-0 right-0 ${position === 'top' ? 'top-0 pt-1' : 'bottom-0 pb-3.5'} flex items-center justify-center z-20 ${className ?? ''}`
        }
      >
        <div
          // Only the capsule itself is interactive in titlebar mode; it is
          // excluded from the window drag region so grabbing it doesn't move
          // the window (and its own drag-to-detach keeps working).
          {...(position === 'titlebar' ? { 'data-tauri-drag-region': false } : {})}
          // `scrollbar-none`: hide the native scrollbar WITHOUT disabling
          // scrolling — both this capsule and the inner strip below are
          // horizontal scroll containers, and the global
          // `::-webkit-scrollbar { height: 10px }` rule painted a 10px strip
          // along the bottom edge of whichever one overflowed. It appeared
          // for a single frame whenever the tab count changed (e.g. closing
          // a tab), reading as a white flash under the tabs.
          className={`scrollbar-none relative flex items-center overflow-x-auto min-w-0 gap-0.5 px-2 py-1.5 rounded-full ${
            // Docked mode: straddle the title bar's bottom edge — the capsule
            // (~46px) is taller than the 36px bar, so it hangs below it
            // instead of being clipped by the window frame.
            position === 'titlebar' ? 'translate-y-1/2 pointer-events-auto' : ''
          }`}
          style={{
            maxWidth,
            /* 边框对齐编辑器块级容器（diagram/code/table figure），
               但降到 55% 透明度——浅色主题下满强度描边会让白胶囊显得生硬 */
            border: '1px solid color-mix(in srgb, var(--jstudio-block-line-strong) 55%, transparent)',
            /* 玻璃底色跟随主题 editor-background（ink-light 下呈米色而非白色），
               与文档底色融合；opacity 由设置驱动 */
            background: `color-mix(in srgb, var(--vscode-editor-background) ${glassOpacity * 100}%, transparent)`,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            /* 投影用前景色低透明度混合而非写死黑色：浅色主题下淡、
               深色主题下自然变暗，胶囊不再那么"浮" */
            boxShadow: '0 2px 8px color-mix(in srgb, var(--vscode-foreground) 8%, transparent)',
          }}
        >
          {/* Left gradient fade mask */}
          <div
            className="absolute left-0 top-0 bottom-0 w-10 rounded-l-full pointer-events-none opacity-0 transition-opacity duration-250 ease-out"
            style={{
              background: `linear-gradient(to right, color-mix(in srgb, var(--vscode-editor-background) ${glassOpacity * 100}%, transparent), transparent)`,
            }}
            data-scroll-left-fade
          />
          {/* Right gradient fade mask */}
          <div
            className="absolute right-0 top-0 bottom-0 w-10 rounded-r-full pointer-events-none opacity-0 transition-opacity duration-250 ease-out"
            style={{
              background: `linear-gradient(to left, color-mix(in srgb, var(--vscode-editor-background) ${glassOpacity * 100}%, transparent), transparent)`,
            }}
            data-scroll-right-fade
          />

          <div
            ref={scrollRef}
            className="scrollbar-none flex items-center overflow-x-auto min-w-0 gap-0.5"
          >
            {/* Apple-style sliding selection indicator with glass glow.
                Uses transform (compositor-thread) so the slide animation
                stays smooth even when the main thread is blocked. */}
            <div
              className="absolute top-1.5 bottom-1.5 rounded-full pointer-events-none"
              style={{
                left: `${PILL_PAD_X_PX}px`,
                width: `${TAB_WIDTH_PX}px`,
                background: accentColor,
                boxShadow: `0 0 12px 2px color-mix(in srgb, ${accentColor} 40%, transparent)`,
                transform: `translateX(${indicatorLeft ?? 0}px)`,
                // Hidden (not merely parked) when there is no active tab to
                // highlight — otherwise it keeps tinting whatever tab slid
                // into its old offset after a close.
                opacity: indicatorLeft === null ? 0 : 1,
                transition:
                  'transform 220ms cubic-bezier(0.33, 1.15, 0.5, 1), opacity 120ms linear, box-shadow 180ms ease-out',
                willChange: 'transform',
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
                  onAuxClick={(e) => {
                    // Middle-click closes the tab (browser convention)
                    if (e.button === 1 && canClose && onTabClose) {
                      e.preventDefault();
                      onTabClose(tab.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                  }}
                  className={`group relative flex items-center gap-1.5 w-[130px] px-3 py-1.5 rounded-full cursor-pointer shrink-0 transition-colors duration-150 ${
                    tab.isActive
                      ? 'text-[var(--vscode-foreground)]'
                      : `text-[${textColor}] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] hover:text-[var(--vscode-foreground)]`
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
                      className="text-[12px] font-medium border rounded px-1.5 py-0.5 outline-none w-full text-center bg-[var(--vscode-editor-background)]"
                      style={{
                        borderColor: renameBorderColor ?? accentColor,
                      }}
                    />
                  ) : (
                    <>
                      {tab.icon && (
                        <span className={`shrink-0 transition-opacity duration-150 ${
                          tab.isActive ? 'opacity-90' : 'opacity-70 group-hover:opacity-80'
                        }`}>{tab.icon}</span>
                      )}
                      <span className="text-[12px] font-medium flex-1 min-w-0 truncate text-center">
                        {tab.title}
                      </span>

                      {tab.paneCount && tab.paneCount > 1 && (
                        <span className={`text-[11px] shrink-0 transition-opacity duration-150 ${
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
                          className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-full transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_15%,transparent)] hover:scale-110 ${
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
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[var(--vscode-descriptionForeground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_10%,transparent)] hover:text-[var(--vscode-foreground)] transition-colors duration-75 cursor-pointer"
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