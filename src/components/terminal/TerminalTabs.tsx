import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { eventToBinding, resolveBinding } from '../../lib/shortcuts/keyboardShortcuts';
import { createTerminalWindow } from '../../lib/windows/terminalDetach';
import { getTerminalTheme } from '../../lib/terminal/themes';
import { Plus, X, Clock, FolderOpen, Trash2 } from 'lucide-react';
import type { TerminalSession } from '../../store/terminalSlice';
import TerminalTabContextMenu from './TerminalTabContextMenu';

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Determine the display title for a session, in priority order:
 *   1. User rename (customTitle)
 *   2. OSC auto-detected title (autoTitle) — formatted if too long
 *   3. Working directory basename
 *   4. "Terminal"
 */
function getDisplayTitle(session: TerminalSession): string {
  if (session.customTitle) return session.customTitle;

  if (session.autoTitle) {
    return formatAutoTitle(session.autoTitle);
  }

  return getCwdBasename(session.cwd);
}

/** Extract a readable basename from a working directory path. */
function getCwdBasename(cwd: string): string {
  if (!cwd || cwd === '~' || cwd === '$HOME') return 'Home';
  const parts = cwd.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || cwd;
}

/**
 * Format an OSC-detected title for display. The shell may send:
 *   - "user@host: ~/path"        → extract path basename
 *   - "node server.js"           → keep as-is if short, compress if long
 *   - "zsh" / "bash"             → ignore, fall through to cwd
 */
function formatAutoTitle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Shell-specific titles like "zsh", "bash", "-zsh" are noise.
  if (/^-?(zsh|bash|fish|sh|dash)$/.test(trimmed)) return '';

  // "user@host: path" — extract path
  const colonMatch = trimmed.match(/^[^@\s]+@[^:\s]+:\s*(.+)$/);
  if (colonMatch) {
    return getCwdBasename(colonMatch[1]);
  }

  // "user@host" only — noise
  if (/^[^@\s]+@[^@\s]+$/.test(trimmed)) return '';

  // Compress long command strings: "npm run dev something long..."
  const MAX = 22;
  if (trimmed.length > MAX) {
    const head = trimmed.slice(0, Math.ceil(MAX * 0.6));
    const tail = trimmed.slice(-Math.floor(MAX * 0.35));
    return `${head}…${tail}`;
  }

  return trimmed;
}

// ── Component ──────────────────────────────────────────────────────

/**
 * TerminalTabs — VS Code-style tab bar for terminal pane groups.
 *
 * Features:
 *   - Right-click tab → context menu (Rename / Close)
 *   - Inline rename: type + Enter/blur to save, Escape to cancel
 *   - Smart title: custom rename > OSC auto title > cwd basename
 *   - `+` button → new tab
 *   - Clock button → dropdown of recent working directories (max 10)
 *
 * Keyboard shortcuts (resolved from lib/shortcuts.ts — user-customizable):
 *   Cmd/Ctrl + T                 — new tab
 *   Cmd/Ctrl + Shift + ← / →     — cycle tabs
 *   Cmd/Ctrl + Opt/Alt + ← / →   — cycle tabs (secondary)
 */
