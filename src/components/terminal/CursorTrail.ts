import type { Terminal } from '@xterm/xterm';
import { TRAIL_VS, TRAIL_FS } from './shaders';

/**
 * CursorTrail — faithful port of kitty's cursor_trail.c + trail_fragment.glsl
 *
 * Kitty's trail is NOT a series of fading stamps.  It's a single rectangle
 * whose 4 corners chase the cursor's 4 corners with exponential ease-out.
 * The corners that are "ahead" (in the direction of motion) catch up fast;
 * the corners "behind" lag, stretching the rectangle into a comet-tail shape.
 *
 * The per-corner speed is dynamically adjusted via dot-product: corners
 * farther from the cursor center decay slower, creating a more pronounced
 * stretch.
 *
 * Rendered via WebGL2 — a single full-screen quad fragment shader fills
 * the trail rectangle and cuts out the cursor area.
 *
 * Config (from kitty.conf):
 *   cursor_trail           = 3   (trail visible after cursor stops)
 *   cursor_trail_decay     = 0.1 0.4  (fast, slow)
 *   cursor_trail_start_threshold = 0  (cells: min jump to start trail)
 */

/** Convert "#rrggbb" -> [r, g, b] with each channel in 0..1 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/** Corner index mapping from kitty: corner_index[0]={1,1,0,0} corner_index[1]={0,1,1,0} */
const CORNER_IDX_X = [1, 1, 0, 0]; // right, right, left, left
const CORNER_IDX_Y = [0, 1, 1, 0]; // top, bottom, bottom, top

// kitty config constants
const DECAY_FAST = 0.1; // seconds
const DECAY_SLOW = 0.4; // seconds

/** Underline cursor occupies the bottom ~15% of the cell. */
const CURSOR_THICKNESS_RATIO = 0.15;

export default class CursorTrail {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private term: Terminal;
  private container: HTMLElement;
  private colorRgb: [number, number, number] = [0, 0.67, 1];

  // ── Trail state: 4 chasing corners (pixel coords) ──
  private cornerX = [0, 0, 0, 0];
  private cornerY = [0, 0, 0, 0];

  // ── Cursor target edges: [left, right] x [top, bottom] ──
  private cursorEdgeX = [0, 0];
  private cursorEdgeY = [0, 0];

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

