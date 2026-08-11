const TRAIL_VS = `#version 300 es
/**
 * Per-vertex attributes: each of the 6 vertices gets its own (x, y)
 * position in CSS pixel coordinates.  We build 2 triangles from the
 * 4 chasing corners every frame.
 */
layout(location = 0) in vec2 a_pos;

uniform vec2 u_resolution;

out vec2 v_px;

void main() {
  // CSS pixel \u2192 NDC
  vec2 ndc = (a_pos / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;  // flip Y: CSS origin is top-left, NDC is bottom-left
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_px = a_pos;
}`;
const TRAIL_FS = `#version 300 es
precision highp float;
in vec2 v_px;

// Cursor rectangle [left, right, top, bottom] in CSS pixels.
uniform vec4 u_cursorRect;
uniform vec3 u_color;
uniform float u_opacity;

// When > 0.5 the entire quad is filled solid (no cutout).
// Used for 'block'/'underline' where the native caret is hidden \u2014
// the solid fill IS the cursor, so it's always visible.
uniform float u_fillCursor;

// Blink phase in 0..1 \u2014 modulates the fill opacity so the cursor
// pulses on and off when stationary.  1.0 = fully visible, 0.0 = hidden.
uniform float u_blink;

out vec4 fragColor;

void main() {
    float opacity = u_opacity;

    if (u_fillCursor <= 0.5) {
      // CUTOUT mode ('bar'): erase the cursor rect so the native
      // caret shows through.
      float in_x = step(u_cursorRect.x, v_px.x) * step(v_px.x, u_cursorRect.y);
      float in_y = step(u_cursorRect.z, v_px.y) * step(v_px.y, u_cursorRect.w);
      opacity *= 1.0 - in_x * in_y;
    } else {
      // FILL mode ('block'/'underline'): apply blink.
      opacity *= u_blink;
    }

    if (opacity < 0.003) discard;
    fragColor = vec4(u_color * opacity, opacity);
}`;
export {
  TRAIL_FS,
  TRAIL_VS
};