export default function TerminalTabs() {
  const { t } = useI18n();
  const groups = useStore((s) => s.groups);
  const sessions = useStore((s) => s.sessions);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const recentDirs = useStore((s) => s.recentDirs);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const closeSession = useStore((s) => s.closeSession);
  const createSession = useStore((s) => s.createSession);
  const renameSession = useStore((s) => s.renameSession);
  // Workspace: sync activeTabId when switching terminal groups.
  const wsTabs = useStore((s) => s.tabs);
  const wsSetActiveTab = useStore((s) => s.setActiveTab);

  // ── Terminal theme: the tab bar follows the terminal palette so it
  // feels native to the selected theme (not the editor's VSCode vars).
  // The active tab uses `panelBg` — identical to the xterm content area
  // below — so content visually "overflows" up into the active tab with
  // no divider between them.
  const terminalThemeIdDark = useStore((s) => s.terminalThemeIdDark);
  const terminalThemeIdLight = useStore((s) => s.terminalThemeIdLight);
  const isDarkMode = useStore((s) => s.isDarkMode);
  const theme = getTerminalTheme(
    isDarkMode ? terminalThemeIdDark : terminalThemeIdLight,
  );

  /**
   * Switch to a terminal session AND sync the workspace active tab.
   * This keeps DocumentTabs and TerminalTabs in agreement about which
   * tab is focused, so the global cycle shortcut (Cmd+Option+←/→)
   * knows the correct anchor point.
   */
  const switchSession = (sessionId: string) => {
    setActiveSession(sessionId);
    // Find the workspace tab for the group that owns this session.
    const group = groups.find((g) => g.activeSessionId === sessionId);
    if (group) {
      const wsTab = wsTabs.find(
        (t) => t.kind === 'terminal' && t.groupId === group.id,
      );
      if (wsTab) wsSetActiveTab(wsTab.id);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    groupId: string;
  } | null>(null);

  // Inline rename state
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // History dropdown state
  const [showHistory, setShowHistory] = useState(false);
  const [historyPos, setHistoryPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Tab tear-off (drag a tab out of the tab strip → new OS window) ──
  // Tracks the in-flight drag. `outside` flips true once the cursor leaves
  // the tab strip's bounds (the horizontal tab bar), which highlights the
  // ghost and arms detach-on-release. Dragging down into the terminal area
  // counts as "outside" too, since it left the strip.
  const dragGroupId = useRef<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    title: string;
    outside: boolean;
  } | null>(null);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const binding = eventToBinding(e);
      if (!binding) return;

      const ov = useStore.getState().keyboardShortcuts;

      // newTab
      if (binding === resolveBinding('terminal.newTab', ov)) {
        e.preventDefault();
        e.stopPropagation();
        createSession();
        return;
      }

      // cycleTabLeft / cycleTabRight — now use the global workspace
      // shortcut IDs (app.cycleTabLeft / app.cycleTabRight).
      if (
        binding === resolveBinding('app.cycleTabLeft', ov) ||
        (e.altKey && e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey))
      ) {
        if (groups.length < 2) return;
        e.preventDefault();
        e.stopPropagation();

        const idx = groups.findIndex((g) => g.id === activeGroupId);
        if (idx === -1) return;

        const next = (idx - 1 + groups.length) % groups.length;
        switchSession(groups[next].activeSessionId);
        return;
      }
      if (
        binding === resolveBinding('app.cycleTabRight', ov) ||
        (e.altKey && e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey))
      ) {
        if (groups.length < 2) return;
        e.preventDefault();
        e.stopPropagation();

        const idx = groups.findIndex((g) => g.id === activeGroupId);
        if (idx === -1) return;

        const next = (idx + 1) % groups.length;
        switchSession(groups[next].activeSessionId);
        return;
      }

      // detachTab — tear the active tab off into a new OS window
      if (binding === resolveBinding('terminal.detachTab', ov)) {
        if (groups.length < 2) return;
        if (!activeGroupId) return;
        e.preventDefault();
        e.stopPropagation();
        createTerminalWindow(activeGroupId);
        return;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [groups, activeGroupId, setActiveSession, createSession, wsTabs, wsSetActiveTab]);

  // ── Scroll active tab into view ──────────────────────────────────
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeGroupId]);

  // ── Focus rename input when entering rename mode ─────────────────
  useEffect(() => {
    if (renamingGroupId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingGroupId]);

  // ── Close context menu on outside click ─────────────────────────
  useEffect(() => {
    if (!contextMenu) return;

    const handler = () => {
      setContextMenu(null);
    };

    // Use nextTick to avoid the right-click event itself
    requestAnimationFrame(() => {
      window.addEventListener('click', handler);
    });
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // ── Rename handlers ──────────────────────────────────────────────
  const startRename = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      const session = sessions.find((s) => s.id === group.activeSessionId);
      if (!session) return;
      setRenameValue(session.customTitle ?? getDisplayTitle(session));
      setRenamingGroupId(groupId);
    },
    [groups, sessions],
  );

  const confirmRename = useCallback(() => {
    if (!renamingGroupId) return;
    const group = groups.find((g) => g.id === renamingGroupId);
    if (group) {
      renameSession(group.activeSessionId, renameValue);
    }
    setRenamingGroupId(null);
  }, [renamingGroupId, renameValue, groups, renameSession]);

  const cancelRename = useCallback(() => {
    setRenamingGroupId(null);
  }, []);

  // ── History dropdown (hover-triggered) ───────────────────────────
  const openHistory = useCallback(() => {
    if (historyCloseTimer.current) {
      clearTimeout(historyCloseTimer.current);
      historyCloseTimer.current = null;
    }
    if (historyBtnRef.current) {
      const rect = historyBtnRef.current.getBoundingClientRect();
      setHistoryPos({ x: rect.left, y: rect.bottom + 4 });
    }
    setShowHistory(true);
    setContextMenu(null);
  }, []);

  const scheduleCloseHistory = useCallback(() => {
    if (historyCloseTimer.current) clearTimeout(historyCloseTimer.current);
    historyCloseTimer.current = setTimeout(() => setShowHistory(false), 200);
  }, []);

  const handlePickRecentDir = useCallback(
    (cwd: string) => {
      createSession(undefined, { cwd });
      setShowHistory(false);
    },
    [createSession],
  );

  const clearRecentDirs = useStore((s) => s.clearRecentDirs);

  // ── Tab tear-off drag handlers ───────────────────────────────────
  // HTML5 drag can't truly drag content into a new OS window, so we detect
  // when the cursor leaves the tab strip's bounds and, on drop, spawn a new
  // window at the release point (kitty-style detach_window). Leaving the
  // strip in any direction — including down into the terminal area — arms
  // the detach.
  const handleTabDragStart = useCallback(
    (e: React.DragEvent, groupId: string) => {
      // Never detach the only tab — the parent would auto-respawn one.
      if (groups.length < 2) {
        e.preventDefault();
        return;
      }
      dragGroupId.current = groupId;
      e.dataTransfer.effectAllowed = 'move';
      // Suppress the browser's default drag image (a faded tab clone) so our
      // custom ghost is the only thing the user sees.
      const img = new Image();
      img.src =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(img, 0, 0);
    },
    [groups.length],
  );

  // True when the cursor (viewport coords) is outside the tab strip's box.
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

  const handleTabDrag = useCallback(
    (e: React.DragEvent, title: string) => {
      // The final drag event fires with clientX/Y === 0; ignore it.
      if (e.clientX === 0 && e.clientY === 0) return;

      const outside = isOutsideTabBar(e.clientX, e.clientY);
      setGhost({ x: e.clientX, y: e.clientY, title, outside });
    },
    [isOutsideTabBar],
  );

  const handleTabDragEnd = useCallback(
    (e: React.DragEvent) => {
      const groupId = dragGroupId.current;
      dragGroupId.current = null;
      setGhost(null);

      if (!groupId) return;

      // dragend reports the release point; ignore the spurious 0,0 event.
      if (e.clientX === 0 && e.clientY === 0) return;

      if (isOutsideTabBar(e.clientX, e.clientY)) {
        createTerminalWindow(groupId, { x: e.screenX, y: e.screenY });
      }
    },
    [isOutsideTabBar],
  );

  if (groups.length === 0) return null;

  // Hide the close button on the last remaining tab.
  const isLastTab = groups.length <= 1;

  return (
    <>
      <div
        className="shrink-0 flex items-stretch h-9 relative"
        style={{
          background: theme.ui.barBg,
          // CSS vars for children — lets Tailwind arbitrary classes pick
          // up the active terminal-theme palette without inline styles
          // sprinkled on every tab.
          ['--term-panel-bg' as string]: theme.ui.panelBg,
          ['--term-bar-border' as string]: theme.ui.barBorder,
          ['--term-fg' as string]: theme.foreground,
          ['--term-tab-hover' as string]: theme.isDark
            ? 'rgba(255,255,255,0.05)'
            : 'rgba(0,0,0,0.04)',
          ['--term-accent' as string]: theme.blue,
        }}
        ref={tabBarRef}
      >
        {/* Divider line between tab bar and content. Full-width, sitting
            BEHIND the tabs (z-0). The active tab — whose background is
            the same opaque `panelBg` as the content area — covers this
            line under itself, so only inactive areas show the divider.
            This makes the selected tab look like content overflowing up. */}
        <span
          className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: theme.ui.barBorder, zIndex: 0 }}
        />
        {/* Scrollable tab strip (includes trailing `+` so it follows tabs) */}
        <div
          ref={scrollRef}
          className="flex items-stretch overflow-x-auto flex-1 min-w-0 relative"
          style={{ zIndex: 1, scrollbarWidth: 'none' }}
        >
          {groups.map((group) => {
            const isActive = group.id === activeGroupId;
            const session = sessions.find(
              (s) => s.id === group.activeSessionId,
            );
            const title = session ? getDisplayTitle(session) : 'Terminal';
            const paneCount = group.sessionIds.length;
            const isRenaming = renamingGroupId === group.id;

            return (
              <div
                key={group.id}
                ref={isActive ? activeTabRef : null}
                draggable={!isRenaming && groups.length > 1}
                onDragStart={(e) => handleTabDragStart(e, group.id)}
                onDrag={(e) => handleTabDrag(e, title)}
                onDragEnd={handleTabDragEnd}
                onClick={() => switchSession(group.activeSessionId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    groupId: group.id,
                  });
                }}
                className={`group relative flex items-center gap-1.5 pl-3 pr-2 w-[120px] cursor-pointer border-r shrink-0 transition-colors duration-100 ${
                  isActive
                    ? 'bg-[var(--term-panel-bg)] text-[var(--term-fg)]'
                    : 'bg-transparent text-[var(--term-fg)] opacity-60 hover:opacity-90 hover:bg-[var(--term-tab-hover)]'
                }`}
                style={{ borderRightColor: 'var(--term-bar-border)' }}
              >
                {isActive && (
                  <span
                    className="absolute top-0 left-0 right-0 h-0.5"
                    style={{ background: 'var(--term-accent)' }}
                  />
                )}

                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') confirmRename();
                      else if (e.key === 'Escape') cancelRename();
                    }}
                    onBlur={confirmRename}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-medium border rounded px-1 py-0 outline-none w-full text-center"
                    style={{
                      background: theme.background,
                      color: theme.foreground,
                      borderColor: 'var(--term-accent)',
                    }}
                  />
                ) : (
                  <>
                    <span className="text-xs font-medium flex-1 min-w-0 truncate text-center">
                      {title}
                    </span>

                    {paneCount > 1 && (
                      <span className="text-[10px] opacity-50 shrink-0">
                        {paneCount}
                      </span>
                    )}

                    {!isLastTab && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeSession(group.activeSessionId);
                        }}
                        className={`shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all duration-100 hover:bg-[var(--term-tab-hover)] ${
                          isActive
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100'
                        }`}
                        style={{ color: 'var(--term-fg)' }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* `+` and Clock — both follow the last tab */}
          <button
            onClick={() => createSession()}
            className="shrink-0 w-9 flex items-center justify-center text-[var(--term-fg)] opacity-60 hover:opacity-100 hover:bg-[var(--term-tab-hover)] transition-colors cursor-pointer"
            title={t('terminal.newSession')}
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Clock — recent directories, right after `+` */}
          <div
            className="relative shrink-0"
            onMouseEnter={openHistory}
            onMouseLeave={scheduleCloseHistory}
          >
            <button
              ref={historyBtnRef}
              className={`w-9 h-full flex items-center justify-center transition-colors cursor-pointer text-[var(--term-fg)] hover:bg-[var(--term-tab-hover)] ${
                showHistory ? 'opacity-100 bg-[var(--term-tab-hover)]' : 'opacity-60 hover:opacity-100'
              }`}
              title={t('terminal.recentDirs')}
            >
              <Clock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* History dropdown — rendered at root level with fixed position to
          escape overflow-x-auto clipping from the scroll container */}
      {showHistory && (
        <div
          ref={historyRef}
          className="fixed z-[100] min-w-[240px] max-w-[340px] py-1.5 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl"
          style={{ left: historyPos.x, top: historyPos.y }}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => {
            if (historyCloseTimer.current) {
              clearTimeout(historyCloseTimer.current);
              historyCloseTimer.current = null;
            }
          }}
          onMouseLeave={scheduleCloseHistory}
        >
          {recentDirs.length === 0 ? (
            <div className="px-3 py-3 text-center text-[var(--vscode-descriptionForeground)] text-xs">
              {t('terminal.noRecentDirs')}
            </div>
          ) : (
            <>
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
                {t('terminal.recentDirs')}
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {recentDirs.map((dir) => {
                  const basename = getCwdBasename(dir);
                  const parentPath = dir.replace(/\/[^/]*$/, '');
                  return (
                    <button
                      key={dir}
                      onClick={() => handlePickRecentDir(dir)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer hover:bg-[var(--vscode-menu-hoverBackground)] group"
                    >
                      <FolderOpen className="w-3.5 h-3.5 opacity-50 group-hover:opacity-80 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-[var(--vscode-menu-foreground)] truncate">
                          {basename}
                        </div>
                        {parentPath && parentPath !== dir && (
                          <div className="text-[10px] text-[var(--vscode-descriptionForeground)] truncate font-mono leading-tight">
                            {parentPath}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="my-1 border-t border-[var(--vscode-menu-separatorBackground)]" />
              <button
                onClick={() => {
                  clearRecentDirs();
                  setShowHistory(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-menu-hoverBackground)]"
              >
                <Trash2 className="w-3.5 h-3.5 opacity-70 shrink-0" />
                <span className="text-xs">{t('terminal.clearRecent')}</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Right-click context menu (portal-like, rendered at root level) */}
      {contextMenu && (
        <TerminalTabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canDetach={groups.length > 1}
          onRename={() => {
            startRename(contextMenu.groupId);
            setContextMenu(null);
          }}
          onDetach={() => {
            createTerminalWindow(contextMenu.groupId);
            setContextMenu(null);
          }}
          onClose={() => {
            const group = groups.find((g) => g.id === contextMenu.groupId);
            if (group) closeSession(group.activeSessionId);
            setContextMenu(null);
          }}
        />
      )}

      {/* Drag ghost — follows the cursor during a tab tear-off drag.
          Rendered via portal to escape the tab strip's overflow clipping. */}
      {ghost &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none select-none"
            style={{
              left: ghost.x + 12,
              top: ghost.y + 12,
            }}
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
                <span className="text-[10px] text-[var(--vscode-focusBorder)]">
                  {t('terminal.releaseToDetach')}
                </span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
