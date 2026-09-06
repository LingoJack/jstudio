/** Blink animation timing constants and calculation for the editor cursor trail. */

import type { EditorCursorStyle } from '../../../types/settings';

/** Stay fully solid for this long after the caret moves/appears. */
export const BLINK_SOLID_MS = 400;

/** Full blink cycle (fade out + back in) once blinking begins. */
export const BLINK_PERIOD_MS = 700;

/**
 * Frame rate the loop drops to once the caret is stationary and only the
 * (slow, 700ms-period) blink remains to animate.  20fps is smooth enough
 * for a sine-fade blink yet cuts the WebView compositor cost to ~1/3 of the
 * 60fps spent during comet motion.
 */
export const THROTTLE_FPS = 30;

/**
 * Blink phase in 0..1 for the current cursor style.
 *
 * - bar / underline: SMOOTH sine fade (they float beside/below the text
 *   and never occlude it, so a gentle pulse looks best).
 * - block: HARD on/off.  A block sits on top of a glyph and inverts its
 *   colour; a partially-faded block would let the original glyph bleed
 *   through the half-transparent fill AND show the inverted glyph at
 *   reduced opacity - a muddy three-way blend.  Snapping between fully
 *   solid (clean inversion) and fully off (original glyph) keeps it crisp,
 *   exactly like a terminal block cursor.
 */
export function computeBlink(
  cursorVisibleStartTime: number,
  cursorStyle: EditorCursorStyle,
): number {
  const elapsed = performance.now() - cursorVisibleStartTime;
  if (elapsed < BLINK_SOLID_MS) return 1.0;

  if (cursorStyle === 'block') {
    // Hard square-wave: solid for the first half of each cycle, off for
    // the second.
    const t = (elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS;
    return t < BLINK_PERIOD_MS * 0.5 ? 1.0 : 0.0;
  }

  const phase = ((elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
  // cos: 1 -> -1 -> 1 over the period.  Map to 1 -> floor -> 1.
  const wave = (Math.cos(phase * Math.PI * 2) + 1) * 0.5; // 1..0..1
  const floor = 0.15;
  return floor + (1 - floor) * wave;
}
