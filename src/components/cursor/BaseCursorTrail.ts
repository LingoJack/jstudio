/**
 * BaseCursorTrail — shared foundation for GPU-accelerated cursor trails.
 *
 * This is a faithful TypeScript port of kitty terminal's cursor_trail.c +
 * trail_fragment.glsl.  It provides the physics engine, GL pipeline, and
 * rendering loop that are identical for both the terminal (xterm) and the
 * editor (contentEditable / ProseMirror).
 *
 * Subclasses only need to implement:
 *   - measureCursorRect(): how to get the cursor's pixel rect
 *   - updateTarget():      how to set cursorEdgeX/Y from the measurement
 *
 * ARCHITECTURE (matching kitty exactly):
 *
 *   The trail is a single quad whose 4 corners chase the cursor's 4
 *   corners with exponential ease-out.  Corners "ahead" in the motion
 *   direction catch up fast (DECAY_FAST); corners "behind" lag
 *   (DECAY_SLOW), stretching the quad into a comet-tail shape.
 *
 *   The fragment shader either cuts out the cursor rectangle (so the
 *   native cursor shows through) or fills the entire quad (so the fill
 *   IS the cursor).  The comet shape comes entirely from the asymmetric
 *   corner easing, not from any fragment-level gradient.
 *
 *   Config (kitty defaults):
 *     cursor_trail_decay = 0.1 0.4  (fast, slow in seconds)
 */

import { TRAIL_VS, TRAIL_FS } from './shaders';

// ── Kitty-default decay constants (seconds) ──────────────────────────
const DECAY_FAST = 0.1;
const DECAY_SLOW = 0.4;

// ── Corner index mapping (from kitty's cursor_trail.c) ───────────────
//   corner 0 = top-right, 1 = bottom-right, 2 = bottom-left, 3 = top-left
const CORNER_IDX_X = [1, 1, 0, 0]; // right, right, left, left
const CORNER_IDX_Y = [0, 1, 1, 0]; // top, bottom, bottom, top

/** Convert "#rrggbb" -> [r, g, b] with each channel in 0..1 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export { DECAY_FAST, DECAY_SLOW, CORNER_IDX_X, CORNER_IDX_Y };

/** Rect in overlay-canvas-local pixel coordinates. */
export interface PixelRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Options passed to `render()` by subclasses to control shader behaviour.
 */
export interface RenderOptions {
  /** When true, fill the entire quad solid (no cutout). */
  fillCursor?: boolean;
  /** Blink multiplier 0..1 applied to the fill opacity.  Default 1.0. */
  blink?: number;
}

export abstract class BaseCursorTrail {
  protected canvas: HTMLCanvasElement;
  protected gl: WebGL2RenderingContext;

  protected colorRgb: [number, number, number] = [0, 0.5, 0.83];

  // ── Trail state: 4 chasing corners (overlay-canvas pixel coords) ──
  protected cornerX = [0, 0, 0, 0];
  protected cornerY = [0, 0, 0, 0];

  // ── Cursor target edges for chasing corners ──
  protected cursorEdgeX = [0, 0];
  protected cursorEdgeY = [0, 0];

  // ── Timing ──
  protected lastTime = 0;
  protected opacity = 0;
  protected firstFrame = true;

  /** Whether the cursor is currently visible (has focus, collapsed caret). */
  protected cursorVisible = false;

  // ── Canvas metrics ──
  protected cssW = 0;
  protected cssH = 0;

  private rafId: number | null = null;
  private running = false;

  // GL resources
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private aPos: number;
  private u: Record<string, WebGLUniformLocation | null>;

  // ── Abstract methods: subclasses MUST implement ──

  /**
   * Measure the cursor position and set `cursorEdgeX/Y`.
   * Called every frame.  Return the PixelRect (in canvas-local coords)
   * if the cursor is visible, or null if it should be hidden.
   *
   * Implementations should set `cursorVisible` and `cursorEdgeX/Y` as
   * appropriate for their cursor source (xterm buffer vs Selection API).
   */
  protected abstract updateTarget(): void;

  /**
   * Optional: return per-frame render options (fill mode, blink, etc.).
   * Default implementation returns {} (cutout mode, no blink).
   */
  protected getRenderOptions(): RenderOptions {
    return {};
  }

  // ── Constructor ──

  constructor(canvas: HTMLCanvasElement, color: string) {
    this.canvas = canvas;
    this.colorRgb = hexToRgb(color);

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
      fillCursor: gl.getUniformLocation(program, 'u_fillCursor'),
      blink: gl.getUniformLocation(program, 'u_blink'),
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

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  // ── Protected helpers for subclasses ──

  /** Snap all 4 corners to the current cursor target (e.g. first frame). */
  protected snapCorners() {
    for (let i = 0; i < 4; i++) {
      this.cornerX[i] = this.cursorEdgeX[CORNER_IDX_X[i]];
      this.cornerY[i] = this.cursorEdgeY[CORNER_IDX_Y[i]];
    }
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

  // ── Private: Trail update logic (ported from kitty's cursor_trail.c) ──

  private updateCorners(dt: number) {
    const cursorCenterX = (this.cursorEdgeX[0] + this.cursorEdgeX[1]) * 0.5;
    const cursorCenterY = (this.cursorEdgeY[0] + this.cursorEdgeY[1]) * 0.5;
    const cursorDiag2 =
      Math.hypot(
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
        dot[i] =
          (dx[i] * (tx - cursorCenterX) + dy[i] * (ty - cursorCenterY)) /
          cursorDiag2 /
          dirLen;
      } else {
        dot[i] = 0;
      }

      if (dot[i] < minDot) minDot = dot[i];
      if (dot[i] > maxDot) maxDot = dot[i];
    }

    for (let i = 0; i < 4; i++) {
      if ((dx[i] === 0 && dy[i] === 0) || minDot === Infinity) continue;

      const decay =
        minDot === maxDot
          ? DECAY_SLOW
          : DECAY_SLOW +
            (DECAY_FAST - DECAY_SLOW) *
              ((dot[i] - minDot) / (maxDot - minDot));

      const step = 1.0 - Math.pow(2, (-10.0 * dt) / decay);
      this.cornerX[i] += dx[i] * step;
      this.cornerY[i] += dy[i] * step;
    }
  }

  private updateOpacity(dt: number) {
    // Faithful port of kitty's update_cursor_trail_opacity().
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

    const opts = this.getRenderOptions();

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
    gl.uniform3f(
      this.u.color,
      this.colorRgb[0],
      this.colorRgb[1],
      this.colorRgb[2],
    );
    gl.uniform1f(this.u.opacity, this.opacity);
    gl.uniform1f(this.u.fillCursor, opts.fillCursor ? 1.0 : 0.0);
    gl.uniform1f(this.u.blink, opts.blink ?? 1.0);

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

    this.updateTarget();
    this.updateCorners(dt);
    this.updateOpacity(dt);
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  };
}
