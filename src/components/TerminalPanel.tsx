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
import TerminalTabs from './TerminalTabs';
import '@xterm/xterm/css/xterm.css';

// ────────────────────────────────────────────────
// Cursor trail — faithful port of kitty's cursor_trail.c
// ────────────────────────────────────────────────

/**
 * Ported from kitty/cursor_trail.c + kitty/trail_fragment.glsl
 *
 * Kitty's trail is NOT a series of fading stamps.  It's a single
 * rectangle whose 4 corners chase the cursor's 4 corners with
 * exponential ease-out.  The corners that are "ahead" (in the
 * direction of motion) catch up fast; the corners "behind" lag,
 * stretching the rectangle into a comet-tail shape.
 *
 * The per-corner speed is dynamically adjusted via dot-product:
 * corners farther from the cursor center decay slower, creating
 * a more pronounced stretch.
 *
 * Config (from kitty.conf):
 *   cursor_trail           = 3   (time-ms: trail visible after cursor stops)
 *   cursor_trail_decay     = 0.1 0.4  (fast, slow)
 *   cursor_trail_start_threshold = 0  (cells: min jump to start trail)
 */

/** Convert "#rrggbb" → [r, g, b] with each channel in 0..1 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

// ── Shaders ──
// The vertex shader draws a full-screen quad and passes screen-space
// pixel coords to the fragment shader as `v_px`.
// The fragment shader (ported from trail_fragment.glsl) fills the quad
// with the trail color, but cuts out the cursor's current rectangle
// so the trail appears *behind* the cursor, not under it.

const TRAIL_VS = `#version 300 es
// Full-screen triangle pair (TRIANGLE_STRIP) in NDC.
const vec2 quad[4] = vec2[4](
  vec2(-1.0, -1.0), vec2( 1.0, -1.0),
  vec2(-1.0,  1.0), vec2( 1.0,  1.0)
);
uniform vec2 u_resolution;   // CSS pixels
out vec2 v_px;               // pixel coords [0..w, 0..h], origin top-left
void main() {
  vec2 ndc = quad[gl_VertexID];
  v_px = (ndc * 0.5 + 0.5) * vec2(u_resolution.x, u_resolution.y);
  // Flip Y so origin is top-left (matches CSS / cursor positions).
  v_px.y = u_resolution.y - v_px.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const TRAIL_FS = `#version 300 es
precision mediump float;
in vec2 v_px;

// Cursor rectangle in pixel coords [left, right] × [top, bottom]
uniform vec4 u_cursorRect;   // (left, right, top, bottom) in px
// Trail rectangle (the 4 chasing corners, flattened).
uniform vec4 u_trailRect;    // (left, right, top, bottom) in px
uniform vec3 u_color;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  float px = v_px.x;
  float py = v_px.y;

  // Inside trail rectangle?
  float in_trail_x = step(u_trailRect.x, px) * step(px, u_trailRect.y);
  float in_trail_y = step(u_trailRect.z, py) * step(py, u_trailRect.w);
  float in_trail = in_trail_x * in_trail_y;
  if (in_trail < 0.5) discard;

  // Don't render if fragment is within the cursor rectangle
  // (ported from trail_fragment.glsl: opacity *= 1 - in_x * in_y)
  float in_cursor_x = step(u_cursorRect.x, px) * step(px, u_cursorRect.y);
  float in_cursor_y = step(u_cursorRect.z, py) * step(py, u_cursorRect.w);
  float alpha = u_opacity * (1.0 - in_cursor_x * in_cursor_y);

  fragColor = vec4(u_color * alpha, alpha);
}`;

/** Corner index mapping from kitty: corner_index[0]={1,1,0,0} corner_index[1]={0,1,1,0} */
const CORNER_IDX_X = [1, 1, 0, 0]; // right, right, left, left
const CORNER_IDX_Y = [0, 1, 1, 0]; // top, bottom, bottom, top

class CursorTrail {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private term: Terminal;
  private container: HTMLElement;
  private colorRgb: [number, number, number] = [0, 0.67, 1];

  // ── Trail state: 4 chasing corners (pixel coords) ──
  private cornerX = [0, 0, 0, 0];
  private cornerY = [0, 0, 0, 0];

  // ── Cursor target edges: [left, right] × [top, bottom] ──
  private cursorEdgeX = [0, 0]; // [left, right]
  private cursorEdgeY = [0, 0]; // [top, bottom]

  // ── Timing ──
  private lastTime = 0;
  private opacity = 0;
  private needsRender = false;
  private lastCursorX = -1;
  private lastCursorY = -1;
  private firstFrame = true;

  // ── Grid metrics (re-measured each frame) ──
  private cellW = 8;
  private cellH = 16;
  private gridLeft = 0;
  private gridTop = 0;
  private cssW = 0;
  private cssH = 0;

  // kitty config constants
  private readonly DECAY_FAST = 0.1; // seconds
  private readonly DECAY_SLOW = 0.4; // seconds
  private readonly TRAIL_TIMEOUT = 3; // seconds (cursor_trail=3 → 3ms, but we use as fade-after-stop)

