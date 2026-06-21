import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import { eventToBinding, resolveBinding } from '../../lib/shortcuts';
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

      // cycleTabLeft / cycleTabRight
      if (
        binding === resolveBinding('terminal.cycleTabLeft', ov) ||
        (e.altKey && e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey))
      ) {
        if (groups.length < 2) return;
        e.preventDefault();
        e.stopPropagation();

        const idx = groups.findIndex((g) => g.id === activeGroupId);
        if (idx === -1) return;

        const next = (idx - 1 + groups.length) % groups.length;
        setActiveSession(groups[next].activeSessionId);
        return;
      }
      if (
        binding === resolveBinding('terminal.cycleTabRight', ov) ||
        (e.altKey && e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey))
      ) {
        if (groups.length < 2) return;
        e.preventDefault();
        e.stopPropagation();

        const idx = groups.findIndex((g) => g.id === activeGroupId);
        if (idx === -1) return;

        const next = (idx + 1) % groups.length;
        setActiveSession(groups[next].activeSessionId);
        return;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [groups, activeGroupId, setActiveSession, createSession]);

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

  if (groups.length === 0) return null;

  // Hide the close button on the last remaining tab.
  const isLastTab = groups.length <= 1;

  return (
    <>
      <div className="shrink-0 flex items-stretch h-9 border-b border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] relative">
        {/* Scrollable tab strip (includes trailing `+` so it follows tabs) */}
        <div
          ref={scrollRef}
          className="flex items-stretch overflow-x-auto flex-1 min-w-0"
          style={{ scrollbarWidth: 'none' }}
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
                onClick={() => setActiveSession(group.activeSessionId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    groupId: group.id,
                  });
                }}
                className={`group relative flex items-center gap-1.5 pl-3 pr-2 w-[120px] cursor-pointer border-r border-[var(--vscode-sideBar-border)] shrink-0 transition-colors duration-100 ${
                  isActive
                    ? 'bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]'
                    : 'bg-transparent text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-foreground)]'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--vscode-focusBorder)]" />
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
                    className="text-xs font-medium bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-focusBorder)] rounded px-1 py-0 outline-none w-full text-center"
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
                        className={`shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all duration-100 hover:bg-[var(--vscode-toolbar-hoverBackground)] ${
                          isActive
                            ? 'opacity-100 hover:bg-[var(--vscode-toolbar-hoverBackground)]'
                            : 'opacity-0 group-hover:opacity-100'
                        }`}
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
            className="shrink-0 w-9 flex items-center justify-center text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer"
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
              className={`w-9 h-full flex items-center justify-center transition-colors cursor-pointer ${
                showHistory
                  ? 'text-[var(--vscode-foreground)] bg-[var(--vscode-list-hoverBackground)]'
                  : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
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
          onRename={() => {
            startRename(contextMenu.groupId);
            setContextMenu(null);
          }}
          onClose={() => {
            const group = groups.find((g) => g.id === contextMenu.groupId);
            if (group) closeSession(group.activeSessionId);
            setContextMenu(null);
          }}
        />
      )}
    </>
  );
}
