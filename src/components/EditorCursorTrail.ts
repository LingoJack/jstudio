/**
 * EditorCursorTrail — GPU-accelerated cursor trail for the TipTap editor.
 *
 * This is a standalone, self-contained adaptation of the terminal's
 * CursorTrail, reworked for contentEditable editors.  Instead of reading
 * cursor position from xterm's buffer, it reads the browser caret position
 * via the Selection/Range API.
 *
 * HOW IT WORKS (same physics as kitty terminal):
 *
 *   The trail is a single quad (2 triangles) whose 4 corners chase the
 *   caret's 4 corners with exponential ease-out.  Corners "ahead" in the
 *   motion direction catch up fast (DECAY_FAST = 0.1s); corners "behind"
 *   lag (DECAY_SLOW = 0.4s), stretching the quad into a comet-tail shape.
 *
 *   The fragment shader cuts out the caret's real rectangle so the visible
 *   caret is never obscured.  The comet shape comes entirely from the
 *   asymmetric corner easing, not from any fragment-level gradient.
 *
 * RENDERING: WebGL2, single shader program, one VAO + one VBO (12 floats),
 * updated each frame via bufferSubData.  Runs on requestAnimationFrame.
 *
 * VISIBILITY RULES:
 *   - Trail is visible only when the editor has focus AND the selection is
 *     collapsed (a blinking caret, not a text selection range).
 *   - When the editor loses focus or a text range is selected, the trail
 *     fades out smoothly via the opacity ramp.
 */

import { TRAIL_VS, TRAIL_FS } from './terminal/shaders';
import type { EditorCursorStyle } from '../lib/storage';

// ── Kitty-default decay constants (seconds) ──────────────────────────
const DECAY_FAST = 0.1;
const DECAY_SLOW = 0.4;

// ── Corner index mapping (from kitty's cursor_trail.c) ───────────────
//   corner 0 = top-right, 1 = bottom-right, 2 = bottom-left, 3 = top-left
const CORNER_IDX_X = [1, 1, 0, 0]; // right, right, left, left
const CORNER_IDX_Y = [0, 1, 1, 0]; // top, bottom, bottom, top

// ── Caret geometry ───────────────────────────────────────────────────
// The contentEditable caret is a thin vertical bar by default.
// We render the trail quad with a shape matching the selected cursor style.
const CARET_BAR_WIDTH_PX = 2;

