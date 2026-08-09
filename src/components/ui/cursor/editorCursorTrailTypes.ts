/** Shared types used across the editor cursor-trail sub-modules. */

/** Longhand font properties of a glyph, used to re-draw it identically. */
export interface GlyphFont {
  fontStyle: string;
  fontWeight: string;
  fontSize: string;
  fontFamily: string;
  letterSpacing: string;
}

/** Result of measuring the glyph at the caret position. */
export interface MeasuredGlyph {
  width: number;
  onChar: boolean;
  before: boolean;
  cover?: { text: string; rect: DOMRect; font: GlyphFont } | null;
}

/** Covered glyph info for the inverted-glyph overlay (block cursor). */
export interface CoveredGlyph {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  font: GlyphFont;
}

/** Callback signature for the cached per-element font-metrics lookup. */
export type MetricsAtFn = (node: Node | null) => { fontSize: number; lineHeight: number };

/** Result of converting a DOMRect to canvas-local coordinates. */
export interface CanvasLocalResult {
  rect: { left: number; right: number; top: number; bottom: number } | null;
  coveredGlyph: CoveredGlyph | null;
}
