import type { Terminal } from '@xterm/xterm';
import type { TerminalCursorStyle } from '../../lib/storage';
import { TRAIL_VS, TRAIL_FS } from './shaders';

/**
 * CursorTrail — faithful port of kitty's cursor_trail.c + trail_fragment.glsl
 *
 * KEY ARCHITECTURE (matching kitty exactly):
 *
 * The trail is a single quad whose 4 corners chase the cursor's 4
 * corners with exponential ease-out.  Corners "ahead" in the motion
 * direction catch up fast (decay_fast); corners "behind" lag
 * (decay_slow), stretching the quad into a comet-tail shape.
 *
 * RENDERING: The quad is drawn as actual triangle geometry (2
 * triangles, 6 vertices uploaded to a VBO each frame).  The fragment
 * shader is trivially simple — it just cuts out the cursor rectangle.
 * The comet shape comes entirely from the asymmetric corner easing,
 * not from any fragment-level gradient or masking.
 *
 * SHARED CANVAS: Unlike the previous per-pane design, this class uses
 * a single overlay canvas that covers the entire pane area.  This
 * means the trail can cross pane boundaries without being clipped by
 * overflow-hidden.  When the active pane switches, we call attach()
 * to point at the new terminal — exactly like kitty's single trail.
 *
 * CURSOR SHAPE: The trail quad's shape follows the cursor style so
 * the two stay visually consistent:
 *   - 'underline' → thin horizontal strip at the bottom of the cell
 *   - 'block'     → full cell
 *   - 'bar'       → thin vertical strip on the left of the cell
 *
 * Config (kitty defaults):
 *   cursor_trail_decay = 0.1 0.4  (fast, slow in seconds)
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

/**
 * Corner index mapping from kitty's cursor_trail.c:
 *   corner_index[0] = {1, 1, 0, 0}  →  X: right, right, left, left
 *   corner_index[1] = {0, 1, 1, 0}  →  Y: top,   bottom, bottom, top
 *
 * So the 4 corners are:
 *   0 = top-right,  1 = bottom-right,  2 = bottom-left,  3 = top-left
 */
const CORNER_IDX_X = [1, 1, 0, 0];
const CORNER_IDX_Y = [0, 1, 1, 0];

/** Kitty's default decay values (seconds). */
const DECAY_FAST = 0.1;
const DECAY_SLOW = 0.4;

/** Thickness ratios — define the trail quad shape for non-block cursors. */
const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;

export default class CursorTrail {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;

  /** The terminal currently being tracked. */
  private term: Terminal | null = null;
  /** The DOM container of the tracked terminal (for measuring grid). */
  private termContainer: HTMLElement | null = null;

  private colorRgb: [number, number, number] = [0, 0.67, 1];

  /** Current cursor style — drives the trail quad shape. */
  private cursorStyle: TerminalCursorStyle = 'underline';

  // ── Trail state: 4 chasing corners (overlay-canvas pixel coords) ──
  private cornerX = [0, 0, 0, 0];
  private cornerY = [0, 0, 0, 0];

  // ── Cursor target edges for chasing corners ──
  // These define the trail quad shape, which matches the cursor style:
  //   underline → bottom strip, block → full cell, bar → left strip.
  private cursorEdgeX = [0, 0];
  private cursorEdgeY = [0, 0];

  // ── Cursor cutout rect (where the visible cursor sits) ──
  // Same shape as the trail quad, positioned at the trail's current
  // location so the cursor is never fully obscured while the trail
  // fades out.
  private cutoutX = [0, 0];
  private cutoutY = [0, 0];

  // ── Timing ──
  private lastTime = 0;
  private opacity = 0;
  private lastCursorX = -1;
  private lastCursorY = -1;
  private firstFrame = true;
  private needsRender = false;
  /** Whether the terminal cursor is visible (DECTCEM mode).
   *  We treat it as always true since we don't track the mode. */
  private cursorVisible = true;

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
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private aPos: number;
  private u: Record<string, WebGLUniformLocation | null>;

  // Poke state
  private _poked = false;
  private _pokeFromX: number | null = null;
  private _pokeFromY: number | null = null;

