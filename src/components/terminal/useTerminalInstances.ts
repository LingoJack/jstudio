/**
 * useTerminalInstances — xterm.js Terminal instance management.
 *
 * Inspired by kitty's Window lifecycle (window.py):
 *   - Create / cache / destroy Terminal instances
 *   - Load addons (FitAddon, SerializeAddon, WebglAddon, Unicode11Addon)
 *   - Configure theme, font, cursor, VT extensions
 *   - Attach input handlers (via useTerminalInput)
 *   - Register with PTY sessions (via usePtySessions)
 *   - ResizeObserver → PTY resize
 *
 * Each session gets a cached entry (Terminal + FitAddon + DOM container +
 * cleanup). Switching tabs reuses cached instances — scrollback and
 * state are preserved.
 */

import { useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { storage } from '../../lib/core/storage';
import { resolveMonospaceFont } from '../../lib/editor/fonts';
import type { TerminalCursorStyle } from '../../types/settings';
import type { TerminalTheme } from '../../lib/terminal/themes';
import type { SessionTerminal } from './types';
import { registerTerminal, unregisterTerminal } from './terminalRegistry';
import type { UsePtySessionsReturn } from './usePtySessions';
import type { UseTerminalInputReturn } from './useTerminalInput';
import { useStore } from '../../store/useStore';

/**
 * Extract a working directory path from a shell OSC title string.
 *
 * Handles common title formats across different shells / OSes:
 *   "user@host: ~/projects/app"      → "~/projects/app"
 *   "user@host: /absolute/path"       → "/absolute/path"
 *   "~/projects/app"                  → "~/projects/app"
 *   "/absolute/path"                  → "/absolute/path"
 *   "user@host"                       → null  (no path)
 *   "zsh" / "node server.js"          → null  (command, not a path)
 */
function extractCwdFromTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // Try "user@host: <path>" format first.
  const atMatch = trimmed.match(/^[^@\s]+@[^:\s]+:\s*(.+)$/);
  if (atMatch) {
    let path = atMatch[1].trim();
    // Strip trailing prompt characters like % $ # >
    path = path.replace(/[%$#>]\s*$/, '').trim();
    if (path && path !== '~' && looksLikePath(path)) {
      return path;
    }
  }

  // Bare path (no user@host prefix).
  if (looksLikePath(trimmed) && trimmed !== '~') {
    return trimmed.replace(/[%$#>]\s*$/, '').trim() || null;
  }

  return null;
}

/** Heuristic: does this string look like a filesystem path? */
function looksLikePath(s: string): boolean {
  if (s.startsWith('/')) return true;
  if (s.startsWith('~/')) return true;
  if (/^\.?\.?\//.test(s)) return true;
  if (s === '.') return true;
  return false;
}

/** Try WebGL2 GPU-accelerated renderer; fall back silently. */
export function tryEnableWebgl(term: Terminal): boolean {
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
 * Hook return type.
 */
export interface UseTerminalInstancesReturn {
  /** Create (or return cached) Terminal for a session id. */
  setupTerminal: (sessionId: string, theme: TerminalTheme) => SessionTerminal;
  /** Fully destroy a terminal instance. */
  destroyTerminal: (sessionId: string) => void;
  /** Destroy all terminals (called on unmount). */
  destroyAll: () => void;
  /** Ref to the instance cache. */
  terminalsRef: React.MutableRefObject<Map<string, SessionTerminal>>;
  /** Enable WebGL on a terminal. */
  tryEnableWebgl: typeof tryEnableWebgl;
}

/**
 * Options for building the xterm Terminal instance.
 */
interface TerminalManagerDeps {
  resolvedFontFamily: string;
  terminalFontSize: number;
  cursorStyle: TerminalCursorStyle;
  ptySessions: UsePtySessionsReturn;
  terminalInput: UseTerminalInputReturn;
}

/**
 * Manage xterm.js Terminal instances.
 *
 * Creates Terminal instances, loads addons, attaches input/output handlers,
 * and manages the instance cache.
 */
export function useTerminalInstances(deps: TerminalManagerDeps): UseTerminalInstancesReturn {
  const { resolvedFontFamily, terminalFontSize, cursorStyle, ptySessions, terminalInput } = deps;

  const terminalsRef = useRef<Map<string, SessionTerminal>>(new Map());
  /** Map: sessionId → cleanup function for input handlers. */
  const inputCleanupRef = useRef<Map<string, () => void>>(new Map());

  // Stabilize deps via refs so that useCallbacks never re-create
  // due to object-identity changes on re-render.
  const ptySessionsRef = useRef(ptySessions);
  ptySessionsRef.current = ptySessions;
  const terminalInputRef = useRef(terminalInput);
  terminalInputRef.current = terminalInput;

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
        // Enable Kitty keyboard protocol support so that terminal apps
        // (e.g. jcli agent TUI) can correctly distinguish Shift-modified
        // keys like Shift+/ ("?"), Shift+Enter, etc.
        vtExtensions: {
          kittyKeyboard: true,
        },
        // Let the browser figure out the true advance width of each
        // glyph — prevents narrow/wide mismatches on mixed scripts.
        allowTransparency: true,
        theme: {
          background: theme.background,
          foreground: theme.foreground,
          cursor: theme.cursor,
          cursorAccent: theme.cursorAccent,
          selectionBackground: theme.selectionBackground,
          selectionInactiveBackground: theme.selectionInactiveBackground,
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

      // SerializeAddon — enables tear-off: the parent window serializes the
      // xterm buffer (scrollback + alt screen + cursor state) and the child
      // window replays it via `term.write(serialized)`.
      const serialize = new SerializeAddon();
      term.loadAddon(serialize);

      // Unicode 11 addon — provides the real width calculation engine.
      // Without loading this addon, the `unicodeVersion: '11'` option above
      // is just a label with no actual width table behind it.  This addon
      // makes emoji and wide CJK characters correctly occupy 2 cells,
      // matching what the shell expects when laying out box-drawing art.
      const unicode11 = new Unicode11Addon();
      term.loadAddon(unicode11);
      term.unicode.activeVersion = '11';

      // ── Register with PTY session ──────────────────────────────────
      ptySessionsRef.current.registerSession(sessionId, term);

      // ── Attach input handlers ──────────────────────────────────────
      const inputCleanup = terminalInputRef.current.attachInputHandlers(
        term,
        sessionId,
        ptySessionsRef.current.writeToPty,
      );
      inputCleanupRef.current.set(sessionId, inputCleanup);

      // ── Shell title change (OSC 0/2 sequences) → auto title + cwd ──
      term.onTitleChange((title) => {
        const state = useStore.getState();
        state.setAutoTitle(sessionId, title);

        // Try to extract the current working directory from the OSC title.
        const cwd = extractCwdFromTitle(title);
        if (cwd) {
          state.updateSessionCwd(sessionId, cwd);
        }
      });

      const entry: SessionTerminal = {
        term,
        fit,
        serialize,
        container,
        disposeInputBridge: inputCleanup,
      };
      terminalsRef.current.set(sessionId, entry);
      registerTerminal(sessionId, entry);

      // Tear-off child window: replay serialized scrollback from the parent
      // window. TerminalWindowApp sets `window.__detachScrollback` before
      // rendering; each entry is consumed once.
      const scrollbackMap = (window as unknown as {
        __detachScrollback?: Record<string, string>;
      }).__detachScrollback;
      const savedScrollback = scrollbackMap?.[sessionId];
      if (savedScrollback) {
        try {
          term.write(savedScrollback);
        } catch {
          // ignore — malformed scrollback is non-fatal
        }
        delete scrollbackMap?.[sessionId];
      }

      // ── ResizeObserver → PTY resize ────────────────────────────────
      const resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          ptySessionsRef.current.resizePty(sessionId, term.cols, term.rows);
        } catch {
          // ignore
        }
      });
      resizeObserver.observe(container);
      (container as unknown as { _resizeObserver?: ResizeObserver })._resizeObserver =
        resizeObserver;

      return entry;
    },
    [resolvedFontFamily, terminalFontSize, cursorStyle], // ← 只依赖稳定的值，ptySessions/terminalInput 通过 ref 访问
  );

  /** Fully destroy a terminal instance + clean up. */
  const destroyTerminal = useCallback(
    (sessionId: string) => {
      const entry = terminalsRef.current.get(sessionId);
      if (entry) {
        const obs = (entry.container as unknown as { _resizeObserver?: ResizeObserver })
          ._resizeObserver;
        obs?.disconnect();
        entry.disposeInputBridge?.();
        entry.term.dispose();
        terminalsRef.current.delete(sessionId);
        unregisterTerminal(sessionId);
      }
      // Cleanup input handlers.
      inputCleanupRef.current.get(sessionId)?.();
      inputCleanupRef.current.delete(sessionId);
      // Unregister PTY session.
      ptySessionsRef.current.unregisterSession(sessionId);
    },
    [], // ← 空依赖，通过 ref 访问最新的 ptySessions
  );

  /** Destroy all terminals (called on unmount). */
  const destroyAll = useCallback(() => {
    // Dispose all xterm instances first.
    terminalsRef.current.forEach((_, id) => {
      const entry = terminalsRef.current.get(id);
      if (entry) {
        const obs = (entry.container as unknown as { _resizeObserver?: ResizeObserver })
          ._resizeObserver;
        obs?.disconnect();
        entry.disposeInputBridge?.();
        entry.term.dispose();
        unregisterTerminal(id);
      }
      inputCleanupRef.current.get(id)?.();
    });
    terminalsRef.current.clear();
    inputCleanupRef.current.clear();
    // Kill all backend PTY sessions in one call (stops Rust reader threads).
    ptySessionsRef.current.killAllSessions();
  }, []); // ← 空依赖，通过 ref 访问

  return {
    terminalsRef,
    setupTerminal,
    destroyTerminal,
    destroyAll,
    tryEnableWebgl,
  };
}