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
// Cursor trail effect (kitty-style, WebGL2 GPU-accelerated)
// ────────────────────────────────────────────────

/** Convert "#rrggbb" → [r, g, b] with each channel in 0..1 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

const TRAIL_VS = `#version 300 es
layout(location=0) in vec2 a_quad;       // unit-quad vertex (0..1)
layout(location=1) in vec2 a_cellPos;    // per-instance cell grid pos (col, row)
layout(location=2) in float a_opacity;   // per-instance opacity

uniform vec2 u_resolution;   // canvas CSS pixels
uniform vec2 u_cellSize;     // px per cell (w, h)
uniform vec2 u_gridOffset;   // grid origin offset (px)
uniform float u_barH;        // underline bar height (px)

out float v_alpha;

void main() {
  // Position the underline bar at the bottom of the cell.
  vec2 px = a_cellPos * u_cellSize + u_gridOffset;
  px.x += a_quad.x * u_cellSize.x;
  px.y += (u_cellSize.y - u_barH) + a_quad.y * u_barH;

  // Convert to clip space (origin top-left → NDC bottom-left).
  vec2 ndc = (px / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;

  gl_Position = vec4(ndc, 0.0, 1.0);
  v_alpha = a_opacity;
}`;

const TRAIL_FS = `#version 300 es
precision mediump float;
in float v_alpha;
uniform vec3 u_color;
out vec4 fragColor;
void main() {
  float a = v_alpha * 0.45;
  fragColor = vec4(u_color * a, a);
}`;

/**
 * CursorTrail — kitty's `cursor_trail` + `cursor_trail_decay`, rendered on
 * the GPU via WebGL2 instanced drawing.
 *
 * Every frame the active trail cells are packed into an instance buffer
 * (x, y, opacity) and drawn in a **single** `drawArraysInstanced` call.
 * Each instance maps a 4-vertex unit-quad TRIANGLE_STRIP onto the correct
 * screen position + underline-bar shape.  This keeps the main thread free
 * — even with hundreds of decaying trail cells the cost is one GPU call.
 *
 * kitty params:  cursor_trail 3,  cursor_trail_decay 0.1 0.4
 */
class CursorTrail {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private term: Terminal;
  private container: HTMLElement;
  private colorRgb: [number, number, number] = [0, 0.67, 1];

  private trail = new Map<string, number>(); // "x,y" → opacity
  private lastX = -1;
  private lastY = -1;
  private rafId: number | null = null;
  private running = false;

  // Grid metrics (re-measured each frame)
  private cellW = 8;
  private cellH = 16;
  private gridLeft = 0;
  private gridTop = 0;
  private cssW = 0;
  private cssH = 0;

  // GL resources
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadBuffer: WebGLBuffer;
  private instanceBuffer: WebGLBuffer;
  private u: {
    resolution: WebGLUniformLocation | null;
    cellSize: WebGLUniformLocation | null;
    gridOffset: WebGLUniformLocation | null;
    barH: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
  };

  // Pre-allocated instance data array (reused each frame to avoid GC).
  // Each instance = 3 floats (cellX, cellY, opacity). Max 512 cells.
  private static readonly MAX_INSTANCES = 512;
  private instanceData = new Float32Array(CursorTrail.MAX_INSTANCES * 3);

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
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    // ── Compile shaders ──
    const vs = this.compile(gl.VERTEX_SHADER, TRAIL_VS);
    const fs = this.compile(gl.FRAGMENT_SHADER, TRAIL_FS);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        'Trail program link failed: ' + gl.getProgramInfoLog(program),
      );
    }
    this.program = program;

    this.u = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      cellSize: gl.getUniformLocation(program, 'u_cellSize'),
      gridOffset: gl.getUniformLocation(program, 'u_gridOffset'),
      barH: gl.getUniformLocation(program, 'u_barH'),
      color: gl.getUniformLocation(program, 'u_color'),
    };

    // ── Static unit-quad (TRIANGLE_STRIP) ──
    const quadVerts = new Float32Array([
      0, 0, //
      1, 0, //
      0, 1, //
      1, 1, //
    ]);
    this.quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    // ── Dynamic instance buffer ──
    this.instanceBuffer = gl.createBuffer()!;

    // ── VAO ──
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // Attribute 0: a_quad (static, 2 floats, no divisor)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Attribute 1: a_cellPos (instanced, 2 floats, divisor=1)
    // Attribute 2: a_opacity (instanced, 1 float, divisor=1)
    // Both live in the same interleaved buffer: [cellX, cellY, opacity]
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const stride = 3 * 4; // 3 floats per instance
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
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
    this.loop();
  }

  dispose() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const gl = this.gl;
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteVertexArray(this.vao);
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

  private measureGrid() {
    const rowsEl = this.container.querySelector(
      '.xterm-rows',
    ) as HTMLElement | null;
    const screenEl = this.container.querySelector(
      '.xterm-screen',
    ) as HTMLElement | null;
    if (!rowsEl || !screenEl) return;

    const rowsRect = rowsEl.getBoundingClientRect();
    const screenRect = screenEl.getBoundingClientRect();

    this.cellW = rowsRect.width / Math.max(1, this.term.cols);
    this.cellH =
      this.term.dimensions?.css.cell.height ||
      rowsRect.height / Math.max(1, this.term.rows);
    this.gridLeft = rowsRect.left - screenRect.left;
    this.gridTop = rowsRect.top - screenRect.top;
  }

  private loop = () => {
    if (!this.running) return;

    this.measureGrid();

    const buf = this.term.buffer.active;
    const cx = buf.cursorX;
    const cy = buf.baseY + buf.cursorY;

    if (cx !== this.lastX || cy !== this.lastY) {
      this.trail.set(`${cx},${cy}`, 1.0);
      this.lastX = cx;
      this.lastY = cy;
    }

    // Pack active instances into instanceData, decaying opacity.
    const gl = this.gl;
    const data = this.instanceData;
    let count = 0;
    const toDelete: string[] = [];

    for (const [key, opacity] of this.trail) {
      if (opacity <= 0.02) {
        toDelete.push(key);
        continue;
      }
      if (count >= CursorTrail.MAX_INSTANCES) break;

      const [x, y] = key.split(',').map(Number);
      const off = count * 3;
      data[off] = x;
      data[off + 1] = y;
      data[off + 2] = opacity * 0.45; // premultiply max visibility

      this.trail.set(key, opacity * 0.88);
      count++;
    }
    for (const key of toDelete) this.trail.delete(key);

    // ── Render ──
    const dpr = window.devicePixelRatio || 1;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (count > 0) {
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);

      // Upload instance data (only the used portion).
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        data.subarray(0, count * 3),
        gl.DYNAMIC_DRAW,
      );

      // Uniforms
      gl.uniform2f(this.u.resolution, this.cssW, this.cssH);
      gl.uniform2f(this.u.cellSize, this.cellW, this.cellH);
      gl.uniform2f(this.u.gridOffset, this.gridLeft, this.gridTop);
      gl.uniform1f(this.u.barH, 2.5);
      gl.uniform3f(
        this.u.color,
        this.colorRgb[0],
        this.colorRgb[1],
        this.colorRgb[2],
      );

      // Enable blending for transparency.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
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