  /**
   * @param canvas       An overlay canvas that covers the entire pane area
   *                     (all panes).  This class does NOT own the canvas —
   *                     the caller creates and positions it.
   * @param color        Initial trail color.
   * @param cursorStyle  Initial cursor style — drives the trail quad shape.
   */
  constructor(
    canvas: HTMLCanvasElement,
    color: string,
    cursorStyle: TerminalCursorStyle = 'underline',
  ) {
    this.canvas = canvas;
    this.colorRgb = hexToRgb(color);
    this.cursorStyle = cursorStyle;

    const gl = canvas.getContext('webgl2', {
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

    this.aPos = gl.getAttribLocation(program, 'a_pos');
    this.u = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      cursorRect: gl.getUniformLocation(program, 'u_cursorRect'),
      color: gl.getUniformLocation(program, 'u_color'),
      opacity: gl.getUniformLocation(program, 'u_opacity'),
    };

    // VAO + VBO for 6 vertices (2 triangles), 2 floats each.
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, 12 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  // ── Lifecycle ──

  /**
   * Point the trail at a new terminal.  Called when the active pane
   * changes.  The trail will immediately start tracking this terminal's
   * cursor.
   *
   * @param fromScreenX / fromScreenY  Optional origin in overlay-canvas
   *        local pixels (the old pane's cursor mapped to overlay space).
   *        Produces a smooth cross-pane fly animation.
   */
  attach(
    term: Terminal,
    container: HTMLElement,
    fromScreenX?: number,
    fromScreenY?: number,
  ) {
    this.term = term;
    this.termContainer = container;

    // Force a poke so the trail animates from the old position.
    this.measureGrid();
    this._poked = true;
    this._pokeFromX = fromScreenX ?? null;
    this._pokeFromY = fromScreenY ?? null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.opacity = 0;
  }

  dispose() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const gl = this.gl;
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }

  setColor(color: string) {
    this.colorRgb = hexToRgb(color);
  }

  /**
   * Update the cursor style.  The trail quad shape will follow on the
   * next frame — no need to recreate the trail.
   */
  setCursorStyle(style: TerminalCursorStyle) {
    this.cursorStyle = style;
  }

  /** Check whether the trail is currently tracking this terminal. */
  isAttachedTo(term: Terminal): boolean {
    return this.term === term;
  }

  /**
   * Get the tracked terminal's cursor position in viewport (screen)
   * pixel coordinates.  Used for cross-pane attach().
   */
  getCursorScreenPos(): { x: number; y: number } | null {
    if (!this.term || !this.termContainer) return null;
    const term = this.term;
    const container = this.termContainer;

    const buf = term.buffer.active;
    const cx = buf.cursorX;
    // cursorY is already viewport-relative (0..rows-1).
    // Do NOT add baseY — that gives the absolute buffer line, which
    // would place the trail far below the visible area when there is
    // scrollback.
    const cy = buf.cursorY;

    const screenEl = container.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screenEl) return null;

    const rowEls = screenEl.querySelectorAll('.xterm-rows > div');
    let cellH = this.cellH;
    let cellW = this.cellW;
    let originX = 0;
    let originY = 0;

    if (rowEls.length >= 1) {
      const r0 = rowEls[0].getBoundingClientRect();
      cellH = rowEls.length >= 2
        ? rowEls[1].getBoundingClientRect().top - r0.top
        : r0.height;
      cellW = r0.width / Math.max(1, term.cols);
      originX = r0.left;
      originY = r0.top;
    } else {
      const sr = screenEl.getBoundingClientRect();
      cellH = sr.height / Math.max(1, term.rows);
      cellW = sr.width / Math.max(1, term.cols);
      originX = sr.left;
      originY = sr.top;
    }

    return {
      x: originX + cx * cellW,
      y: originY + (cy + 1) * cellH - cellH * this.cursorThicknessY() * 0.5,
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
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
   * Measure grid metrics relative to the overlay canvas, NOT the
   * terminal container.  This is critical: because the overlay
   * canvas is larger than any single pane, all coordinates need to
   * be in overlay-canvas space.
   */
  private measureGrid() {
    if (!this.term || !this.termContainer) return;
    const term = this.term;
    const container = this.termContainer;

    const screenEl = container.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screenEl) return;

    const canvasRect = this.canvas.getBoundingClientRect();

    const rowEls = screenEl.querySelectorAll('.xterm-rows > div');
    if (rowEls.length >= 2) {
      const r0 = rowEls[0].getBoundingClientRect();
      const r1 = rowEls[1].getBoundingClientRect();
      this.cellH = r1.top - r0.top;
      this.cellW = r0.width / Math.max(1, term.cols);
      this.gridTop = r0.top - canvasRect.top;
      this.gridLeft = r0.left - canvasRect.left;
    } else if (rowEls.length === 1) {
      const r0 = rowEls[0].getBoundingClientRect();
      this.cellH = r0.height;
      this.cellW = r0.width / Math.max(1, term.cols);
      this.gridTop = r0.top - canvasRect.top;
      this.gridLeft = r0.left - canvasRect.left;
    } else {
      const screenRect = screenEl.getBoundingClientRect();
      this.cellH = screenRect.height / Math.max(1, term.rows);
      this.cellW = screenRect.width / Math.max(1, term.cols);
      this.gridTop = screenRect.top - canvasRect.top;
      this.gridLeft = screenRect.left - canvasRect.left;
    }
  }

  // ── Private: Cursor-shape geometry helpers ──

  /**
   * Vertical thickness ratio (fraction of cell height) for the
   * current cursor style.  `block` uses the full cell; `underline`
   * uses the bottom strip; `bar` uses the full cell height (the
   * thinness is horizontal).
   */
  private cursorThicknessY(): number {
    switch (this.cursorStyle) {
      case 'underline':
        return UNDERLINE_THICKNESS_RATIO;
      case 'block':
      case 'bar':
      default:
        return 1.0;
    }
  }

  /**
   * Horizontal thickness ratio (fraction of cell width) for the
   * current cursor style.  `bar` uses the left strip; `block` and
   * `underline` use the full cell width.
   */
  private cursorThicknessX(): number {
    switch (this.cursorStyle) {
      case 'bar':
        return BAR_THICKNESS_RATIO;
      case 'block':
      case 'underline':
      default:
        return 1.0;
    }
  }

  // ── Private: Trail update logic (ported from cursor_trail.c) ──

  private updateTarget() {
    if (!this.term) return;
    const buf = this.term.buffer.active;
    const cx = buf.cursorX;
    // cursorY is already viewport-relative (0..rows-1).
    const cy = buf.cursorY;

    // Full cell bounds.
    const cellLeft = this.gridLeft + cx * this.cellW;
    const cellRight = this.gridLeft + (cx + 1) * this.cellW;
    const cellTop = this.gridTop + cy * this.cellH;
    const cellBottom = this.gridTop + (cy + 1) * this.cellH;

    // Trail quad edges follow the cursor shape.
    const thickX = this.cursorThicknessX();
    const thickY = this.cursorThicknessY();
    this.cursorEdgeX[0] = cellLeft;
    this.cursorEdgeX[1] = cellLeft + this.cellW * thickX;
    this.cursorEdgeY[0] = cellBottom - this.cellH * thickY;
    this.cursorEdgeY[1] = cellBottom;

    // Cutout rect: same shape as the cursor, sitting at the cell
    // position so the visible cursor is never obscured by the trail.
    this.cutoutX[0] = this.cursorEdgeX[0];
    this.cutoutX[1] = this.cursorEdgeX[1];
    this.cutoutY[0] = this.cursorEdgeY[0];
    this.cutoutY[1] = this.cursorEdgeY[1];

    if (this._poked) {
      let flyFromX: number;
      let flyFromY: number;
      if (this._pokeFromX !== null && this._pokeFromY !== null) {
        flyFromX = this._pokeFromX;
        flyFromY = this._pokeFromY;
      } else {
        flyFromX = this.cursorEdgeX[0];
        flyFromY = this.cursorEdgeY[0] - this.cssH * 0.6;
      }
      for (let i = 0; i < 4; i++) {
        this.cornerX[i] = flyFromX;
        this.cornerY[i] = flyFromY;
      }
      this.opacity = 1;
      this._poked = false;
      this._pokeFromX = null;
      this._pokeFromY = null;
      this.firstFrame = false;
    } else if (this.firstFrame) {
      // Only snap corners to the cursor on the very first frame.
      // After that, ALL movement — including large jumps from command
      // output — goes through the exponential chasing in updateCorners(),
      // producing the comet-tail trail effect that kitty is known for.
      for (let i = 0; i < 4; i++) {
        this.cornerX[i] = this.cursorEdgeX[CORNER_IDX_X[i]];
        this.cornerY[i] = this.cursorEdgeY[CORNER_IDX_Y[i]];
      }
      this.firstFrame = false;
    }

    this.lastCursorX = cx;
    this.lastCursorY = cy;
  }

  private updateCorners(dt: number) {
    const cursorCenterX = (this.cursorEdgeX[0] + this.cursorEdgeX[1]) * 0.5;
    const cursorCenterY = (this.cursorEdgeY[0] + this.cursorEdgeY[1]) * 0.5;
    const cursorDiag2 = Math.hypot(
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
      if (cursorDiag2 > 1e-6 && dirLen > 1e-6) {
        dot[i] = (dx[i] * (tx - cursorCenterX) + dy[i] * (ty - cursorCenterY)) / cursorDiag2 / dirLen;
      } else {
        dot[i] = 0;
      }

      if (dot[i] < minDot) minDot = dot[i];
      if (dot[i] > maxDot) maxDot = dot[i];
    }

    for (let i = 0; i < 4; i++) {
      if ((dx[i] === 0 && dy[i] === 0) || minDot === Infinity) continue;

      const decay = (minDot === maxDot)
        ? DECAY_SLOW
        : DECAY_SLOW + (DECAY_FAST - DECAY_SLOW) * (dot[i] - minDot) / (maxDot - minDot);

      const step = 1.0 - Math.pow(2, -10.0 * dt / decay);
      this.cornerX[i] += dx[i] * step;
      this.cornerY[i] += dy[i] * step;
    }
  }

  /**
   * Check if corners are still far enough from their targets to
   * warrant rendering.  Ported from kitty's
   * update_cursor_trail_needs_render().
   */
  private updateNeedsRender() {
    const thresholdX = this.cellW * 0.5;
    const thresholdY = this.cellH * 0.5;
    this.needsRender = false;
    for (let i = 0; i < 4; i++) {
      const dx = Math.abs(this.cursorEdgeX[CORNER_IDX_X[i]] - this.cornerX[i]);
      const dy = Math.abs(this.cursorEdgeY[CORNER_IDX_Y[i]] - this.cornerY[i]);
      if (thresholdX <= dx || thresholdY <= dy) {
        this.needsRender = true;
        return;
      }
    }
  }

  private updateOpacity(dt: number) {
    // Faithful port of kitty's update_cursor_trail_opacity().
    //
    // Kitty's logic is beautifully simple:
    //   - When the cursor is VISIBLE (normal editing), opacity always
    //     ramps UP towards 1.0 at rate 1/DECAY_SLOW.
    //   - When the cursor is HIDDEN (DECTCEM off), opacity ramps DOWN.
    //
    // The key insight: opacity does NOT depend on whether corners are
    // still moving.  It ONLY depends on cursor visibility.  This means
    // the trail stays fully visible during the entire animation —
    // including the critical phase when corners are chasing after a
    // large jump from command output.
    //
    // We treat cursor as always visible (we don't track DECTCEM).
    if (this.cursorVisible) {
      this.opacity += dt / DECAY_SLOW;
      if (this.opacity > 1) this.opacity = 1;
    } else {
      this.opacity -= dt / DECAY_SLOW;
      if (this.opacity < 0) this.opacity = 0;
    }
  }

  // ── Private: Rendering ──

  private render() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.opacity < 0.001) return;

