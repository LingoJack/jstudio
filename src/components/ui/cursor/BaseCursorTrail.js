import { TRAIL_VS, TRAIL_FS } from "./shaders";
const DECAY_FAST = 0.1;
const DECAY_SLOW = 0.4;
const CORNER_IDX_X = [1, 1, 0, 0];
const CORNER_IDX_Y = [0, 1, 1, 0];
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  ];
}
class BaseCursorTrail {
  canvas;
  gl;
  colorRgb = [0, 0.5, 0.83];
  // ── Trail state: 4 chasing corners (overlay-canvas pixel coords) ──
  cornerX = [0, 0, 0, 0];
  cornerY = [0, 0, 0, 0];
  // ── Cursor target edges for chasing corners ──
  cursorEdgeX = [0, 0];
  cursorEdgeY = [0, 0];
  // ── Timing ──
  lastTime = 0;
  opacity = 0;
  firstFrame = true;
  /** Whether the cursor is currently visible (has focus, collapsed caret). */
  cursorVisible = false;
  // ── Canvas metrics ──
  cssW = 0;
  cssH = 0;
  rafId = null;
  /** Timer handle for the throttled (low-fps) loop path. */
  throttleTimer = null;
  running = false;
  /** Set once dispose() runs so a late wake() can't resurrect a dead trail. */
  disposed = false;
  /** Set once a frame throws, so we only log the first occurrence. */
  loggedError = false;
  // GL resources
  program;
  vao;
  vbo;
  aPos;
  u;
  /**
   * Optional: return per-frame render options (fill mode, blink, etc.).
   * Default implementation returns {} (cutout mode, no blink).
   */
  getRenderOptions() {
    return {};
  }
  /**
   * Whether the trail has nothing left to animate this frame and the rAF
   * loop may park itself ({@link loop}).  When this returns true the loop
   * stops and only resumes when {@link wake} is called.
   *
   * Default: idle once the trail has fully faded out AND the cursor is not
   * visible (used by the editor trail, whose `cursorVisible` flips false on
   * blur / range-selection).  Subclasses whose cursor is "always visible"
   * (e.g. the terminal) override this to park once the comet corners have
   * converged on a stationary cursor.
   */
  isIdle() {
    return !this.cursorVisible && this.opacity < 1e-3;
  }
  /**
   * Whether the loop should keep running but at a REDUCED frame rate
   * ({@link throttleFps}) rather than at full 60fps — used when the only
   * thing left to animate is a slow effect (e.g. a stationary caret's
   * blink) that does not need 60fps, but must not stop entirely.
   *
   * Checked only when {@link isIdle} is false.  Default: never throttle
   * (full 60fps until idle).  Subclasses that keep a low-frequency idle
   * animation override this.
   */
  shouldThrottle() {
    return false;
  }
  /** Frame rate to use while {@link shouldThrottle} holds.  Default 20fps. */
  throttleFps() {
    return 20;
  }
  // ── Constructor ──
  constructor(canvas, color) {
    this.canvas = canvas;
    this.colorRgb = hexToRgb(color);
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false
    });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;
    const vs = this.compile(gl.VERTEX_SHADER, TRAIL_VS);
    const fs = this.compile(gl.FRAGMENT_SHADER, TRAIL_FS);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Trail program link failed: " + gl.getProgramInfoLog(program));
    }
    this.program = program;
    this.aPos = gl.getAttribLocation(program, "a_pos");
    this.u = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      cursorRect: gl.getUniformLocation(program, "u_cursorRect"),
      color: gl.getUniformLocation(program, "u_color"),
      opacity: gl.getUniformLocation(program, "u_opacity"),
      fillCursor: gl.getUniformLocation(program, "u_fillCursor"),
      blink: gl.getUniformLocation(program, "u_blink")
    };
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, 12 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }
  // ── Lifecycle ──
  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }
  /**
   * Wake the loop if it has parked itself due to inactivity.
   *
   * The rAF loop stops itself once the trail is fully idle (faded out AND
   * the cursor is not visible) so a static editor performs zero per-frame
   * GPU work — see {@link loop}.  Any event that can change the caret
   * (selection move, edit, focus, scroll, resize) calls this to resume the
   * animation.  Subclasses route their markDirty() through here.
   *
   * If the loop is merely THROTTLED (alive, but stepping at the reduced
   * blink rate via setTimeout), we promote it back to an immediate rAF frame
   * so caret motion animates at full 60fps without waiting up to a throttle
   * interval — the throttled step would otherwise add ~50ms of lag to the
   * start of every comet trail.
   */
  wake() {
    if (this.disposed) return;
    if (this.running) {
      if (this.throttleTimer !== null) {
        clearTimeout(this.throttleTimer);
        this.throttleTimer = null;
        this.lastTime = performance.now();
        this.rafId = requestAnimationFrame(this.loop);
      }
      return;
    }
    this.start();
  }
  stop() {
    this.running = false;
    this.cancelScheduled();
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.opacity = 0;
  }
  dispose() {
    this.running = false;
    this.disposed = true;
    this.cancelScheduled();
    const gl = this.gl;
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
  /** Cancel whichever next-frame is scheduled (rAF or throttle timer). */
  cancelScheduled() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
  }
  setColor(color) {
    this.colorRgb = hexToRgb(color);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.wake();
  }
  // ── Protected helpers for subclasses ──
  /** Snap all 4 corners to the current cursor target (e.g. first frame). */
  snapCorners() {
    for (let i = 0; i < 4; i++) {
      this.cornerX[i] = this.cursorEdgeX[CORNER_IDX_X[i]];
      this.cornerY[i] = this.cursorEdgeY[CORNER_IDX_Y[i]];
    }
  }
  /**
   * Whether all 4 comet corners have essentially caught up to their target
   * cursor edges — i.e. the trailing animation has finished and nothing is
   * moving.  Used by {@link isIdle} overrides to park the loop once a
   * stationary caret has stopped animating.
   *
   * @param eps  Per-axis tolerance in pixels (sub-pixel residue is invisible).
   */
  cornersSettled(eps = 0.5) {
    for (let i = 0; i < 4; i++) {
      const tx = this.cursorEdgeX[CORNER_IDX_X[i]];
      const ty = this.cursorEdgeY[CORNER_IDX_Y[i]];
      if (Math.abs(tx - this.cornerX[i]) > eps || Math.abs(ty - this.cornerY[i]) > eps) {
        return false;
      }
    }
    return true;
  }
  // ── Private: GL helpers ──
  compile(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile error: " + gl.getShaderInfoLog(shader));
    }
    return shader;
  }
  // ── Private: Trail update logic (ported from kitty's cursor_trail.c) ──
  updateCorners(dt) {
    const cursorCenterX = (this.cursorEdgeX[0] + this.cursorEdgeX[1]) * 0.5;
    const cursorCenterY = (this.cursorEdgeY[0] + this.cursorEdgeY[1]) * 0.5;
    const cursorDiag2 = Math.hypot(
      this.cursorEdgeX[1] - this.cursorEdgeX[0],
      this.cursorEdgeY[1] - this.cursorEdgeY[0]
    ) * 0.5;
    const dx = [0, 0, 0, 0];
    const dy = [0, 0, 0, 0];
    const dot = [0, 0, 0, 0];
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
      if (dx[i] === 0 && dy[i] === 0 || minDot === Infinity) continue;
      const decay = minDot === maxDot ? DECAY_SLOW : DECAY_SLOW + (DECAY_FAST - DECAY_SLOW) * ((dot[i] - minDot) / (maxDot - minDot));
      const step = 1 - Math.pow(2, -10 * dt / decay);
      this.cornerX[i] += dx[i] * step;
      this.cornerY[i] += dy[i] * step;
    }
  }
  updateOpacity(dt) {
    if (this.cursorVisible) {
      this.opacity += dt / DECAY_SLOW;
      if (this.opacity > 1) this.opacity = 1;
    } else {
      this.opacity -= dt / DECAY_SLOW;
      if (this.opacity < 0) this.opacity = 0;
    }
  }
  // ── Private: Rendering ──
  render() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.opacity < 1e-3) return;
    const verts = new Float32Array([
      this.cornerX[0],
      this.cornerY[0],
      this.cornerX[1],
      this.cornerY[1],
      this.cornerX[3],
      this.cornerY[3],
      this.cornerX[1],
      this.cornerY[1],
      this.cornerX[2],
      this.cornerY[2],
      this.cornerX[3],
      this.cornerY[3]
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
      this.cursorEdgeY[1]
    );
    gl.uniform3f(
      this.u.color,
      this.colorRgb[0],
      this.colorRgb[1],
      this.colorRgb[2]
    );
    gl.uniform1f(this.u.opacity, this.opacity);
    gl.uniform1f(this.u.fillCursor, opts.fillCursor ? 1 : 0);
    gl.uniform1f(this.u.blink, opts.blink ?? 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
  // ── Main loop ──
  loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1e3);
    this.lastTime = now;
    try {
      this.updateTarget();
      this.updateCorners(dt);
      this.updateOpacity(dt);
      this.render();
    } catch (err) {
      if (!this.loggedError) {
        this.loggedError = true;
        console.error("[CursorTrail] frame update failed, recovering", err);
      }
      this.cursorVisible = false;
    }
    if (this.isIdle()) {
      this.running = false;
      this.rafId = null;
      this.throttleTimer = null;
      return;
    }
    this.rafId = null;
    if (this.shouldThrottle()) {
      const interval = 1e3 / Math.max(1, this.throttleFps());
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        if (this.running) this.rafId = requestAnimationFrame(this.loop);
      }, interval);
      return;
    }
    this.throttleTimer = null;
    this.rafId = requestAnimationFrame(this.loop);
  };
}
export {
  BaseCursorTrail,
  CORNER_IDX_X,
  CORNER_IDX_Y,
  DECAY_FAST,
  DECAY_SLOW,
  hexToRgb
};
