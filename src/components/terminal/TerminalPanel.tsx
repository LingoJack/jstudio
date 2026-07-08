import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { getTerminalThemeFromAppTheme } from '../../lib/terminal/themes';
import TerminalTabs from './TerminalTabs';
import PaneLayoutView from './PaneLayoutView';
import '@xterm/xterm/css/xterm.css';

/**
 * TerminalPanel — top-level container for the terminal view.
 *
 * Always renders its own `<TerminalTabs />` tab bar.
 * NOTE: All keyboard shortcuts are now handled centrally by ShortcutManager.
 */
export default function TerminalPanel({ hidden }: { hidden?: boolean }) {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const sessions = useStore((s) => s.sessions);
  const createSession = useStore((s) => s.createSession);
  const appThemeIdDark = useStore((s) => s.appThemeIdDark);
  const appThemeIdLight = useStore((s) => s.appThemeIdLight);
  const isDarkMode = useStore((s) => s.isDarkMode);

  // Terminal theme follows app theme (same IDs: jstudio-dark, jstudio-light, ink-dark, ink-light)
  const appThemeId = isDarkMode ? appThemeIdDark : appThemeIdLight;
  const theme = getTerminalThemeFromAppTheme(appThemeId, isDarkMode);

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
        className="w-full h-full flex flex-col relative overflow-hidden"
        style={{ background: theme.ui.panelBg }}
      >
        {/* Tab bar 悬浮在内容上方 */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <div className="pointer-events-auto">
            <TerminalTabs />
          </div>
        </div>
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
      className="w-full h-full flex flex-col relative overflow-hidden"
      style={{ background: theme.ui.panelBg }}
    >
      {/* Tab bar 悬浮在内容上方 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <TerminalTabs />
        </div>
      </div>
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
