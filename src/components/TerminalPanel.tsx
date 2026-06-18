import { useRef, useEffect, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';
import {
  getTerminalTheme,
  type TerminalTheme,
} from '../lib/terminalThemes';
import '@xterm/xterm/css/xterm.css';

// ────────────────────────────────────────────────
// Cursor trail effect (kitty-style)
// ────────────────────────────────────────────────

/**
 * CursorTrail — mimics kitty's `cursor_trail` + `cursor_trail_decay`.
 *
 * kitty draws a fading trail behind the cursor as it moves.  We replicate
 * this with a transparent <canvas> layered *inside* the xterm screen
 * container (positioned over `.xterm-rows`).
 *
 * ── Why the previous version didn't work ──
 * The old code measured `term.dimensions?.css.cell` which is unreliable
 * in the beta, and placed the canvas at the container origin — but xterm
 * adds its own padding / scrollbar, so the canvas grid never aligned with
 * the actual character cells.
 *
 * ── Fix ──
 * We query `.xterm-rows` via getBoundingClientRect() every frame to get
 * the *real* pixel position of the character grid, then compute cell size
 * as `rowsRect.width / term.cols`.  The canvas is positioned to exactly
 * cover `.xterm-rows`, so canvas pixel (0,0) === top-left of the first
 * character cell.  This guarantees perfect alignment.
 *
 * kitty params:  cursor_trail 3, cursor_trail_decay 0.1 0.4
 */
class CursorTrail {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private term: Terminal;
  private container: HTMLElement;
  private color: string;
  private trail = new Map<string, number>(); // "x,y" → opacity
  private lastX = -1;
  private lastY = -1;
  private rafId: number | null = null;
  private running = false;
  private cellW = 8;
  private cellH = 16;
  private gridLeft = 0;
  private gridTop = 0;

  constructor(term: Terminal, container: HTMLElement, color: string) {
    this.term = term;
    this.container = container;
    this.color = color;

    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '5',
    } as CSSStyleDeclaration);
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  dispose() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.canvas.remove();
  }

  setColor(color: string) {
    this.color = color;
  }

  /** Recalculate canvas size + cell metrics (call on resize). */
  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Measure the actual character grid from the rendered DOM. */
  private measureGrid() {
    const rowsEl = this.container.querySelector('.xterm-rows') as HTMLElement | null;
    const screenEl = this.container.querySelector('.xterm-screen') as HTMLElement | null;
    if (!rowsEl || !screenEl) return;

    const rowsRect = rowsEl.getBoundingClientRect();
    const screenRect = screenEl.getBoundingClientRect();

    this.cellW = rowsRect.width / Math.max(1, this.term.cols);
    this.cellH = this.term.dimensions?.css.cell.height || rowsRect.height / Math.max(1, this.term.rows);
    // Offset of the rows grid relative to our canvas container.
    this.gridLeft = rowsRect.left - screenRect.left;
    this.gridTop = rowsRect.top - screenRect.top;
  }

  private loop = () => {
    if (!this.running) return;

    this.measureGrid();

    const buf = this.term.buffer.active;
    const cx = buf.cursorX;
    const cy = buf.baseY + buf.cursorY;

    // Stamp new position when cursor moves.
    if (cx !== this.lastX || cy !== this.lastY) {
      this.trail.set(`${cx},${cy}`, 1.0);
      this.lastX = cx;
      this.lastY = cy;
    }

    // Clear + redraw all trail cells with decay.
    const dpr = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    const toDelete: string[] = [];
    for (const [key, opacity] of this.trail) {
      if (opacity <= 0.02) {
        toDelete.push(key);
        continue;
      }
      const [x, y] = key.split(',').map(Number);
      const px = this.gridLeft + x * this.cellW;
      const py = this.gridTop + y * this.cellH;

      // Draw an underline-height bar at the bottom of the cell.
      this.ctx.globalAlpha = opacity * 0.45;
      this.ctx.fillStyle = this.color;
      this.ctx.fillRect(px, py + this.cellH - 2.5, this.cellW, 2.5);

      // Decay — kitty uses 0.1–0.4 range; 0.88/frame approximates this.
      this.trail.set(key, opacity * 0.88);
    }
    for (const key of toDelete) this.trail.delete(key);

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

// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────

export default function TerminalPanel() {
  const activeSessionId = useStore((s) => s.activeSessionId);
  const removeSessionState = useStore((s) => s.removeSessionState);
  const terminalThemeId = useStore((s) => s.terminalThemeId);
  const fontFamily = useStore((s) => s.fontId);
  const fontSize = useStore((s) => s.fontSize);

  const mountRef = useRef<HTMLDivElement>(null);
  const terminalsRef = useRef<Map<string, SessionTerminal>>(new Map());
  const unlistenRef = useRef<Map<string, UnlistenFn[]>>(new Map());

  const theme = getTerminalTheme(terminalThemeId);

  // ── Setup a terminal for a given session ──────────────────────────
  const setupTerminal = useCallback(
    (sessionId: string, theme: TerminalTheme): SessionTerminal => {
      const cached = terminalsRef.current.get(sessionId);
      if (cached) return cached;

      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.width = '100%';
      container.style.height = '100%';

      const term = new Terminal({
        fontFamily: `'${fontFamily}', 'monaco', monospace`,
        fontSize: Math.max(12, Math.min(18, fontSize - 1)),
        // kitty: cursor_shape underline
        cursorStyle: 'underline',
        cursorBlink: true,
        cursorWidth: 2,
        allowProposedApi: true,
        scrollback: 10000,
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

      const entry: SessionTerminal = { term, fit, container, trail: null };
      terminalsRef.current.set(sessionId, entry);

      // Resize → PTY + trail canvas
      const resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          storage.ptyResize(sessionId, term.cols, term.rows).catch(console.error);
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
    [fontFamily, fontSize, removeSessionState],
  );

  // ── Destroy a terminal ────────────────────────────────────────────
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
      unlistens.forEach((u) => u.then((fn) => fn()).catch(() => {}));
      unlistenRef.current.delete(sessionId);
    }
  }, []);

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
      tryEnableWebgl(entry.term);

      // ★ Kitty-style cursor trail
      entry.trail = new CursorTrail(entry.term, entry.container, theme.cursor);
      // Defer start until DOM is settled so measureGrid() can find .xterm-rows
      requestAnimationFrame(() => {
        entry.trail?.resize();
        entry.trail?.start();
      });
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
  useEffect(() => {
    return () => terminalsRef.current.forEach((_, id) => destroyTerminal(id));
  }, [destroyTerminal]);

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
  }, [theme]);

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
    <div
      className="w-full h-full flex flex-col"
      style={{ background: theme.ui.panelBg }}
    >
      <div
        className="shrink-0 h-9 flex items-center px-3 border-b"
        style={{ background: theme.ui.barBg, borderColor: theme.ui.barBorder }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: theme.ui.barFg }}
        >
          {activeSessionId ? `◆ ${activeSessionId}` : ''}
        </span>
      </div>
      <div ref={mountRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
