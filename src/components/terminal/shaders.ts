/**
 * GLSL shaders for the cursor trail effect.
 *
 * Ported from kitty/trail_fragment.glsl.  The vertex shader draws a
 * full-screen quad in NDC and passes CSS-space pixel coordinates to
 * the fragment shader.  The fragment shader fills the trail rectangle
 * with the trail color but cuts out (zeroes alpha) the cursor's
 * current rectangle so the trail appears *behind* the cursor.
 */

export const TRAIL_VS = `#version 300 es
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

export const TRAIL_FS = `#version 300 es
precision mediump float;
in vec2 v_px;

// Cursor rectangle in pixel coords [left, right] x [top, bottom]
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
