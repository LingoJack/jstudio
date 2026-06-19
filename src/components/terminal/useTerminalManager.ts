import { useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useStore } from '../../store/useStore';
import { storage } from '../../lib/storage';
import type { TerminalCursorStyle } from '../../lib/storage';
import { resolveMonospaceFont } from '../../lib/fonts';
import type { TerminalTheme } from '../../lib/terminalThemes';
import type { SessionTerminal } from './types';

/** Try WebGL2 GPU-accelerated renderer; fall back silently. */
function tryEnableWebgl(term: Terminal): boolean {
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => addon.dispose());
    term.loadAddon(addon);
    return true;
  } catch {
    return false;
  }
}

/**
 * useTerminalManager — owns the lifecycle of all xterm.js Terminal instances.
 *
 * Each session gets a cached entry (Terminal + FitAddon + DOM container +
 * CursorTrail).  Switching tabs reuses cached instances — scrollback and
 * state are preserved.
 *
 * Responsibilities:
 *   - Create / destroy Terminal instances
 *   - Wire PTY input/output (Tauri events)
 *   - Enable WebGL2 renderer + cursor trail
 *   - Resize handling (ResizeObserver → pty_resize + trail resize)
 *
 * Returns refs to the instance cache so the parent component can mount /
 * switch the active session's DOM container.
 */
export function useTerminalManager(
  fontId: string,
  terminalFontSize: number,
  cursorStyle: TerminalCursorStyle,
) {
  const removeSessionState = useStore((s) => s.removeSessionState);

  const resolvedFontFamily = resolveMonospaceFont(fontId);

  const terminalsRef = useRef<Map<string, SessionTerminal>>(new Map());
  const unlistenRef = useRef<Map<string, Promise<UnlistenFn>[]>>(new Map());

  /** Create (or return cached) Terminal for a session id. */
  const setupTerminal = useCallback(
    (sessionId: string, theme: TerminalTheme): SessionTerminal => {
      const cached = terminalsRef.current.get(sessionId);
      if (cached) return cached;

      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.width = '100%';
      container.style.height = '100%';

      const term = new Terminal({
        fontFamily: `${resolvedFontFamily}, monospace`,
        fontSize: terminalFontSize,
        cursorStyle,
        cursorBlink: true,
        cursorWidth: 2,
        allowProposedApi: true,
        scrollback: 10000,
        // Let the browser figure out the true advance width of each
        // glyph — prevents narrow/wide mismatches on mixed scripts.
        allowTransparency: true,
        theme: {
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
        },
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      // Unicode 11 addon — provides the real width calculation engine.
      // Without loading this addon, the `unicodeVersion: '11'` option above
      // is just a label with no actual width table behind it.  This addon
      // makes emoji (💻🎨) and wide CJK characters correctly occupy 2 cells,
      // matching what the shell expects when laying out box-drawing art.
      const unicode11 = new Unicode11Addon();
      term.loadAddon(unicode11);
      term.unicode.activeVersion = '11';

      // Keyboard input → PTY
      term.onData((data) => {
        storage.ptyWrite(sessionId, data).catch(console.error);
      });

      // Shell title change (OSC 0/2 sequences) → auto title
      term.onTitleChange((title) => {
        useStore.getState().setAutoTitle(sessionId, title);
      });

      // Shell output → terminal
      const unlistenData = listen<{ data: string }>(
        `pty-data-${sessionId}`,
        (e) => term.write(e.payload.data),
      );

      // Shell exit → cleanup
      const unlistenExit = listen(`pty-exit-${sessionId}`, () => {
        removeSessionState(sessionId);
      });

      unlistenRef.current.set(sessionId, [unlistenData, unlistenExit]);

      const entry: SessionTerminal = { term, fit, container };
      terminalsRef.current.set(sessionId, entry);

      // Resize → PTY
      const resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          storage.ptyResize(sessionId, term.cols, term.rows).catch(console.error);
        } catch {
          // ignore
        }
      });
      resizeObserver.observe(container);
      (container as unknown as { _resizeObserver?: ResizeObserver })._resizeObserver =
        resizeObserver;

      return entry;
    },
    [resolvedFontFamily, terminalFontSize, cursorStyle, removeSessionState],
  );

  /** Fully destroy a terminal instance + clean up listeners. */
  const destroyTerminal = useCallback((sessionId: string) => {
    const entry = terminalsRef.current.get(sessionId);
    if (entry) {
      const obs = (entry.container as unknown as { _resizeObserver?: ResizeObserver })
        ._resizeObserver;
      obs?.disconnect();
      entry.term.dispose();
      terminalsRef.current.delete(sessionId);
    }
    const unlistens = unlistenRef.current.get(sessionId);
    if (unlistens) {
      unlistens.forEach((u) => u.then((fn) => fn()).catch(() => {}));
      unlistenRef.current.delete(sessionId);
    }
  }, []);

  /** Destroy all terminals (called on unmount). */
  const destroyAll = useCallback(() => {
    terminalsRef.current.forEach((_, id) => destroyTerminal(id));
  }, [destroyTerminal]);

  return {
    terminalsRef,
    setupTerminal,
    destroyTerminal,
    destroyAll,
    tryEnableWebgl,
  };
}
