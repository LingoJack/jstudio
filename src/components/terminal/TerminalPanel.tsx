import { useRef, useEffect } from 'react';
import { WebglAddon } from '@xterm/addon-webgl';
import { useStore } from '../../store/useStore';
import { storage } from '../../lib/storage';
import { getTerminalTheme } from '../../lib/terminalThemes';
import TerminalTabs from './TerminalTabs';
import CursorTrail from './CursorTrail';
import { useTerminalManager } from './useTerminalManager';
import '@xterm/xterm/css/xterm.css';

/**
 * TerminalPanel — top-level container for the terminal view.
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │  TerminalTabs (session tab bar)       │
 *   ├──────────────────────────────────────┤
 *   │                                      │
 *   │  xterm.js (active session)           │
 *   │  + CursorTrail overlay               │
 *   │                                      │
 *   └──────────────────────────────────────┘
 *
 * The heavy lifting (Terminal lifecycle, PTY wiring, WebGL/trail setup)
 * lives in `useTerminalManager`.  This component handles:
 *   - Mounting / switching the active session's DOM container
 *   - Reacting to theme + font changes
 *   - Cleaning up dead sessions
 */
export default function TerminalPanel() {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const terminalThemeId = useStore((s) => s.terminalThemeId);
  const fontFamily = useStore((s) => s.fontId);
  const terminalFontSize = useStore((s) => s.terminalFontSize);

  const theme = getTerminalTheme(terminalThemeId);

  const mountRef = useRef<HTMLDivElement>(null);
  const { terminalsRef, setupTerminal, destroyTerminal, destroyAll } =
    useTerminalManager(fontFamily, terminalFontSize);

  // ── Mount / switch active session ─────────────────────────────────
  useEffect(() => {
    if (!activeSessionId || !mountRef.current) return;

    const entry = setupTerminal(activeSessionId, theme);

    const mount = mountRef.current;
    while (mount.firstChild) mount.removeChild(mount.firstChild);
    mount.appendChild(entry.container);

    const isFirstOpen = !entry.container.classList.contains('xterm-enabled');
    if (isFirstOpen) {
      entry.term.open(entry.container);
      entry.container.classList.add('xterm-enabled');

      // GPU-accelerated renderer
      try {
        const addon = new WebglAddon();
        addon.onContextLoss(() => addon.dispose());
        entry.term.loadAddon(addon);
      } catch {
        // WebGL2 not available — fall back to DOM renderer
      }

      // Kitty-style cursor trail
      try {
        entry.trail = new CursorTrail(entry.term, entry.container, theme.cursor);
        requestAnimationFrame(() => {
          entry.trail?.resize();
          entry.trail?.start();
        });
      } catch {
        entry.trail = null;
      }
    }

    requestAnimationFrame(() => {
      try {
        entry.fit.fit();
        storage
          .ptyResize(activeSessionId, entry.term.cols, entry.term.rows)
          .catch(console.error);
        entry.trail?.resize();
      } catch {
        // ignore
      }
      entry.term.focus();
    });

    return () => {
      if (entry.container.parentElement === mount) {
        mount.removeChild(entry.container);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => destroyAll, [destroyAll]);

  // ── Terminal theme change → live update ───────────────────────────
  useEffect(() => {
    terminalsRef.current.forEach(({ term, trail }) => {
      term.options.theme = {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        cursorAccent: theme.cursorAccent,
        selectionBackground: theme.selectionBackground,
        selectionForeground: theme.selectionForeground,
        black: theme.black,
        red: theme.red,
        green: theme.green,
        yellow: theme.yellow,
        blue: theme.blue,
        magenta: theme.magenta,
        cyan: theme.cyan,
        white: theme.white,
        brightBlack: theme.brightBlack,
        brightRed: theme.brightRed,
        brightGreen: theme.brightGreen,
        brightYellow: theme.brightYellow,
        brightBlue: theme.brightBlue,
        brightMagenta: theme.brightMagenta,
        brightCyan: theme.brightCyan,
        brightWhite: theme.brightWhite,
      };
      trail?.setColor(theme.cursor);
    });
  }, [theme, terminalsRef]);

  // ── Font / size change → update all terminals ─────────────────────
  useEffect(() => {
    terminalsRef.current.forEach(({ term, fit, trail }) => {
      term.options.fontFamily = `'${fontFamily}', 'monaco', monospace`;
      term.options.fontSize = terminalFontSize;

      requestAnimationFrame(() => {
        try {
          fit.fit();
          const sid = [...terminalsRef.current.entries()].find(
            ([, v]) => v.term === term,
          )?.[0];
          if (sid) {
            storage.ptyResize(sid, term.cols, term.rows).catch(console.error);
          }
          trail?.resize();
        } catch {
          // ignore
        }
      });
    });
  }, [fontFamily, terminalFontSize, terminalsRef]);

  // ── Cleanup dead sessions ─────────────────────────────────────────
  useEffect(() => {
    const sessions = useStore.getState().sessions;
    const alive = new Set(sessions.map((s) => s.id));
    terminalsRef.current.forEach((_, id) => {
      if (!alive.has(id)) destroyTerminal(id);
    });
  });

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ background: theme.ui.panelBg }}
    >
      <TerminalTabs />
      <div ref={mountRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
