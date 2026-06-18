import { useRef, useEffect, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';
import '@xterm/xterm/css/xterm.css';

/**
 * xterm.js theme that matches the VSCode dark palette.
 * Swapped at runtime when the user is in light mode.
 */
function getTheme(isDark: boolean) {
  return isDark
    ? {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#d7ba7d',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#d7ba7d',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff',
      }
    : {
        background: '#ffffff',
        foreground: '#1e1e1e',
        cursor: '#1e1e1e',
        cursorAccent: '#ffffff',
        selectionBackground: '#add6ff',
        black: '#000000',
        red: '#cd3131',
        green: '#00bc00',
        yellow: '#949800',
        blue: '#0451a5',
        magenta: '#bc05bc',
        cyan: '#0598bc',
        white: '#555555',
        brightBlack: '#666666',
        brightRed: '#cd3131',
        brightGreen: '#14ce14',
        brightYellow: '#b5ba00',
        brightBlue: '#0451a5',
        brightMagenta: '#bc05bc',
        brightCyan: '#0598bc',
        brightWhite: '#a5a5a5',
      };
}

/** Per-session terminal instance cache. */
interface SessionTerminal {
  term: Terminal;
  fit: FitAddon;
  container: HTMLDivElement;
  webglActive: boolean;
}

/**
 * Try to enable the WebGL2 GPU-accelerated renderer on a terminal.
 *
 * Strategy (mirrors kitty / VS Code):
 *   1. Attempt WebGL2 — fastest, uses GPU for glyph atlas + batched draw.
 *   2. If WebGL2 is unavailable or throws, xterm.js automatically falls
 *      back to its built-in Canvas/DOM renderer, so we just catch & log.
 *
 * The key for buttery-smooth scrolling: the WebGL addon uploads a glyph
 * atlas texture once and then renders entire frames with a few draw calls,
 * so the main thread never blocks on text layout — even at 200k+ lines
 * of scrollback or under heavy output (`yes`, `cat huge.log`).
 */
function tryEnableWebgl(term: Terminal): boolean {
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => {
      // GPU context was lost (e.g. system memory pressure on macOS).
      // Dispose the addon — xterm falls back to DOM renderer automatically.
      addon.dispose();
    });
    term.loadAddon(addon);
    return true;
  } catch {
    // WebGL2 not available — silently fall back to default renderer.
    return false;
  }
}

/**
 * TerminalPanel — renders an interactive xterm.js terminal for the active
 * PTY session.
 *
 * Rendering pipeline: DOM (default) → WebGL2 (GPU accelerated).
 * The WebGL addon is loaded *after* `term.open()` because it needs a
 * rendered DOM tree to attach its <canvas> to.
 *
 * Key design decisions:
 * - Each session gets its own Terminal instance, cached in a Map. Switching
 *   sessions hides/shows containers without destroying/recreating terminals,
 *   preserving scrollback and state.
 * - ResizeObserver triggers pty_resize so the shell knows the new dimensions.
 * - Tauri events `pty-data-{id}` and `pty-exit-{id}` drive output and cleanup.
 */
