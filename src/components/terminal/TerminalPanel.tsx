import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { getTerminalTheme } from '../../lib/terminal/themes';
import TerminalTabs from './TerminalTabs';
import PaneLayoutView from './PaneLayoutView';
import { usePaneShortcuts } from './usePaneShortcuts';
import '@xterm/xterm/css/xterm.css';

/**
 * TerminalPanel — top-level container for the terminal view.
 *
 * Always renders its own `<TerminalTabs />` tab bar.
 */
export default function TerminalPanel({ hidden }: { hidden?: boolean }) {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const sessions = useStore((s) => s.sessions);
  const createSession = useStore((s) => s.createSession);
  const terminalThemeIdDark = useStore((s) => s.terminalThemeIdDark);
  const terminalThemeIdLight = useStore((s) => s.terminalThemeIdLight);
  const isDarkMode = useStore((s) => s.isDarkMode);

  // Activate Kitty-style pane keyboard shortcuts.
  usePaneShortcuts();

  const theme = getTerminalTheme(isDarkMode ? terminalThemeIdDark : terminalThemeIdLight);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const hasSessions = activeGroup && activeGroup.sessionIds.length > 0;

  // ── Auto-create: if no sessions exist, spawn one automatically ──
  // Use a ref guard so createSession is only called once, even under
  // React StrictMode (which double-invokes effects in development).
  const initRef = useRef(false);
  useEffect(() => {
    if (!hasSessions && !initRef.current) {
      initRef.current = true;
      createSession();
    }
  }, [hasSessions, createSession]);

  // While the first session is being created, show a minimal loading shell.
  if (!hasSessions) {
    return (
      <div
        className="w-full h-full flex flex-col"
        style={{ background: theme.ui.panelBg }}
      >
        <TerminalTabs />
        <div className="flex-1" />
      </div>
    );
  }

  // ── Resolve session ids for the active group ─────────────────────
  const groupSessionIds = activeGroup.sessionIds.filter((sid) =>
    sessions.some((s) => s.id === sid),
  );

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ background: theme.ui.panelBg }}
    >
      <TerminalTabs />
      <div className="flex-1 min-h-0 overflow-hidden">
        <PaneLayoutView
          groupId={activeGroup.id}
          sessionIds={groupSessionIds}
          activeSessionId={activeGroup.activeSessionId}
          layout={activeGroup.layout}
          resizeState={activeGroup.resizeState}
          hidden={hidden}
        />
      </div>
    </div>
  );
}