    // Build 6 vertices (2 triangles) from 4 corners.
    const verts = new Float32Array([
      this.cornerX[0], this.cornerY[0],
      this.cornerX[1], this.cornerY[1],
      this.cornerX[3], this.cornerY[3],
      this.cornerX[1], this.cornerY[1],
      this.cornerX[2], this.cornerY[2],
      this.cornerX[3], this.cornerY[3],
    ]);

    // CRITICAL: The cutout (cursor hole) must use the ACTUAL cursor
    // position (cursorEdgeX/Y), NOT the trail corner positions.
    //
    // This matches kitty's trail_fragment.glsl exactly, which uses
    // cursor_edge_x/y (the real cursor bounds) for the cutout.
    //
    // Why this matters: when the cursor jumps (e.g. command output),
    // the trail quad stretches between old and new positions.  If the
    // cutout were computed from the trail corners (our previous bug),
    // it would sit INSIDE the trail quad and erase almost the entire
    // trail, leaving only a sliver visible.  By placing the cutout at
    // the cursor's real position (which is OUTSIDE the trail quad
    // during animation), the entire trail remains visible.
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);

    gl.uniform2f(this.u.resolution, this.cssW, this.cssH);
    gl.uniform4f(
      this.u.cursorRect,
      this.cursorEdgeX[0],
      this.cursorEdgeX[1],
      this.cursorEdgeY[0],
      this.cursorEdgeY[1],
    );
    gl.uniform3f(this.u.color,
      this.colorRgb[0], this.colorRgb[1], this.colorRgb[2]);
    gl.uniform1f(this.u.opacity, this.opacity);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
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
    this.updateOpacity(dt);

    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  };
}