    this.emptyVao = gl.createVertexArray()!;
  }

  // ── Lifecycle ──

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

  // ── Private: GL helpers ──

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

  // ── Private: Grid measurement ──

  /**
   * Measure grid from DOM — pixel positions of cells relative to canvas.
   *
   * We measure individual row elements (`.xterm-rows > div`) and use
   * the top-to-top distance between rows 0 and 1 as the cell pitch.
   * We CANNOT use `.xterm-rows` bounding rect directly — it includes
   * internal padding / line-height gaps, making cellH too large and
   * causing the trail to drift.
   */
  private measureGrid() {
    const screenEl = this.container.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screenEl) return;

    const screenRect = screenEl.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();

    const rowEls = screenEl.querySelectorAll('.xterm-rows > div');
    if (rowEls.length >= 2) {
      const r0 = rowEls[0].getBoundingClientRect();
      const r1 = rowEls[1].getBoundingClientRect();
      this.cellH = r1.top - r0.top;
      this.cellW = r0.width / Math.max(1, this.term.cols);
      this.gridTop = r0.top - canvasRect.top;
      this.gridLeft = r0.left - canvasRect.left;
    } else if (rowEls.length === 1) {
      const r0 = rowEls[0].getBoundingClientRect();
      this.cellH = r0.height;
      this.cellW = r0.width / Math.max(1, this.term.cols);
      this.gridTop = r0.top - canvasRect.top;
      this.gridLeft = r0.left - canvasRect.left;
    } else {
      this.cellH = screenRect.height / Math.max(1, this.term.rows);
      this.cellW = screenRect.width / Math.max(1, this.term.cols);
      this.gridTop = screenRect.top - canvasRect.top;
      this.gridLeft = screenRect.left - canvasRect.left;
    }
  }

  // ── Private: Trail update logic (ported from cursor_trail.c) ──

  /**
   * Compute the cursor's target rectangle.
   * For underline shape: a thin bar at the bottom of the cell.
   */
  private updateTarget() {
    const buf = this.term.buffer.active;
    const cx = buf.cursorX;
    const cy = buf.baseY + buf.cursorY;

    const underlineH = this.cellH * CURSOR_THICKNESS_RATIO;

    this.cursorEdgeX[0] = this.gridLeft + cx * this.cellW;
    this.cursorEdgeX[1] = this.gridLeft + (cx + 1) * this.cellW;
    this.cursorEdgeY[1] = this.gridTop + (cy + 1) * this.cellH;
    this.cursorEdgeY[0] = this.cursorEdgeY[1] - underlineH;

    // Snap corners on first frame or large jumps (teleport = no trail).
    const jumpDist = Math.abs(cx - this.lastCursorX) + Math.abs(cy - this.lastCursorY);
    if (this.firstFrame || jumpDist > 8) {
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
   * Move each of the 4 corners toward the cursor with exponential ease-out.
   * Per-corner speed depends on dot-product with cursor-center direction.
   * Ported from update_cursor_trail_corners().
   */
  private updateCorners(dt: number) {
    const cx0 = (this.cursorEdgeX[0] + this.cursorEdgeX[1]) * 0.5;
    const cy0 = (this.cursorEdgeY[0] + this.cursorEdgeY[1]) * 0.5;
    const diag = Math.hypot(
      this.cursorEdgeX[1] - this.cursorEdgeX[0],
      this.cursorEdgeY[1] - this.cursorEdgeY[0],
    ) * 0.5;

    const dx: number[] = [0, 0, 0, 0];
    const dy: number[] = [0, 0, 0, 0];
    const dot: number[] = [0, 0, 0, 0];
    let minDot = Infinity;
    let maxDot = -Infinity;

    for (let i = 0; i < 4; i++) {
      const tx = this.cursorEdgeX[CORNER_IDX_X[i]];
      const ty = this.cursorEdgeY[CORNER_IDX_Y[i]];
      dx[i] = tx - this.cornerX[i];
      dy[i] = ty - this.cornerY[i];

      if (Math.abs(dx[i]) < 1e-6 && Math.abs(dy[i]) < 1e-6) {
        dx[i] = 0;
        dy[i] = 0;
        dot[i] = 0;
        continue;
      }

      const dirLen = Math.hypot(dx[i], dy[i]);
      if (diag > 1e-6 && dirLen > 1e-6) {
        dot[i] =
          (dx[i] * (tx - cx0) + dy[i] * (ty - cy0)) / diag / dirLen;
      } else {
        dot[i] = 0;
      }

      if (dot[i] < minDot) minDot = dot[i];
      if (dot[i] > maxDot) maxDot = dot[i];
    }

    for (let i = 0; i < 4; i++) {
      if ((dx[i] === 0 && dy[i] === 0) || minDot === Infinity) continue;

      // Corners "ahead" (high dot) use fast decay; "behind" use slow.
      const decay =
        minDot === maxDot
          ? DECAY_SLOW
          : DECAY_SLOW +
            (DECAY_FAST - DECAY_SLOW) * ((dot[i] - minDot) / (maxDot - minDot));

      const step = 1.0 - Math.pow(2, -10.0 * dt / decay);
      this.cornerX[i] += dx[i] * step;
      this.cornerY[i] += dy[i] * step;
    }
  }

  /** Fade opacity in/out based on whether corners are still catching up. */
  private updateOpacity(dt: number, active: boolean) {
    if (active) {
      this.opacity += dt / DECAY_SLOW;
      if (this.opacity > 1) this.opacity = 1;
    } else {
      this.opacity -= dt / DECAY_SLOW;
      if (this.opacity < 0) this.opacity = 0;
    }
  }

  /** Check if any corner is still far from cursor — if so, keep animating. */
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

  // ── Private: Rendering ──

  private render() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.opacity < 0.001) return;

    // Compute trail bounding box from 4 corners.
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
    gl.uniform4f(this.u.cursorRect, this.cursorEdgeX[0], this.cursorEdgeX[1], this.cursorEdgeY[0], this.cursorEdgeY[1]);
    gl.uniform4f(this.u.trailRect, trailLeft, trailRight, trailTop, trailBottom);
    gl.uniform3f(this.u.color, this.colorRgb[0], this.colorRgb[1], this.colorRgb[2]);
    gl.uniform1f(this.u.opacity, this.opacity);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // ── Main loop ──

  private loop = () => {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.measureGrid();
    this.updateTarget();
    this.updateCorners(dt);
    this.updateNeedsRender();
    this.updateOpacity(dt, this.needsRender);

    // Always clear + render so nothing lingers when settled.
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  };
}