export default function TerminalPanel() {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const removeSessionState = useStore((s) => s.removeSessionState);
  const isDark = useStore((s) => s.isDarkMode);
  const fontFamily = useStore((s) => s.fontId);
  const fontSize = useStore((s) => s.fontSize);

  const mountRef = useRef<HTMLDivElement>(null);
  /** Cache: sessionId → terminal instance + DOM container. */
  const terminalsRef = useRef<Map<string, SessionTerminal>>(new Map());
  /** Cleanup functions for event listeners, keyed by sessionId. */
  const unlistenRef = useRef<Map<string, UnlistenFn[]>>(new Map());

  // ── Setup a terminal for a given session ──────────────────────────
  const setupTerminal = useCallback(
    (sessionId: string): SessionTerminal => {
      const cached = terminalsRef.current.get(sessionId);
      if (cached) return cached;

      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';

      const term = new Terminal({
        fontFamily: `'${fontFamily}', monospace`,
        fontSize: Math.max(11, Math.min(18, fontSize - 1)),
        cursorBlink: true,
        allowProposedApi: true,
        // Higher scrollback — WebGL handles it effortlessly.
        scrollback: 10000,
        // gpuDensity lets the WebGL addon render at device pixel ratio
        // for crisp text on Retina displays.
        // (handled implicitly by the addon)
        theme: getTheme(isDark),
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      // Keyboard input → PTY
      term.onData((data) => {
        storage.ptyWrite(sessionId, data).catch(console.error);
      });

      // Listen for shell output → terminal
      const unlistenData = listen<{ data: string }>(
        `pty-data-${sessionId}`,
        (e) => {
          term.write(e.payload.data);
        },
      );

      // Listen for shell exit → cleanup
      const unlistenExit = listen(`pty-exit-${sessionId}`, () => {
        removeSessionState(sessionId);
      });

      unlistenRef.current.set(sessionId, [unlistenData, unlistenExit]);

      const entry: SessionTerminal = {
        term,
        fit,
        container,
        webglActive: false,
      };
      terminalsRef.current.set(sessionId, entry);

      // Resize → PTY
      const resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          storage
            .ptyResize(sessionId, term.cols, term.rows)
            .catch(console.error);
        } catch {
          // ignore — container may not be visible yet
        }
      });
      resizeObserver.observe(container);
      (container as unknown as { _resizeObserver?: ResizeObserver })._resizeObserver =
        resizeObserver;

      return entry;
    },
    [fontFamily, fontSize, isDark, removeSessionState],
  );

  // ── Destroy a terminal for a given session ────────────────────────
  const destroyTerminal = useCallback((sessionId: string) => {
    const entry = terminalsRef.current.get(sessionId);
    if (entry) {
      const obs = (entry.container as unknown as { _resizeObserver?: ResizeObserver })
        ._resizeObserver;
      obs?.disconnect();
      entry.term.dispose();
      terminalsRef.current.delete(sessionId);
    }
    // Cleanup event listeners
    const unlistens = unlistenRef.current.get(sessionId);
    if (unlistens) {
      unlistens.forEach((u) => {
        u.then((fn) => fn()).catch(() => {});
      });
      unlistenRef.current.delete(sessionId);
    }
  }, []);

  // ── Mount / switch active session ─────────────────────────────────
  useEffect(() => {
    if (!activeSessionId || !mountRef.current) return;

    const entry = setupTerminal(activeSessionId);

    // Clear mount point, append the active container
    const mount = mountRef.current;
    while (mount.firstChild) {
      mount.removeChild(mount.firstChild);
    }
    mount.appendChild(entry.container);

    // Open the terminal if not yet opened
    const isFirstOpen = !entry.container.classList.contains('xterm-enabled');
    if (isFirstOpen) {
      entry.term.open(entry.container);
      entry.container.classList.add('xterm-enabled');

      // ★ Enable GPU-accelerated WebGL2 renderer after open().
      // This must happen after open() because the addon needs the DOM tree
      // to inject its <canvas> element.
      entry.webglActive = tryEnableWebgl(entry.term);
    }

    // Defer fit to next frame so layout is settled
    requestAnimationFrame(() => {
      try {
        entry.fit.fit();
        storage
          .ptyResize(activeSessionId, entry.term.cols, entry.term.rows)
          .catch(console.error);
      } catch {
        // ignore
      }
      entry.term.focus();
    });

    return () => {
      // Don't destroy on cleanup — keep terminal alive for switching back.
      if (entry.container.parentElement === mount) {
        mount.removeChild(entry.container);
      }
    };
  }, [activeSessionId, setupTerminal]);

  // ── Cleanup on unmount: destroy all terminals ─────────────────────
  useEffect(() => {
    return () => {
      terminalsRef.current.forEach((_, id) => destroyTerminal(id));
    };
  }, [destroyTerminal]);

  // ── Theme / font changes → update all terminals ───────────────────
  useEffect(() => {
    terminalsRef.current.forEach(({ term }) => {
      term.options.theme = getTheme(isDark);
    });
  }, [isDark]);

  useEffect(() => {
    terminalsRef.current.forEach(({ term }) => {
      term.options.fontFamily = `'${fontFamily}', monospace`;
      term.options.fontSize = Math.max(11, Math.min(18, fontSize - 1));
    });
  }, [fontFamily, fontSize]);

  // ── Cleanup dead sessions (removed from store but terminal cached) ─
  useEffect(() => {
    const sessions = useStore.getState().sessions;
    const alive = new Set(sessions.map((s) => s.id));
    terminalsRef.current.forEach((_, id) => {
      if (!alive.has(id)) destroyTerminal(id);
    });
  });

  return (
    <div className="w-full h-full bg-[var(--vscode-terminal-background,#1e1e1e)] flex flex-col">
      {/* Terminal bar — active session indicator */}
      <div className="shrink-0 h-9 flex items-center px-3 border-b border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)]">
        <span className="text-xs text-[var(--vscode-descriptionForeground)] font-medium">
          {activeSessionId ? `> ${activeSessionId}` : ''}
        </span>
      </div>
      {/* Terminal mount point */}
      <div ref={mountRef} className="flex-1 min-h-0 p-1 overflow-hidden" />
    </div>
  );
}
