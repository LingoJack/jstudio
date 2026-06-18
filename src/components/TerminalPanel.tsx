import { useRef, useEffect, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';
import '@xterm/xterm/css/xterm.css';

// ────────────────────────────────────────────────
// Theme: Tokyo Night Moon (matches kitty config)
// ────────────────────────────────────────────────

/**
 * Tokyo Night Moon — lifted directly from kitty theme-anthropic-dark.conf.
 * Dark mode uses the real palette; light mode is a softened variant for
 * daytime use.
 */
function getTheme(isDark: boolean) {
  return isDark
    ? {
        background: '#222436',
        foreground: '#c8d3f5',
        cursor: '#00AAFF',
        cursorAccent: '#222436',
        selectionBackground: '#2d3f76',
        selectionForeground: '#c8d3f5',
        // ANSI normal (color0–color7)
        black: '#1b1d2b',
        red: '#ff757f',
        green: '#c3e88d',
        yellow: '#ffc777',
        blue: '#82aaff',
        magenta: '#c099ff',
        cyan: '#86e1fc',
        white: '#828bb8',
        // ANSI bright (color8–color15)
        brightBlack: '#444a73',
        brightRed: '#ff757f',
        brightGreen: '#c3e88d',
        brightYellow: '#ffc777',
        brightBlue: '#82aaff',
        brightMagenta: '#c099ff',
        brightCyan: '#86e1fc',
        brightWhite: '#c8d3f5',
        // Extended (color16–color17)
        extended: ['#ff966c', '#c53b53'],
      }
    : {
        background: '#e1e2e7',
        foreground: '#373641',
        cursor: '#00AAFF',
        cursorAccent: '#e1e2e7',
        selectionBackground: '#b6bfe2',
        selectionForeground: '#373641',
        black: '#e9e9ed',
        red: '#f52a4e',
        green: '#49ad2c',
        yellow: '#b08800',
        blue: '#3a64ea',
        magenta: '#c41de0',
        cyan: '#1c8ed0',
        white: '#373641',
        brightBlack: '#8b8d97',
        brightRed: '#f52a4e',
        brightGreen: '#49ad2c',
        brightYellow: '#b08800',
        brightBlue: '#3a64ea',
        brightMagenta: '#c41de0',
        brightCyan: '#1c8ed0',
        brightWhite: '#4f505c',
        extended: ['#ff966c', '#c53b53'],
      };
}

// ────────────────────────────────────────────────
// Cursor trail effect (kitty-style)
// ────────────────────────────────────────────────

/**
 * CursorTrail — mimics kitty's `cursor_trail` + `cursor_trail_decay` feature.
 *
 * kitty draws a fading trail behind the cursor as it moves. We replicate this
 * with a transparent <canvas> overlay on top of xterm.js. On every cursor
 * position change (tracked via a poll loop on `term.buffer.active`), we
 * "stamp" the cursor cell onto a trail buffer. Each frame, the trail cells
 * decay toward zero opacity (decay 0.1 → slow fade, matching kitty config).
 *
 * kitty params from the config:
 *   cursor_trail 3            → trail length ~3 cells worth of persistence
 *   cursor_trail_decay 0.1 0.4 → decay range (start_fast, end_slow)
 */
class CursorTrail {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private term: Terminal;
  private color: string;
  private trailCells: Map<string, number> = new Map(); // "x,y" → opacity [0..1]
  private lastCursorX = -1;
  private lastCursorY = -1;
  private rafId: number | null = null;
  private running = false;

  constructor(term: Terminal, container: HTMLElement, color: string) {
    this.term = term;
    this.color = color;

    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '10';
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Start the animation loop. */
  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  /** Stop and clean up. */
  dispose() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.canvas.remove();
  }

  /** Update the trail color (e.g. on theme switch). */
  setColor(color: string) {
    this.color = color;
  }

  /** Resize the canvas to match the terminal dimensions. */
  resize() {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private loop = () => {
    if (!this.running) return;

    const cellWidth = this.term.element!.querySelector('.xterm-rows') as HTMLElement;
    if (!cellWidth) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    // Get current cell dimensions from the rendered rows.
    const cellW = this.term.dimensions?.css.cell.width ?? 8;
    const cellH = this.term.dimensions?.css.cell.height ?? 16;

    // Check if cursor moved.
    const buf = this.term.buffer.active;
    const cx = buf.cursorX;
    const cy = buf.baseY + buf.cursorY;

    if (cx !== this.lastCursorX || cy !== this.lastCursorY) {
      // Cursor jumped — stamp the new position with full opacity, and leave
      // the old position to begin decaying.
      const key = `${cx},${cy}`;
      this.trailCells.set(key, 1.0);
      this.lastCursorX = cx;
      this.lastCursorY = cy;
    }

    // Decay all trail cells and draw them.
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const toDelete: string[] = [];

    for (const [key, opacity] of this.trailCells) {
      if (opacity <= 0.01) {
        toDelete.push(key);
        continue;
      }
      // Draw the trail cell as a subtle underline bar (matches underline cursor).
      const [x, y] = key.split(',').map(Number);
      const px = x * cellW;
      const py = y * cellH;

      this.ctx.globalAlpha = opacity * 0.5;
      this.ctx.fillStyle = this.color;
      // Draw a 2px underline-height bar at the bottom of the cell.
      this.ctx.fillRect(px, py + cellH - 2, cellW, 2);

      // Decay: kitty uses 0.1–0.4 range. We apply a frame-based decay
      // that mirrors "fast at first, slower as it fades".
      const newOpacity = opacity * 0.88; // ~0.1 per-frame decay at start
      this.trailCells.set(key, newOpacity);
    }

    for (const key of toDelete) {
      this.trailCells.delete(key);
    }

    this.rafId = requestAnimationFrame(this.loop);
  };
}

// ────────────────────────────────────────────────
// Per-session terminal cache
// ────────────────────────────────────────────────

interface SessionTerminal {
  term: Terminal;
  fit: FitAddon;
  container: HTMLDivElement;
  trail: CursorTrail | null;
}

// ────────────────────────────────────────────────
// WebGL2 GPU-accelerated renderer
// ────────────────────────────────────────────────

/**
 * Try to enable the WebGL2 GPU-accelerated renderer.
 * Falls back to xterm's DOM renderer if unavailable.
 */
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

// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────

export default function TerminalPanel() {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const removeSessionState = useStore((s) => s.removeSessionState);
  const isDark = useStore((s) => s.isDarkMode);
  const fontFamily = useStore((s) => s.fontId);
  const fontSize = useStore((s) => s.fontSize);

  const mountRef = useRef<HTMLDivElement>(null);
  const terminalsRef = useRef<Map<string, SessionTerminal>>(new Map());
  const unlistenRef = useRef<Map<string, UnlistenFn[]>>(new Map());

  // ── Setup a terminal for a given session ──────────────────────────
  const setupTerminal = useCallback(
    (sessionId: string): SessionTerminal => {
      const cached = terminalsRef.current.get(sessionId);
      if (cached) return cached;

      const theme = getTheme(isDark);

      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.width = '100%';
      container.style.height = '100%';

      const term = new Terminal({
        fontFamily: `'${fontFamily}', 'monaco', monospace`,
        fontSize: Math.max(12, Math.min(18, fontSize - 1)),
        // ── kitty cursor settings ──
        // cursor_shape underline → xterm cursorStyle: 'underline'
        cursorStyle: 'underline',
        cursorBlink: true,
        cursorWidth: 2,
        // ── general ──
        allowProposedApi: true,
        scrollback: 10000,
        theme,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      // Keyboard input → PTY (xterm.js encodes as UTF-8 by default)
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
        trail: null,
      };
      terminalsRef.current.set(sessionId, entry);

      // Resize → PTY + trail canvas resize
      const resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          storage
            .ptyResize(sessionId, term.cols, term.rows)
            .catch(console.error);
          entry.trail?.resize();
        } catch {
          // ignore
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
      entry.trail?.dispose();
      entry.term.dispose();
      terminalsRef.current.delete(sessionId);
    }
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

      // ★ Enable GPU-accelerated WebGL2 renderer
      tryEnableWebgl(entry.term);

      // ★ Enable kitty-style cursor trail animation
      const theme = getTheme(isDark);
      entry.trail = new CursorTrail(
        entry.term,
        entry.container,
        theme.cursor as string,
      );
      entry.trail.resize();
      entry.trail.start();
    }

    // Defer fit to next frame so layout is settled
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
  }, [activeSessionId, setupTerminal, isDark]);

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      terminalsRef.current.forEach((_, id) => destroyTerminal(id));
    };
  }, [destroyTerminal]);

  // ── Theme change → update all terminals ───────────────────────────
  useEffect(() => {
    const theme = getTheme(isDark);
    terminalsRef.current.forEach(({ term, trail }) => {
      term.options.theme = theme;
      trail?.setColor(theme.cursor as string);
    });
  }, [isDark]);

  // ── Font change → update all terminals ────────────────────────────
  useEffect(() => {
    terminalsRef.current.forEach(({ term }) => {
      term.options.fontFamily = `'${fontFamily}', 'monaco', monospace`;
      term.options.fontSize = Math.max(12, Math.min(18, fontSize - 1));
    });
  }, [fontFamily, fontSize]);

  // ── Cleanup dead sessions ─────────────────────────────────────────
  useEffect(() => {
    const sessions = useStore.getState().sessions;
    const alive = new Set(sessions.map((s) => s.id));
    terminalsRef.current.forEach((_, id) => {
      if (!alive.has(id)) destroyTerminal(id);
    });
  });

  return (
    <div className="w-full h-full flex flex-col" style={{ background: '#222436' }}>
      {/* Terminal bar — active session indicator */}
      <div
        className="shrink-0 h-9 flex items-center px-3 border-b"
        style={{
          background: '#1e2030',
          borderColor: '#2f334d',
        }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: '#82aaff' }}
        >
          {activeSessionId ? `◆ ${activeSessionId}` : ''}
        </span>
      </div>
      {/* Terminal mount point */}
      <div ref={mountRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
