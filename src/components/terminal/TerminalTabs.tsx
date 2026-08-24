import { useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { createTerminalWindow } from '../../lib/windows/terminalDetach';
import { getTerminalThemeFromAppTheme } from '../../lib/terminal/themes';
import TabBar, { type TabItem } from '../ui/TabBar';
import TerminalRecentDirsDropdown from './TerminalRecentDirsDropdown';
import { TerminalTabContextMenu } from './TerminalTabContextMenu';
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
  const groups = useStore((s) => s.groups);
  const sessions = useStore((s) => s.sessions);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const closeSession = useStore((s) => s.closeSession);
  const createSession = useStore((s) => s.createSession);
  const renameSession = useStore((s) => s.renameSession);
  // Workspace: sync activeTabId when switching terminal groups.
  const wsTabs = useStore((s) => s.tabs);
  const selectTab = useStore((s) => s.selectTab);
  const tabBarGlassOpacity = useStore((s) => s.tabBarGlassOpacity);
  const tabBarPosition = useStore((s) => s.tabBarPosition);

  // ── Terminal theme: follows app theme (same IDs: jstudio-dark, jstudio-light, etc.)
  const appThemeIdDark = useStore((s) => s.appThemeIdDark);
  const appThemeIdLight = useStore((s) => s.appThemeIdLight);
  const isDarkMode = useStore((s) => s.isDarkMode);
  const appThemeId = isDarkMode ? appThemeIdDark : appThemeIdLight;
  const theme = getTerminalThemeFromAppTheme(appThemeId, isDarkMode);

  /**
   * Switch to a terminal group through its workspace tab.
   * selectTab keeps workspace and terminal state in sync.
   */
  const switchGroup = useCallback(
    (groupId: string) => {
      const wsTab = wsTabs.find(
        (t) => t.kind === 'terminal' && t.groupId === groupId,
      );
      if (wsTab) selectTab(wsTab.id);
    },
    [wsTabs, selectTab]
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
        <TerminalTabContextMenu
          groupId={groupId}
          x={x}
          y={y}
          canDetach={groups.length > 1}
          onCloseMenu={close}
          onRename={startRename}
          onDetach={(gid) => createTerminalWindow(gid)}
          onCloseTab={(gid) => {
            const group = groups.find((g) => g.id === gid);
            if (group) closeSession(group.activeSessionId);
          }}
        />
      );
    },
    [groups, startRename, closeSession]
  );

  // ── Extra actions (history dropdown trigger) ──────────────────────
  const extraActions = (
    <TerminalRecentDirsDropdown
      position={tabBarPosition}
      buttonClassName="w-6 h-6 flex items-center justify-center rounded-full transition-colors duration-75 cursor-pointer text-[var(--vscode-descriptionForeground)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--vscode-foreground)] opacity-50 hover:opacity-100"
      buttonActiveClassName="opacity-100 bg-[rgba(255,255,255,0.1)]"
      iconClassName="w-3.5 h-3.5"
    />
  );

  if (groups.length === 0) return null;

  return (
    <>
      <TabBar
        tabs={tabItems}
        activeTabId={activeGroupId}
        onTabClick={switchGroup}
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
        glassOpacity={tabBarGlassOpacity}
        position={tabBarPosition}
      />
    </>
  );
}