/** Convert "#rrggbb" -> [r, g, b] with each channel in 0..1 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export class EditorCursorTrail {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;

  /** The ProseMirror editor DOM element (for focus detection). */
  private editorEl: HTMLElement | null = null;
  /** The scroll container that wraps the editor (for coordinate mapping). */
  private scrollContainer: HTMLElement | null = null;

  private colorRgb: [number, number, number] = [0, 0.5, 0.83];

  /** Current cursor shape — controls the trail geometry. */
  private cursorStyle: EditorCursorStyle = 'bar';

  /** Accumulated time (seconds) for cursor blink animation. */
  private blinkTime = 0;

  // ── Trail state: 4 chasing corners (overlay-canvas pixel coords) ──
  private cornerX = [0, 0, 0, 0];
  private cornerY = [0, 0, 0, 0];

  // ── Caret target edges for chasing corners ──
  private cursorEdgeX = [0, 0];
  private cursorEdgeY = [0, 0];

  // ── Timing ──
  private lastTime = 0;
  private opacity = 0;
  private firstFrame = true;

  /** Whether the caret is currently visible (editor focused + collapsed). */
  private cursorVisible = false;

  // ── Canvas metrics ──
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

  /**
   * @param canvas           An overlay canvas positioned over the editor area.
   * @param color            Trail color as "#rrggbb".
   * @param editorEl         The .ProseMirror element.
   * @param scrollContainer  The scrollable ancestor container.
   */
  constructor(
    canvas: HTMLCanvasElement,
    color: string,
    editorEl: HTMLElement,
    scrollContainer: HTMLElement,
  ) {
    this.canvas = canvas;
    this.editorEl = editorEl;
    this.scrollContainer = scrollContainer;
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
      blinkPhase: gl.getUniformLocation(program, 'u_blinkPhase'),
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

  setCursorStyle(style: EditorCursorStyle) {
    this.cursorStyle = style;
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

  // ── Private: Caret measurement ──

  /**
   * Measure the caret position in overlay-canvas-local pixel coordinates.
   * Returns null when there is no collapsed caret (no focus, or a text
   * range selection is active).
   */
  private measureCaretRect(): { left: number; right: number; top: number; bottom: number } | null {
    if (!this.editorEl || !this.scrollContainer) return null;

    // The editor must contain the active element (focused).
    if (!this.editorEl.contains(document.activeElement)) return null;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    // Only show trail for collapsed caret — not for text selection ranges.
    if (!range.collapsed) return null;

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      // Some browsers return zero-size rect for empty-line carets.
      // Fall back to a temporary span technique.
      return this.measureCaretViaTempSpan();
    }

    return this.toCanvasLocal(rect);
  }

  /**
   * Fallback caret measurement: insert a temporary zero-width span at the
   * caret position and measure its bounding rect.  This handles the edge
   * case where getBoundingClientRect() on a collapsed range returns a
   * zero-size rect (e.g. in an empty paragraph).
   */
  private measureCaretViaTempSpan(): { left: number; right: number; top: number; bottom: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.textContent = '\u200b'; // zero-width space
    span.style.display = 'inline-block';

    const clonedRange = range.cloneRange();
    clonedRange.insertNode(span);

    const rect = span.getBoundingClientRect();
    const parent = span.parentNode;
    if (parent) parent.removeChild(span);

    // Restore the selection (removing the span may have shifted it).
    sel.removeAllRanges();
    sel.addRange(range);

    if (rect.width === 0 && rect.height === 0) return null;

    return this.toCanvasLocal(rect);
  }

  /**
   * Convert a screen-space DOMRect to overlay-canvas-local coordinates,
   * adjusting the shape to match the selected cursor style.
   */
  private toCanvasLocal(rect: DOMRect): { left: number; right: number; top: number; bottom: number } | null {
    const canvasRect = this.canvas.getBoundingClientRect();
    const left = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;
    const height = Math.max(rect.height, 1);

    let trailLeft: number;
    let trailRight: number;
    let trailTop: number;
    let trailBottom: number;

    switch (this.cursorStyle) {
      case 'block':
        // Full character-cell rectangle.  The browser caret is a thin bar,
        // so we widen the target to approximate one character width (~0.6em).
        // We use the measured height as a proxy for em size.
        const charWidth = Math.max(height * 0.6, CARET_BAR_WIDTH_PX);
        trailLeft = left;
        trailRight = left + charWidth;
        trailTop = top;
        trailBottom = top + height;
        break;
      case 'underline':
        // Horizontal bar at the bottom of the line — ~15% of line height.
        const underH = Math.max(height * 0.15, 2);
        trailLeft = left;
        trailRight = left + Math.max(rect.width, CARET_BAR_WIDTH_PX);
        trailTop = top + height - underH;
        trailBottom = top + height;
        break;
      case 'bar':
      default:
        trailLeft = left;
        trailRight = left + Math.max(rect.width, CARET_BAR_WIDTH_PX);
        trailTop = top;
        trailBottom = top + height;
        break;
    }

    // Reject if the caret is outside the canvas bounds entirely.
    if (trailRight < 0 || trailLeft > this.cssW || trailBottom < 0 || trailTop > this.cssH) return null;

    return { left: trailLeft, right: trailRight, top: trailTop, bottom: trailBottom };
  }

  // ── Private: Trail update logic (ported from kitty's cursor_trail.c) ──

  private updateTarget(caretRect: { left: number; right: number; top: number; bottom: number } | null) {
    if (caretRect) {
      this.cursorVisible = true;
      this.cursorEdgeX[0] = caretRect.left;
      this.cursorEdgeX[1] = caretRect.right;
      this.cursorEdgeY[0] = caretRect.top;
      this.cursorEdgeY[1] = caretRect.bottom;
    } else {
      this.cursorVisible = false;
    }

    if (this.firstFrame && caretRect) {
      // Snap corners to the caret on the very first frame to avoid a
      // fly-in from (0,0) when the editor first gets focus.
      for (let i = 0; i < 4; i++) {
        this.cornerX[i] = this.cursorEdgeX[CORNER_IDX_X[i]];
        this.cornerY[i] = this.cursorEdgeY[CORNER_IDX_Y[i]];
      }
      this.firstFrame = false;
    }
  }

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
    // When the caret is visible, opacity ramps up towards 1.0.
    // When not visible (editor blurred or text selected), it ramps down.
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

    // Fill mode: when the cursor is a block or underline we render a solid
    // blinking block inside the cursor rect (the native caret is hidden via
    // caret-color:transparent).  For 'bar' we use cutout mode so the native
    // thin caret shows through.
    const useFill = this.cursorStyle === 'block' || this.cursorStyle === 'underline';
    gl.uniform1f(this.u.fillCursor, useFill ? 1.0 : 0.0);

    // Blink phase: a sine-based pulse with ~1s period.
    //   sin oscillates -1..1; we map to 0..1.
    //   When moving (trail is stretching), we keep the cursor fully visible
    //   (no blink) — detected when the comet tail corners differ from the
    //   cursor edges by more than a few pixels.
    let blinkPhase = 1.0;
    if (useFill) {
      const isMoving =
        Math.abs(this.cornerX[0] - this.cursorEdgeX[1]) > 3 ||
        Math.abs(this.cornerX[2] - this.cursorEdgeX[0]) > 3;
      if (!isMoving) {
        // ~1s blink cycle (full on → full off → full on).
        const phase = (this.blinkTime % 1.06) / 1.06; // 0..1
        // Square-ish curve: visible ~53% of the time, hidden ~47%.
        blinkPhase = phase < 0.53 ? 1.0 : 0.0;
      }
    }
    gl.uniform1f(this.u.blinkPhase, blinkPhase);

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
    this.blinkTime += dt;

    const caretRect = this.measureCaretRect();
    this.updateTarget(caretRect);
    this.updateCorners(dt);
    this.updateOpacity(dt);
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  };
}
