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
export default function TerminalPanel() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const sessions = useStore((s) => s.sessions);
  const createSession = useStore((s) => s.createSession);
  const terminalThemeId = useStore((s) => s.terminalThemeId);

  // Activate Kitty-style pane keyboard shortcuts.
  usePaneShortcuts();

  const theme = getTerminalTheme(terminalThemeId);

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  // ── Empty state ──────────────────────────────────────────────────
  if (!activeGroup || activeGroup.sessionIds.length === 0) {
    return (
      <div
        className="w-full h-full flex flex-col"
        style={{ background: theme.ui.panelBg }}
      >
        <TerminalTabs />
        <div className="flex-1 flex items-center justify-center text-[var(--vscode-descriptionForeground)]">
          <button
            onClick={() => createSession()}
            className="flex flex-col items-center gap-3 p-6 rounded-lg hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer"
          >
            <span className="text-sm">No terminal sessions</span>
            <span className="text-xs opacity-60">
              Click to start a new session
            </span>
          </button>
        </div>
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
        />
      </div>
    </div>
  );
}
