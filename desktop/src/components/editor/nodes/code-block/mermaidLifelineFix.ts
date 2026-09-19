/**
 * mermaidLifelineFix - workaround for mermaid's hardcoded lifeline length.
 *
 * Upstream mermaid (verified against 11.16.0 - 11.17.2) draws every sequence
 * diagram lifeline as `<line class="actor-line 200" y2="2000">` - a fixed
 * 2000 user-unit length. Diagrams taller than 2000 units render with
 * lifelines that stop mid-air, leaving the lower messages, notes and frames
 * without lifelines. Diagrams shorter than 2000 units are unaffected: the
 * overflowing line is simply clipped by the viewBox.
 *
 * fixSequenceLifelines() extends every actor-line that falls short of the
 * viewBox bottom by more than LIFELINE_SHORTFALL_THRESHOLD, so the line runs
 * past the diagram edge and is clipped there - identical to how short
 * diagrams already render. Pure string transform, no DOM required.
 */

/** Must exceed the by-design lifeline gap of mirrored-actor renders (~75). */
const LIFELINE_SHORTFALL_THRESHOLD = 200;

/** Extra length past the viewBox bottom; the viewBox clips it. */
const LIFELINE_OVERFLOW = 20;

const LINE_TAG_PATTERN = /<line\b[^>]*>/g;
const Y2_ATTR_PATTERN = /\by2="(-?[\d.]+)"/;

/**
 * Extend sequence-diagram lifelines that fall short of the viewBox bottom.
 * Returns the input string unchanged for non-sequence SVGs (no viewBox) and
 * for renders whose lifelines already reach the bottom.
 */
export function fixSequenceLifelines(svg: string): string {
  const viewBox = svg.match(/viewBox="([^"]*)"/);
  if (!viewBox) return svg;
  const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return svg;
  const viewBoxBottom = parts[1] + parts[3];
  const extendedY2 = viewBoxBottom + LIFELINE_OVERFLOW;

  return svg.replace(LINE_TAG_PATTERN, (tag) => {
    if (!/\bactor-line\b/.test(tag)) return tag;
    const y2 = tag.match(Y2_ATTR_PATTERN);
    if (!y2) return tag;
    if (Number(y2[1]) >= viewBoxBottom - LIFELINE_SHORTFALL_THRESHOLD) {
      return tag;
    }
    return tag.replace(Y2_ATTR_PATTERN, `y2="${extendedY2}"`);
  });
}
