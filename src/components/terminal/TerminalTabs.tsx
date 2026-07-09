import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { createTerminalWindow } from '../../lib/windows/terminalDetach';
import { getTerminalThemeFromAppTheme } from '../../lib/terminal/themes';
import { Clock, FolderOpen, Trash2, Pencil, X, ExternalLink } from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
import TabBar, { type TabItem } from '../ui/TabBar';
import type { TerminalSession } from '../../store/terminalSlice';

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

  // Shell-specific titles like "zsh", "bash" are noise.
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
 * Uses the shared TabBar component with:
 *   - Right-click context menu (Rename / Detach / Close)
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
  const tabBarGlassOpacity = useStore((s) => s.tabBarGlassOpacity);
  const tabBarPosition = useStore((s) => s.tabBarPosition);

  // ── Terminal theme: follows app theme (same IDs: jstudio-dark, jstudio-light, etc.)
  const appThemeIdDark = useStore((s) => s.appThemeIdDark);
  const appThemeIdLight = useStore((s) => s.appThemeIdLight);
  const isDarkMode = useStore((s) => s.isDarkMode);
  const appThemeId = isDarkMode ? appThemeIdDark : appThemeIdLight;
  const theme = getTerminalThemeFromAppTheme(appThemeId, isDarkMode);

  /**
   * Switch to a terminal session AND sync the workspace active tab.
   * This keeps DocumentTabs and TerminalTabs in agreement about which
   * tab is focused, so the global cycle shortcut (Cmd+Option+←/→)
   * knows the correct anchor point.
   */
  const switchSession = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
      // Find the workspace tab for the group that owns this session.
      const group = groups.find((g) => g.activeSessionId === sessionId);
      if (group) {
        const wsTab = wsTabs.find(
          (t) => t.kind === 'terminal' && t.groupId === group.id,
        );
        if (wsTab) wsSetActiveTab(wsTab.id);
      }
    },
    [groups, wsTabs, setActiveSession, wsSetActiveTab]
  );

  // ── Inline rename state ───────────────────────────────────────────
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const startRename = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      const session = sessions.find((s) => s.id === group.activeSessionId);
      if (!session) return;
      setRenameValue(session.customTitle ?? getDisplayTitle(session));
      setRenamingGroupId(groupId);
    },
    [groups, sessions]
  );

  const confirmRename = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (group) {
        renameSession(group.activeSessionId, renameValue);
      }
      setRenamingGroupId(null);
    },
    [groups, renameValue, renameSession]
  );

  const cancelRename = useCallback(() => {
    setRenamingGroupId(null);
  }, []);

  // ── History dropdown (hover-triggered) ───────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [historyPos, setHistoryPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openHistory = useCallback(() => {
    if (historyCloseTimer.current) {
      clearTimeout(historyCloseTimer.current);
      historyCloseTimer.current = null;
    }
    if (historyBtnRef.current) {
      const rect = historyBtnRef.current.getBoundingClientRect();
      const gap = 4;
      if (tabBarPosition === 'top') {
        // Tab bar at top → dropdown opens below
        setHistoryPos({ x: rect.left, y: rect.bottom + gap });
      } else {
        // Tab bar at bottom → dropdown opens above
        setHistoryPos({ x: rect.left, y: rect.top - gap });
      }
    }
    setShowHistory(true);
  }, [tabBarPosition]);

  const scheduleCloseHistory = useCallback(() => {
    if (historyCloseTimer.current) clearTimeout(historyCloseTimer.current);
    historyCloseTimer.current = setTimeout(() => setShowHistory(false), 200);
  }, []);

  const handlePickRecentDir = useCallback(
    (cwd: string) => {
      createSession(undefined, { cwd });
      setShowHistory(false);
    },
    [createSession]
  );

  const clearRecentDirs = useStore((s) => s.clearRecentDirs);

  // ── Map groups → TabItem ──────────────────────────────────────────
  const tabItems: TabItem[] = groups.map((group) => {
    const isActive = group.id === activeGroupId;
    const session = sessions.find((s) => s.id === group.activeSessionId);
    const title = session ? getDisplayTitle(session) : 'Terminal';
    const paneCount = group.sessionIds.length;
    const isRenaming = renamingGroupId === group.id;

    return {
      id: group.id,
      title,
      isActive,
      paneCount,
      isRenaming,
      renameValue: isRenaming ? renameValue : undefined,
      canClose: groups.length > 1,
      canDrag: groups.length > 1,
    };
  });

  // ── Detach handler ───────────────────────────────────────────────
  const handleDetach = useCallback((groupId: string) => {
    createTerminalWindow(groupId);
  }, []);

  // ── Context menu renderer ───────────────────────────────────────
  const renderContextMenu = useCallback(
    (groupId: string, x: number, y: number, close: () => void) => {
      return (
        <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
          <MenuItem
            icon={<Pencil className="w-4 h-4" />}
            onClick={() => {
              startRename(groupId);
              close();
            }}
          >
            {t('terminal.rename')}
          </MenuItem>

          {groups.length > 1 && (
            <MenuItem
              icon={<ExternalLink className="w-4 h-4" />}
              onClick={() => {
                createTerminalWindow(groupId);
                close();
              }}
            >
              {t('terminal.detachTab')}
            </MenuItem>
          )}

          <MenuDivider />

          <MenuItem
            variant="danger"
            icon={<X className="w-4 h-4" />}
            onClick={() => {
              const group = groups.find((g) => g.id === groupId);
              if (group) closeSession(group.activeSessionId);
              close();
            }}
          >
            {t('terminal.close')}
          </MenuItem>
        </MenuList>
      );
    },
    [groups, startRename, closeSession, t]
  );

  // ── Extra actions (history dropdown trigger) ──────────────────────
  const extraActions = (
    <div
      className="relative shrink-0"
      onMouseEnter={openHistory}
      onMouseLeave={scheduleCloseHistory}
    >
      <button
        ref={historyBtnRef}
        className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors duration-75 cursor-pointer text-[var(--term-fg)] hover:bg-[rgba(255,255,255,0.1)] ${
          showHistory ? 'opacity-100 bg-[rgba(255,255,255,0.1)]' : 'opacity-60 hover:opacity-100'
        }`}
        title={t('terminal.recentDirs')}
      >
        <Clock className="w-4 h-4" />
      </button>
    </div>
  );

  if (groups.length === 0) return null;

  return (
    <>
      <TabBar
        tabs={tabItems}
        activeTabId={activeGroupId}
        onTabClick={(groupId) => {
          const group = groups.find((g) => g.id === groupId);
          if (group) switchSession(group.activeSessionId);
        }}
        onTabClose={(groupId) => {
          const group = groups.find((g) => g.id === groupId);
          if (group) closeSession(group.activeSessionId);
        }}
        onDetach={handleDetach}
        onRenameChange={setRenameValue}
        onRenameConfirm={() => confirmRename(renamingGroupId ?? '')}
        onRenameCancel={cancelRename}
        onNew={() => createSession()}
        renderContextMenu={renderContextMenu}
        extraActions={extraActions}
        rippleColor="rgba(255,255,255,0.25)"
        textColor="var(--term-fg)"
        accentColor="var(--vscode-list-activeSelectionBackground)"
        renameBorderColor="var(--term-accent)"
        glassOpacity={tabBarGlassOpacity}
        position={tabBarPosition}
      />

      {/* History dropdown — rendered at root level with fixed position to
          escape overflow-x-auto clipping from the scroll container.
          Opens upward since tab bar is at bottom. */}
      {showHistory &&
        createPortal(
          <div
            ref={historyRef}
            className="fixed z-modal min-w-context max-w-context py-1.5 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl"
            style={{ left: historyPos.x, bottom: `calc(100vh - ${historyPos.y}px)` }}
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
                <div className="px-3 pb-1.5 text-tiny font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
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
                            <div className="text-tiny text-[var(--vscode-descriptionForeground)] truncate font-mono leading-tight">
                              {parentPath}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="my-1 border-t border-[var(--vscode-menu-border)] opacity-50" />
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
          </div>,
          document.body
        )}
    </>
  );
}