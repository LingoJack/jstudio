import { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { getTerminalTheme } from '../../lib/terminalThemes';
import TerminalTabs from './TerminalTabs';
import PaneLayoutView from './PaneLayoutView';
import { usePaneShortcuts } from './usePaneShortcuts';
import '@xterm/xterm/css/xterm.css';

/**
 * TerminalPanel — top-level container for the terminal view.
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │  TerminalTabs (group tab bar)         │
 *   ├──────────────────────────────────────┤
 *   │                                      │
 *   │  PaneLayoutView (active group)       │
 *   │  ┌──────────┬──────────┐             │
 *   │  │  Pane A  │  Pane B  │             │
 *   │  │ (active) ├──────────┤             │
 *   │  │          │  Pane C  │             │
 *   │  └──────────┴──────────┘             │
 *   │                                      │
 *   └──────────────────────────────────────┘
 *
 * The heavy lifting (Terminal lifecycle, PTY wiring, WebGL/trail setup,
 * pane rendering) lives in `PaneLayoutView`.  This component handles:
 *   - Rendering the tab bar + pane area
 *   - Activating pane split keyboard shortcuts
 *   - Empty state (no sessions)
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
  useEffect(() => {
    if (!hasSessions) {
      createSession();
    }
  }, [hasSessions, createSession]);

  // While the first session is being created, show a minimal loading shell
  // so the tab bar is visible immediately.
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
          sessionIds={groupSessionIds}
          activeSessionId={activeGroup.activeSessionId}
          layout={activeGroup.layout}
          hidden={hidden}
        />
      </div>
    </div>
  );
}
