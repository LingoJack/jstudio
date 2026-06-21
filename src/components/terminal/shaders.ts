/**
 * GLSL shaders for the cursor trail — faithful port of kitty's approach.
 *
 * KEY INSIGHT: kitty does NOT draw a full-screen quad and test pixels.
 * Instead it draws the trail SHAPE directly as geometry — two triangles
 * whose 6 vertices are the 4 chasing corners.  The fragment shader is
 * trivially simple: it just cuts out the cursor rectangle.
 *
 * This means the comet-stretched shape comes for free from the
 * asymmetric corner easing, exactly like kitty.
 */

export const TRAIL_VS = `#version 300 es
/**
 * Per-vertex attributes: each of the 6 vertices gets its own (x, y)
 * position in CSS pixel coordinates.  We build 2 triangles from the
 * 4 chasing corners every frame.
 */
layout(location = 0) in vec2 a_pos;

uniform vec2 u_resolution;

out vec2 v_px;

void main() {
  // CSS pixel → NDC
  vec2 ndc = (a_pos / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;  // flip Y: CSS origin is top-left, NDC is bottom-left
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_px = a_pos;
}`;

export const TRAIL_FS = `#version 300 es
precision highp float;
in vec2 v_px;

// Cursor rectangle [left, right, top, bottom] in CSS pixels.
uniform vec4 u_cursorRect;
uniform vec3 u_color;
uniform float u_opacity;

// When > 0.5 the cursor rectangle is FILLED (rendered as a solid block)
// instead of being cut out.  Used for block / underline cursor styles
// where the native caret is hidden via caret-color:transparent.
uniform float u_fillCursor;

// Blink phase in 0..1 — modulates the fill opacity so the cursor
// pulses on and off when stationary.
uniform float u_blinkPhase;

out vec4 fragColor;

void main() {
    float opacity = u_opacity;
    // Test if fragment is inside the cursor rectangle.
    float in_x = step(u_cursorRect.x, v_px.x) * step(v_px.x, u_cursorRect.y);
    float in_y = step(u_cursorRect.z, v_px.y) * step(v_px.y, u_cursorRect.w);
    float inside = in_x * in_y;

    if (u_fillCursor > 0.5) {
      // FILL mode: inside the cursor rect, render a solid blinking block.
      // Outside the rect, render the trail comet (no cutout).
      if (inside > 0.5) {
        float blink = u_blinkPhase;
        if (blink < 0.003) discard;
        fragColor = vec4(u_color * blink, blink);
      } else {
        if (opacity < 0.003) discard;
        fragColor = vec4(u_color * opacity, opacity);
      }
    } else {
      // CUTOUT mode (default): erase the cursor rect so the native
      // caret shows through.
      opacity *= 1.0 - inside;
      if (opacity < 0.003) discard;
      fragColor = vec4(u_color * opacity, opacity);
    }
}`;