  private rafId: number | null = null;
  private running = false;

  // GL resources
  private program: WebGLProgram;
  private emptyVao: WebGLVertexArrayObject;
  private u: Record<string, WebGLUniformLocation | null>;

  constructor(term: Terminal, container: HTMLElement, color: string) {
    this.term = term;
    this.container = container;
    this.colorRgb = hexToRgb(color);

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

    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    const vs = this.compile(gl.VERTEX_SHADER, TRAIL_VS);
    const fs = this.compile(gl.FRAGMENT_SHADER, TRAIL_FS);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Trail program link failed: ' + gl.getProgramInfoLog(program));
    }
    this.program = program;

    this.u = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      cursorRect: gl.getUniformLocation(program, 'u_cursorRect'),
      trailRect: gl.getUniformLocation(program, 'u_trailRect'),
      color: gl.getUniformLocation(program, 'u_color'),
      opacity: gl.getUniformLocation(program, 'u_opacity'),
    };

    // Empty VAO — we use gl_VertexID in the shader, no vertex buffers needed.
    this.emptyVao = gl.createVertexArray()!;
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  dispose() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const gl = this.gl;
    gl.deleteVertexArray(this.emptyVao);
    gl.deleteProgram(this.program);
    this.canvas.remove();
  }

  setColor(color: string) {
    this.colorRgb = hexToRgb(color);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  /** Measure grid from DOM — pixel positions of cells relative to canvas. */
  private measureGrid() {
    const rowsEl = this.container.querySelector('.xterm-rows') as HTMLElement | null;
    const screenEl = this.container.querySelector('.xterm-screen') as HTMLElement | null;
    if (!rowsEl || !screenEl) return;

    const rowsRect = rowsEl.getBoundingClientRect();
    const screenRect = screenEl.getBoundingClientRect();

    this.cellW = rowsRect.width / Math.max(1, this.term.cols);
    this.cellH = this.term.dimensions?.css.cell.height || rowsRect.height / Math.max(1, this.term.rows);
    // The canvas covers the full container. Compute grid origin relative to canvas.
    const canvasRect = this.canvas.getBoundingClientRect();
    this.gridLeft = rowsRect.left - canvasRect.left;
    this.gridTop = rowsRect.top - canvasRect.top;
  }

  /**
   * Update the cursor target rectangle (the thing the trail corners chase).
   * Ported from update_cursor_trail_target().
   */
  private updateTarget() {
    const buf = this.term.buffer.active;
    const cx = buf.cursorX;
    const cy = buf.baseY + buf.cursorY;

    // Underline cursor: left = cx, right = cx+1, bottom = cy+1, top = cy
    this.cursorEdgeX[0] = this.gridLeft + cx * this.cellW;
    this.cursorEdgeX[1] = this.gridLeft + (cx + 1) * this.cellW;
    this.cursorEdgeY[0] = this.gridTop + cy * this.cellH; // top
    this.cursorEdgeY[1] = this.gridTop + (cy + 1) * this.cellH; // bottom

    // Detect if cursor jumped — snap corners immediately on first frame
    // or if the cursor moved more than a threshold.
    const jumpDist =
      Math.abs(cx - this.lastCursorX) + Math.abs(cy - this.lastCursorY);

    if (this.firstFrame || jumpDist > 8) {
      // Snap all corners to cursor position (no trail on teleport).
      for (let i = 0; i < 4; i++) {
        this.cornerX[i] = this.cursorEdgeX[CORNER_IDX_X[i]];
        this.cornerY[i] = this.cursorEdgeY[CORNER_IDX_Y[i]];
      }
      this.firstFrame = false;
    }

    this.lastCursorX = cx;
    this.lastCursorY = cy;
  }

  /**
   * The core algorithm: move each of the 4 corners toward the cursor's
   * corresponding corner with exponential ease-out, where the speed
   * depends on the corner's distance and direction relative to cursor center.
   *
   * Ported from update_cursor_trail_corners() in cursor_trail.c.
   */
  private updateCorners(dt: number) {
    const cursorCenterX = (this.cursorEdgeX[0] + this.cursorEdgeX[1]) * 0.5;
    const cursorCenterY = (this.cursorEdgeY[0] + this.cursorEdgeY[1]) * 0.5;
    const cursorDiag = Math.hypot(
      this.cursorEdgeX[1] - this.cursorEdgeX[0],
      this.cursorEdgeY[1] - this.cursorEdgeY[0],
    ) * 0.5;

    // Compute dx, dy, dot for each corner.
    const dx: number[] = [0, 0, 0, 0];
    const dy: number[] = [0, 0, 0, 0];
    const dot: number[] = [0, 0, 0, 0];

    let minDot = Infinity;
    let maxDot = -Infinity;

    for (let i = 0; i < 4; i++) {
      const targetX = this.cursorEdgeX[CORNER_IDX_X[i]];
      const targetY = this.cursorEdgeY[CORNER_IDX_Y[i]];
      dx[i] = targetX - this.cornerX[i];
      dy[i] = targetY - this.cornerY[i];

      if (Math.abs(dx[i]) < 1e-6 && Math.abs(dy[i]) < 1e-6) {
        dx[i] = 0;
        dy[i] = 0;
        dot[i] = 0;
        continue;
      }

      // Dot product of direction vector and cursor-center-to-corner vector,
      // normalized by cursor diagonal and direction length.
      const dirLen = Math.hypot(dx[i], dy[i]);
      if (cursorDiag > 1e-6 && dirLen > 1e-6) {
        dot[i] =
          (dx[i] * (targetX - cursorCenterX) +
            dy[i] * (targetY - cursorCenterY)) /
          cursorDiag /
          dirLen;
      } else {
        dot[i] = 0;
      }

      if (dot[i] < minDot) minDot = dot[i];
      if (dot[i] > maxDot) maxDot = dot[i];
    }

    // Move each corner.
    for (let i = 0; i < 4; i++) {
      if ((dx[i] === 0 && dy[i] === 0) || minDot === Infinity) continue;

      // Map dot[i] to a decay time: corners "ahead" (high dot) use fast decay,
      // corners "behind" (low dot) use slow decay. This creates the stretch.
      const decay =
        minDot === maxDot
          ? this.DECAY_SLOW
          : this.DECAY_SLOW +
            (this.DECAY_FAST - this.DECAY_SLOW) *
              ((dot[i] - minDot) / (maxDot - minDot));

      // Exponential ease-out step (matches kitty's exp2f(-10 * dt / decay)).
      const step = 1.0 - Math.pow(2, -10.0 * dt / decay);
      this.cornerX[i] += dx[i] * step;
      this.cornerY[i] += dy[i] * step;
    }
  }

  /**
   * Update opacity — fade in when cursor is visible and moving,
   * fade out when trail is settling (cursor stopped).
   * Ported from update_cursor_trail_opacity().
   */
  private updateOpacity(dt: number, cursorVisible: boolean) {
    if (cursorVisible) {
      this.opacity += dt / this.DECAY_SLOW;
      if (this.opacity > 1) this.opacity = 1;
    } else {
      this.opacity -= dt / this.DECAY_SLOW;
      if (this.opacity < 0) this.opacity = 0;
    }
  }

  /**
   * Check if any corner is still far from the cursor — if so, keep rendering.
   * Ported from update_cursor_trail_needs_render().
   */
  private updateNeedsRender() {
    const thresholdX = this.cellW * 0.5;
    const thresholdY = this.cellH * 0.5;
    this.needsRender = false;
    for (let i = 0; i < 4; i++) {
      const tx = this.cursorEdgeX[CORNER_IDX_X[i]];
      const ty = this.cursorEdgeY[CORNER_IDX_Y[i]];
      if (
        Math.abs(tx - this.cornerX[i]) >= thresholdX ||
        Math.abs(ty - this.cornerY[i]) >= thresholdY
      ) {
        this.needsRender = true;
        break;
      }
    }
  }

  private render() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Compute trail rect from corners: [min, max] of the 4 corners.
    let trailLeft = Infinity, trailRight = -Infinity;
    let trailTop = Infinity, trailBottom = -Infinity;
    for (let i = 0; i < 4; i++) {
      if (this.cornerX[i] < trailLeft) trailLeft = this.cornerX[i];
      if (this.cornerX[i] > trailRight) trailRight = this.cornerX[i];
      if (this.cornerY[i] < trailTop) trailTop = this.cornerY[i];
      if (this.cornerY[i] > trailBottom) trailBottom = this.cornerY[i];
    }

    gl.useProgram(this.program);
    gl.bindVertexArray(this.emptyVao);

    gl.uniform2f(this.u.resolution, this.cssW, this.cssH);
    gl.uniform4f(
      this.u.cursorRect,
      this.cursorEdgeX[0],
      this.cursorEdgeX[1],
      this.cursorEdgeY[0],
      this.cursorEdgeY[1],
    );
    gl.uniform4f(
      this.u.trailRect,
      trailLeft,
      trailRight,
      trailTop,
      trailBottom,
    );
    gl.uniform3f(this.u.color, this.colorRgb[0], this.colorRgb[1], this.colorRgb[2]);
    gl.uniform1f(this.u.opacity, this.opacity);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private loop = () => {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000); // clamp dt
    this.lastTime = now;

    this.measureGrid();
    this.updateTarget();
    this.updateCorners(dt);
    this.updateOpacity(dt, true);
    this.updateNeedsRender();

    if (this.opacity > 0.001 && (this.needsRender || this.opacity < 1)) {
      this.render();
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

      // ★ Kitty-style cursor trail (WebGL2 instanced)
      try {
        entry.trail = new CursorTrail(entry.term, entry.container, theme.cursor);
        // Defer start until DOM is settled so measureGrid() can find .xterm-rows
        requestAnimationFrame(() => {
          entry.trail?.resize();
          entry.trail?.start();
        });
      } catch {
        // WebGL2 not available for trail — skip silently, terminal still works
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
      <TerminalTabs />
      <div ref={mountRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
