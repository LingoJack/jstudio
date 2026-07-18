/**
 * EditorCursorTrail — editor cursor trail (contentEditable / ProseMirror),
 * built on BaseCursorTrail.
 *
 * Editor-specific responsibilities:
 *   - Reading cursor position from the browser Selection / Range API.
 *   - Deriving cell metrics from font-size (no fixed grid like xterm).
 *   - Shaping the trail quad by cursor style (bar / block / underline).
 *   - Blink is handled in SectionedEditorPanel via JS caret-color toggle.
 *
 * All GL pipeline, kitty physics, and rendering are inherited from
 * BaseCursorTrail — no duplication.
 */

import {
  BaseCursorTrail,
  type RenderOptions,
} from './BaseCursorTrail';
import type { EditorCursorStyle } from '../../../lib/core/storage';
import { logger } from '../../../lib/core/logger';
import { firstCodePoint, lastCodePoint, appendSpan } from './trailMath';

/** Longhand font properties of a glyph, used to re-draw it identically. */
interface GlyphFont {
  fontStyle: string;
  fontWeight: string;
  fontSize: string;
  fontFamily: string;
  letterSpacing: string;
}

// ── Caret geometry ───────────────────────────────────────────────────
const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;
/** Fallback character width (× font-size) when no glyph sits at the caret
 *  — e.g. end of line or empty paragraph.  The cursor then uses HALF of
 *  this, per the "no character → 1/2 width" rule. */
const CHAR_WIDTH_RATIO = 0.6;
const CARET_BAR_WIDTH_PX = 2;
/** Caret body height relative to font-size (a touch taller than the glyph
 *  so it visually matches the text, centred within the line box). */
const GLYPH_HEIGHT_RATIO = 1.15;

// ── Blink animation timing (ms) ──────────────────────────────────────
/** Stay fully solid for this long after the caret moves/appears. */
const BLINK_SOLID_MS = 530;
/** Full blink cycle (fade out + back in) once blinking begins. */
const BLINK_PERIOD_MS = 1060;
/**
 * Frame rate the loop drops to once the caret is stationary and only the
 * (slow, 1060ms-period) blink remains to animate.  20fps is smooth enough
 * for a sine-fade blink yet cuts the WebView compositor cost to ~1/3 of the
 * 60fps spent during comet motion.  See {@link EditorCursorTrail.shouldThrottle}.
 */
const THROTTLE_FPS = 20;

export class EditorCursorTrail extends BaseCursorTrail {
  /** The ProseMirror editor DOM element (for focus detection). */
  private editorEl: HTMLElement | null = null;
  /** The scroll container that wraps the editor (for coordinate mapping). */
  private scrollContainer: HTMLElement | null = null;

  /** Optional document-title <input> that lives OUTSIDE ProseMirror. When it
   *  holds focus we measure its caret via a hidden mirror, because the
   *  Selection / Range API cannot read a native input's caret. */
  private titleEl: HTMLInputElement | null = null;
  /** Hidden mirror element replicating the title input's text + font metrics,
   *  used to measure the title caret's pixel position. Lazily created. */
  private titleMirror: HTMLDivElement | null = null;

  /** Dynamic set of inputs inside NodeViews (e.g. CollapsibleView's summary
   *  input). When any of these holds focus, we measure its caret via mirror.
   *  Unlike titleEl, these inputs live INSIDE editorEl, so the normal check
   *  `editorEl.contains(activeElement)` passes, but Selection API still
   *  cannot read their caret. */
  private inputEls: Set<HTMLInputElement> = new Set();

  /** Current cursor shape — controls the trail geometry. */
  private cursorStyle: EditorCursorStyle = 'bar';

  /** When the cursor first became visible (ms epoch) — for blink phase. */
  private cursorVisibleStartTime = 0;
  /** Whether the caret position has changed since last frame. */
  private prevCaretKey = '';

  /**
   * TEMP DEBUG: diagnostic snapshot captured by refinePreCaretRect when the
   * caret is inside a <pre> code block, merged with canvas-local values and
   * logged by toCanvasLocal. Remove once the code-block caret bug is fixed.
   */
  private __dbgPreInfo: Record<string, unknown> | null = null;

  /**
   * Whether the caret geometry needs to be re-measured from the DOM.
   *
   * Measuring (getClientRects + getComputedStyle + the <pre> line-counting
   * fallback) forces a layout/style recalc and is the single most expensive
   * thing this class does.  The rAF loop runs at 60fps for the blink/trail
   * animation, but the caret geometry only changes on selection moves, edits,
   * focus changes, scrolls or resizes.  So instead of measuring every frame
   * we measure only when this flag is set (toggled via {@link markDirty}),
   * and reuse {@link cachedRect} on all other frames.  The animation itself
   * (corner easing, blink, GL render) is untouched and still runs every frame.
   */
  private dirty = true;
  /** Last measured caret rect (canvas-local), reused while not dirty. */
  private cachedRect: { left: number; right: number; top: number; bottom: number } | null = null;

  /**
   * Monotonic version tag for {@link metricsCache}.  Bumped by {@link resize}
   * and {@link invalidateMetrics} so a font-size / line-height / font-family
   * change invalidates every cached entry without walking the map.
   */
  private metricsVersion = 0;
  /**
   * Per-element cache of computed font metrics (fontSize + lineHeight).
   *
   * `getComputedStyle()` forces a style recalc, and the old code called it
   * 2–3× per caret measurement (font-size, line-height, and again inside
   * measureCodePoint).  These values change ONLY when the editor font
   * settings / zoom change — never while typing — so we cache them per
   * element and invalidate via {@link metricsVersion}.  This is purely an
   * input-gathering optimization: the trail easing / blink / GL render are
   * untouched, so the animation is byte-for-byte identical to before.
   */
  private metricsCache = new WeakMap<Element, { v: number; fontSize: number; lineHeight: number }>();

  /**
   * DOM overlay that re-draws the glyph covered by a block cursor in the
   * editor's *background* colour, so the character stays legible on top of
   * the opaque block (terminal-style colour inversion).  Lazily created.
   */
  private glyphEl: HTMLDivElement | null = null;
  /** The glyph currently sitting under the block cursor (canvas-local). */
  private coveredGlyph: {
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
    font: GlyphFont;
  } | null = null;
  /** Editor background colour for the inverted glyph (cached, refreshed on
   *  caret move). */
  private invertColor = '#1e1e1e';

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
    super(canvas, color);
    this.editorEl = editorEl;
    this.scrollContainer = scrollContainer;
    this.invertColor = this.resolveInvertColor();
  }

  /**
   * Colour to paint the glyph that a block cursor covers.  We use the
   * editor's background colour so the character reads as inverted (e.g.
   * white-on-dark text becomes dark-on-green-block), matching how a
   * terminal block cursor swaps foreground/background.
   */
  private resolveInvertColor(): string {
    const fromVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-editor-background')
      .trim();
    if (fromVar) return fromVar;
    // Walk up from the editor for a non-transparent background.
    let el: HTMLElement | null = this.editorEl;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0')) return bg;
      el = el.parentElement;
    }
    return '#1e1e1e';
  }

  // ── Public API ──

  setCursorStyle(style: EditorCursorStyle) {
    this.cursorStyle = style;
    // Shape changed → geometry (e.g. covered glyph, block vs bar) must be
    // recomputed on the next frame.
    this.dirty = true;
    this.wake();
  }

  /**
   * Register (or clear) the document-title <input> as an alternate caret
   * host.  While this input holds focus, {@link measureCaretRect} measures
   * its caret via a hidden mirror instead of the editor's Selection/Range,
   * so the title gets the same animated trail cursor as the body.
   */
  setTitleEl(el: HTMLInputElement | null) {
    this.titleEl = el;
  }

  /**
   * Register an input inside a NodeView (e.g. CollapsibleView's summary input)
   * as an alternate caret host. These inputs live INSIDE editorEl, so the
   * normal focus check passes, but Selection API cannot read their caret.
   * Call this when the input mounts. Returns an unregister function.
   */
  registerInputEl(el: HTMLInputElement): () => void {
    this.inputEls.add(el);
    return () => {
      this.inputEls.delete(el);
    };
  }

  /**
   * Mark the caret geometry as stale so the next animation frame re-measures
   * it from the DOM.  Cheap (just sets a flag) — call it on any event that
   * can move the caret or reflow the editor: selection changes, edits, focus
   * changes, scroll, resize.  Between dirty marks the loop reuses the cached
   * rect and performs NO DOM reads, while the trail/blink animation keeps
   * running every frame exactly as before.
   *
   * Also wakes the rAF loop if it has parked itself due to inactivity (the
   * loop stops when the trail is fully idle — see BaseCursorTrail.loop).
   */
  markDirty() {
    this.dirty = true;
    this.wake();
  }

  /**
   * TEMP DEBUG: snapshot of the most recent `<pre>` caret computation
   * (raw rect, adjacent-glyph anchor, and final caret rect), regardless of
   * whether that caret was clipped/hidden or actually drawn. Exposed so
   * external diagnostics (see CodeBlockView's `__cursorSyncLog`) can log
   * the WebGL trail's own numbers side-by-side with ProseMirror's
   * `coordsAtPos` and the native DOM selection rect, to pinpoint exactly
   * which stage disagrees with the browser when the two visibly diverge.
   * Remove once the code-block caret bug is fixed.
   */
  getDebugSnapshot(): Record<string, unknown> | null {
    if (!this.__dbgPreInfo) return null;
    return { ...this.__dbgPreInfo, canvasLocalCachedRect: this.cachedRect };
  }

  /**
   * Make this trail appear INSTANTLY at the current caret, fully opaque and
   * snapped to position — skipping both the opacity fade-in and the comet
   * fly-in from the corners' previous resting place.
   *
   * Why: in the sectioned editor each section owns its own trail. When focus
   * moves between sections (click, arrow keys crossing a boundary, Cmd+↑/↓),
   * the newly-focused section's trail would otherwise start from opacity 0
   * and ease in over ~0.4s, and its corners would fly from wherever they were
   * left — reading as "cursor disappears, then slowly reappears". Calling this
   * on focus makes the hand-off look like one continuous caret.
   */
  activate() {
    // Re-measure now so the corners snap to the real caret, not a stale rect.
    this.dirty = true;
    this.cachedRect = this.measureCaretRect();
    if (this.cachedRect) {
      this.cursorVisible = true;
      this.cursorEdgeX[0] = this.cachedRect.left;
      this.cursorEdgeX[1] = this.cachedRect.right;
      this.cursorEdgeY[0] = this.cachedRect.top;
      this.cursorEdgeY[1] = this.cachedRect.bottom;
      this.snapCorners();
      this.opacity = 1;
      this.cursorVisibleStartTime = performance.now(); // solid, not mid-blink
      this.dirty = false;
    }
    this.wake();
  }

  /** Re-measure on resize: the canvas-local mapping depends on canvas size. */
  resize() {
    super.resize();
    this.dirty = true;
    // A resize often accompanies a zoom / layout change that can shift
    // computed font metrics, so drop the cache too.
    this.metricsVersion++;
    this.wake();
  }

  /**
   * Invalidate the cached per-element font metrics (font-size / line-height)
   * and the inverted-glyph background colour.  Call this when the editor font
   * settings change (font family, font size, line height, theme) — the values
   * are otherwise assumed stable while typing.  Cheap: just bumps a version
   * counter and re-reads one CSS variable; the next measured frame refreshes
   * everything lazily.  Does NOT touch the animation state.
   */
  invalidateMetrics() {
    this.metricsVersion++;
    this.invertColor = this.resolveInvertColor();
    this.dirty = true;
    this.wake();
  }

  stop() {
    super.stop();
    if (this.glyphEl) this.glyphEl.style.display = 'none';
  }

  dispose() {
    super.dispose();
    if (this.glyphEl?.parentNode) this.glyphEl.parentNode.removeChild(this.glyphEl);
    this.glyphEl = null;
    if (this.titleMirror?.parentNode) this.titleMirror.parentNode.removeChild(this.titleMirror);
    this.titleMirror = null;
  }

  // ── BaseCursorTrail implementation ──

  /**
   * Throttle predicate — when to drop from full 60fps rAF to a low-frequency
   * blink loop instead of parking entirely.
   *
   * The base default parks the loop only when the cursor is INVISIBLE (blur /
   * range selection).  But the overwhelmingly common state is "editor
   * focused, caret sitting still" — there `cursorVisible` stays true forever,
   * so without throttling the full-editor WebGL overlay gets recomposited
   * 60×/second by the WebView compositor (the high idle GPU / heat this
   * targets).
   *
   * We can't simply PARK a stationary visible caret the way kitty's terminal
   * does, because we keep the blink animation (kitty blinks too) — a parked
   * loop would freeze the caret mid-fade.  Instead, once the comet corners
   * have converged and the caret has faded in, the only thing left to animate
   * is the blink, which is slow (1060ms period) and needs nowhere near 60fps.
   * So we keep the loop alive but throttled to {@link THROTTLE_FPS}, cutting
   * the compositor cost to ~1/3 while the caret keeps blinking smoothly.
   *
   * Any caret motion / edit / scroll calls markDirty()→wake() and the loop
   * returns to full 60fps for the comet animation (shouldThrottle goes false
   * the moment the corners are no longer settled).
   */
  protected shouldThrottle(): boolean {
    return this.cursorVisible && this.opacity >= 0.999 && this.cornersSettled();
  }

  /** Blink-only throttle rate (see {@link THROTTLE_FPS}). */
  protected throttleFps(): number {
    return THROTTLE_FPS;
  }

  /**
   * Per-frame target update.
   *
   * Event-driven measurement: the expensive DOM read (`measureCaretRect`)
   * runs ONLY when {@link dirty} is set — i.e. right after a selection move,
   * edit, focus change, scroll or resize raised it via {@link markDirty}.
   * On every other frame we reuse {@link cachedRect}, so a static (merely
   * blinking) caret performs zero layout/style work.  The trail easing, blink
   * and GL render below/around this still run every frame, so the animation
   * is byte-for-byte identical to before — only the measurement cadence drops
   * from 60fps to "once per actual change".
   */
  protected updateTarget() {
    if (this.dirty) {
      this.cachedRect = this.measureCaretRect();
      this.dirty = false;
    }

    const caretRect = this.cachedRect;

    if (caretRect) {
      // Detect if the caret position changed — reset blink timer so the
      // cursor immediately appears solid when you type or move.
      const key = `${caretRect.left.toFixed(1)}|${caretRect.top.toFixed(1)}`;
      const wasHidden = !this.cursorVisible;
      this.cursorVisible = true;
      this.cursorEdgeX[0] = caretRect.left;
      this.cursorEdgeX[1] = caretRect.right;
      this.cursorEdgeY[0] = caretRect.top;
      this.cursorEdgeY[1] = caretRect.bottom;
      if (key !== this.prevCaretKey || wasHidden) {
        this.cursorVisibleStartTime = performance.now();
        this.prevCaretKey = key;
      }
    } else {
      this.cursorVisible = false;
    }

    if (this.firstFrame && caretRect) {
      this.snapCorners();
      this.firstFrame = false;
    }

    // Sync the inverted-glyph overlay (block cursor only).  Cheap: it only
    // touches DOM styles on the single overlay element and reads the cached
    // `coveredGlyph` — its per-frame opacity tracks the blink animation.
    this.syncGlyphOverlay();
  }

  /**
   * Render / position / hide the DOM overlay that re-draws the glyph sitting
   * under a block cursor in the editor's background colour.
   *
   * The WebGL block is drawn in the trail colour and is opaque, so it hides
   * whatever character it covers.  Rather than dimming the block (which
   * leaves the glyph muddy), we paint the same character on top of it in the
   * inverted colour — exactly how a terminal block cursor inverts fg/bg.
   *
   * The overlay's opacity tracks the block's blink so the glyph fades in
   * lock-step with the block (they invert together, never out of phase).
   */
  private syncGlyphOverlay() {
    const g = this.cursorVisible ? this.coveredGlyph : null;
    if (!g) {
      if (this.glyphEl) this.glyphEl.style.display = 'none';
      return;
    }

    if (!this.glyphEl) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'absolute',
        pointerEvents: 'none',
        display: 'block',
        textAlign: 'left',
        whiteSpace: 'pre',
        margin: '0',
        padding: '0',
        boxSizing: 'border-box',
        overflow: 'visible',
        zIndex: '1',
      } as Partial<CSSStyleDeclaration>);
      // Layer the glyph above the trail canvas inside the same overlay.
      this.canvas.parentElement?.appendChild(el);
      this.glyphEl = el;
    }

    const el = this.glyphEl;
    el.style.display = 'block';
    el.style.left = `${g.left}px`;
    el.style.top = `${g.top}px`;
    el.style.width = `${g.width}px`;
    el.style.height = `${g.height}px`;
    // Apply font as LONGHAND props (the `font` shorthand silently fails on
    // some font-variant values, dropping back to 16px).  The glyph's
    // bounding rect IS its original line box, so setting line-height to the
    // rect height reproduces the baseline exactly — only colour changes.
    const f = g.font;
    el.style.fontStyle = f.fontStyle;
    el.style.fontWeight = f.fontWeight;
    el.style.fontSize = f.fontSize;
    el.style.fontFamily = f.fontFamily;
    el.style.letterSpacing = f.letterSpacing;
    el.style.lineHeight = `${g.height}px`;
    el.style.color = this.invertColor;
    el.style.opacity = String(this.computeBlink());
    if (el.textContent !== g.text) el.textContent = g.text;
  }

  /**
   * Render options: FILL mode for all styles.
   *
   * The WebGL fill IS the cursor — the solid quad is shaped per style
   * (bar / block / underline) in {@link toCanvasLocal}, and the native
   * caret is hidden by SectionedEditorPanel (caret-color: transparent).  This is
   * what lets `block` render as a solid block and `underline` as a bar
   * along the baseline — the native caret can only ever be a thin line.
   *
   * Blink is computed here as a smooth 0..1 multiplier so the cursor
   * fades out and back in (rather than a hard on/off), and is reset to
   * fully-solid whenever the caret moves or reappears.
   */
  protected getRenderOptions(): RenderOptions {
    return { fillCursor: true, blink: this.computeBlink() };
  }

  /**
   * Blink phase in 0..1 for the current cursor style.
   *
   * - bar / underline: SMOOTH sine fade (they float beside/below the text
   *   and never occlude it, so a gentle pulse looks best).
   * - block: HARD on/off.  A block sits on top of a glyph and inverts its
   *   colour; a partially-faded block would let the original glyph bleed
   *   through the half-transparent fill AND show the inverted glyph at
   *   reduced opacity — a muddy three-way blend.  Snapping between fully
   *   solid (clean inversion) and fully off (original glyph) keeps it crisp,
   *   exactly like a terminal block cursor.
   */
  private computeBlink(): number {
    const elapsed = performance.now() - this.cursorVisibleStartTime;
    if (elapsed < BLINK_SOLID_MS) return 1.0;

    if (this.cursorStyle === 'block') {
      // Hard square-wave: solid for the first half of each cycle, off for
      // the second.
      const t = (elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS;
      return t < BLINK_PERIOD_MS * 0.5 ? 1.0 : 0.0;
    }

    const phase = ((elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
    // cos: 1 → -1 → 1 over the period.  Map to 1 → floor → 1.
    const wave = (Math.cos(phase * Math.PI * 2) + 1) * 0.5; // 1..0..1
    const floor = 0.15;
    return floor + (1 - floor) * wave;
  }

  // ── Private: Caret measurement ──

  /**
   * Measure the caret position in overlay-canvas-local pixel coordinates.
   * Returns null when there is no collapsed caret (no focus, or a text
   * range selection is active).
   */
  private measureCaretRect(): { left: number; right: number; top: number; bottom: number } | null {
    // ── Title <input> branch ──
    // The document title is a native <input> sitting ABOVE the ProseMirror
    // surface. A native input exposes no DOM Range for its internal text, so
    // the Selection / Range API below cannot read its caret. When the title
    // holds focus we measure it via a hidden mirror element instead; every
    // other case falls through to the editor (contentEditable) path.
    if (this.titleEl && document.activeElement === this.titleEl) {
      return this.measureTitleCaretRect(this.titleEl);
    }

    // ── NodeView <input> branch ──
    // Inputs inside NodeViews (e.g. CollapsibleView's summary input) also need
    // mirror measurement. They live INSIDE editorEl, so the normal focus check
    // passes, but Selection API still cannot read their caret.
    const activeEl = document.activeElement;
    if (activeEl && activeEl instanceof HTMLInputElement && this.inputEls.has(activeEl)) {
      return this.measureTitleCaretRect(activeEl);
    }

    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

    // TEMP DEBUG — detect whether the caret sits inside a <pre> so we only log
    // for code blocks (normal text would spam). Logs the reason at every early
    // return so we can see exactly where measurement bails out.
    let inPre = false;
    if (range) {
      let n: Node | null =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer.parentElement;
      while (n) {
        if (n.nodeName === 'PRE') {
          inPre = true;
          break;
        }
        n = (n as HTMLElement).parentElement;
      }
    }
    const dbgBail = (reason: string) => {
      if (!inPre) return;
      const ae = document.activeElement as HTMLElement | null;
      logger.debug('[caret-dbg] BAIL:', reason, {
        hasEditor: !!this.editorEl,
        hasScroll: !!this.scrollContainer,
        editorHasActive: this.editorEl?.contains(ae) ?? false,
        activeEl: ae ? `${ae.nodeName}.${ae.className}` : null,
        rangeCount: sel?.rangeCount ?? 0,
        collapsed: range?.collapsed ?? null,
      });
    };

    if (!this.editorEl || !this.scrollContainer) {
      dbgBail('no editorEl/scrollContainer');
      return null;
    }

    // The editor must contain the active element (focused).
    if (!this.editorEl.contains(document.activeElement)) {
      dbgBail('editor NOT focused (activeElement outside editor)');
      return null;
    }

    if (!sel || !range) {
      dbgBail('no selection/range');
      return null;
    }

    if (!range.collapsed) {
      dbgBail('range not collapsed');
      return null;
    }

    // ── Workaround: WebKit getBoundingClientRect() on collapsed ranges ──
    //
    // For a collapsed caret inside a multi-line text node (very common in
    // `<pre>` code blocks with `white-space: pre`), WebKit/WKWebView's
    // `range.getBoundingClientRect()` returns the **union** of every line
    // box the range touches — NOT the single line box the caret is on.
    //
    // Concretely, when the caret sits on the last line of a multi-line code
    // block:
    //   rect.top    = top of the FIRST line (wrong — should be the last line)
    //   rect.height = total height of ALL lines
    //   rect.width  = width of the WIDEST line (wrong — should be 0)
    //
    // This produces two visible bugs:
    //   1. Cursor appears at the bottom, overlapping the code block border
    //      (because `toCanvasLocal` centres the em-box within an oversized
    //      `lineHeight`).
    //   2. Cursor width is wider than normal (because `rect.width` reflects
    //      the widest line, not the caret's actual zero-width position).
    //
    // The fix: use `getClientRects()` which, even for a collapsed range,
    // returns an array of per-line boxes.  We pick the LAST one — that is
    // always the line box the caret physically sits on (browsers lay out
    // line boxes top-to-bottom, and the caret is at the end of the last
    // box).
    //
    // Chromium has never had this bug, so this is purely a WebKit fix.
    // The fallback to `getBoundingClientRect()` preserves the original
    // behaviour for any edge case where `getClientRects()` is empty.
    const rects = range.getClientRects();
    let rawRect: DOMRect;
    if (rects.length > 0) {
      // Last client rect = the actual line box the caret is on.
      rawRect = rects[rects.length - 1];
    } else {
      rawRect = range.getBoundingClientRect();
    }

    const { fontSize, lineHeight } = this.metricsAt(range.startContainer);

    // ── Refine the rect for <pre> code blocks ──
    //
    // Even with getClientRects(), WebKit can return a rect whose top/height
    // span multiple lines inside <pre white-space:pre>.  refinePreCaretRect()
    // deterministically recomputes the caret's vertical position from the
    // <pre> geometry + line number, eliminating both the vertical overlap
    // bug and the width inflation bug at their source.
    const rect = this.refinePreCaretRect(rawRect, range, lineHeight);

    // null = the caret is inside a code block but scrolled out of its visible
    // band → hide the cursor (don't draw it floating over other content).
    if (!rect) {
      this.coveredGlyph = null;
      return null;
    }

    const glyph = this.measureGlyphAt(range, fontSize);

    // With the per-line rect from getClientRects(), a collapsed caret on a
    // real character has width 0 and height ≈ lineHeight.  But a collapsed
    // caret at an "empty" spot (truly empty paragraph, or between blocks)
    // also returns width=0 height=0 — that's the tempSpan fallback case.
    if (rect.width === 0 && rect.height === 0) {
      this.coveredGlyph = null;
      return this.measureCaretViaTempSpan(lineHeight);
    }

    return this.toCanvasLocal(rect, fontSize, lineHeight, glyph);
  }

  /**
   * Measure the glyph the caret is anchored to.
   *
   * Preference order:
   *   1. Character *after* the caret (the one you'd overtype) → anchor to
   *      the right of the caret.
   *   2. If nothing follows (end of line / end of text), the character
   *      *before* the caret (the one the caret visually sits under, e.g.
   *      a Chinese glyph you just typed) → anchor to the left.
   *   3. Neither → half-width fallback.
   *
   * Returning the real advance width makes the cursor match CJK / wide /
   * narrow glyphs exactly; `before` tells the caller which side of the
   * caret the glyph occupies so it can position the cursor over it.  When
   * a real glyph is found, `cover` carries everything needed to re-draw it
   * in the inverted colour on top of a block cursor.
   */
  private measureGlyphAt(
    caret: Range,
    fontSize: number,
  ): {
    width: number;
    onChar: boolean;
    before: boolean;
    cover: { text: string; rect: DOMRect; font: GlyphFont } | null;
  } {
    const fallback = fontSize * CHAR_WIDTH_RATIO;
    const node = caret.startContainer;
    const offset = caret.startOffset;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';

      // 1. Character after the caret (skip line breaks — `\n` / `\r` are
      //    not visible glyphs, and on WebKit their getBoundingClientRect()
      //    inside `<pre>` spans the entire previous line's width, which
      //    inflates the cursor width).
      if (offset < text.length) {
        const ch = text[offset];
        if (ch !== '\n' && ch !== '\r') {
          const m = this.measureCodePoint(node, offset, text, +1);
          if (m) return { width: m.rect.width, onChar: true, before: false, cover: m };
        }
      }

      // 2. Character before the caret (skip line breaks — same reason).
      if (offset > 0) {
        const ch = text[offset - 1];
        if (ch !== '\n' && ch !== '\r') {
          const m = this.measureCodePoint(node, offset, text, -1);
          if (m) return { width: m.rect.width, onChar: true, before: true, cover: m };
        }
      }
    }

    return { width: fallback, onChar: false, before: false, cover: null };
  }

  /**
   * Measure the code point adjacent to `offset` in `text`: its bounding
   * rect, the character string, and the computed font of its container
   * (so it can be re-rendered identically by the inverted-glyph overlay).
   *
   * @param dir +1 = the character starting at `offset` (after the caret),
   *            -1 = the character ending at `offset` (before the caret).
   */
  private measureCodePoint(
    node: Node,
    offset: number,
    text: string,
    dir: 1 | -1,
  ): { text: string; rect: DOMRect; font: GlyphFont } | null {
    try {
      const r = document.createRange();
      let start: number;
      let end: number;
      if (dir === 1) {
        const cp = text.codePointAt(offset);
        const len = cp !== undefined && cp > 0xffff ? 2 : 1;
        start = offset;
        end = Math.min(offset + len, text.length);
      } else {
        const prev = text.codePointAt(offset - 2);
        const isPair = offset >= 2 && prev !== undefined && prev > 0xffff;
        start = offset - (isPair ? 2 : 1);
        end = offset;
      }
      r.setStart(node, start);
      r.setEnd(node, end);

      // Use getClientRects() instead of getBoundingClientRect() — the same
      // WebKit/WKWebView multi-line bug that affects collapsed ranges (see
      // measureCaretRect) also affects non-collapsed ranges inside multi-
      // line text nodes (e.g. <pre> code blocks with white-space: pre).
      // getBoundingClientRect() returns the union of ALL line boxes, making
      // rect.width = width of the WIDEST line instead of the single char.
      // getClientRects() returns per-line boxes; a single character lives on
      // exactly one line, so we get its true advance width.
      const rects = r.getClientRects();
      let rect: DOMRect;
      if (rects.length > 0) {
        rect = rects[rects.length - 1];
      } else {
        rect = r.getBoundingClientRect();
      }

      // ── Width sanity cap ──
      // A single code point's advance width should never exceed roughly
      // 2× the font-size (CJK and emoji glyphs are at most ~1em wide; even
      // generous tab stops don't exceed this for a single character).  When
      // getClientRects() is empty and we fall back to getBoundingClientRect()
      // on a multi-line text node, WebKit returns the union of all line
      // boxes — which can be hundreds of pixels wide (the widest line),
      // making the cursor explode.  Cap it here as a last line of defence.
      const parent =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement;
      // Use the cached metrics for the cap — no fresh getComputedStyle().
      const fs = this.metricsAt(parent).fontSize;
      const maxGlyphWidth = Math.max(fs * 2, 32); // never less than 32px floor
      if (rect.width > maxGlyphWidth) return null;
      if (rect.width <= 0.5) return null;

      // The longhand font properties are ONLY consumed when a `block` cursor
      // re-draws the covered glyph (see toCanvasLocal → syncGlyphOverlay).
      // For `bar` / `underline` the `cover` field is never read, so we skip
      // the expensive getComputedStyle() entirely and return a placeholder
      // font.  This keeps per-keystroke measurement cheap in the common case
      // while leaving the block-cursor inversion pixel-identical.
      let fontStyle: GlyphFont;
      if (this.cursorStyle === 'block') {
        // Capture longhand font properties — NOT the `font` shorthand.  The
        // shorthand is invalid (and silently ignored, falling back to the
        // browser default 16px) whenever font-variant is something CSS won't
        // accept in the shorthand, which made the inverted glyph shrink.
        const cs = parent ? getComputedStyle(parent) : null;
        fontStyle = {
          fontStyle: cs?.fontStyle ?? 'normal',
          fontWeight: cs?.fontWeight ?? 'normal',
          fontSize: cs?.fontSize ?? '16px',
          fontFamily: cs?.fontFamily ?? 'inherit',
          letterSpacing: cs?.letterSpacing ?? 'normal',
        };
      } else {
        fontStyle = {
          fontStyle: 'normal',
          fontWeight: 'normal',
          fontSize: `${fs}px`,
          fontFamily: 'inherit',
          letterSpacing: 'normal',
        };
      }

      return { text: text.slice(start, end), rect, font: fontStyle };
    } catch {
      return null;
    }
  }

  /**
   * Refine the caret rect when the caret sits inside a `<pre>` code block.
   *
   * WebKit/WKWebView has two bugs with collapsed caret ranges inside `<pre>`
   * with `white-space: pre`:
   *
   *   A. **Vertical misplacement** — `getClientRects()` / `getBoundingClientRect()`
   *      can return a rect whose `top` and `height` span multiple lines (or
   *      the entire content area), not the single line the caret is on.  This
   *      pushes the cursor to the bottom and overlaps the code block border.
   *
   *   B. **Width inflation** — the rect `width` can reflect the widest line
   *      above the caret, not zero.  This makes the cursor wider than normal.
   *
   * Both bugs stem from the same root: WebKit collapses a caret at a line
   * boundary into a range that "touches" preceding line boxes.
   *
   * Rather than fighting the browser, we compute the caret's vertical
   * position *deterministically* from the `<pre>` element's geometry:
   *
   *   caretTop = preTop + paddingTop + lineIndex × lineHeight
   *
   * where `lineIndex` is the 0-based line number the caret is on (counting
   * `\n`-delimited lines in the text node).  The horizontal position (`left`)
   * is taken from the raw rect when it looks sane, or from the `<pre>`'s
   * `paddingLeft` when the caret is at the start of a line.
   *
   * @returns A refined `{ top, height, left, width }` rect, or `null` when
   *          the caret is NOT inside a `<pre>` (caller falls back to the
   *          raw rect).
   */
  private refinePreCaretRect(
    rect: DOMRect,
    range: Range,
    lineHeight: number,
  ): DOMRect | null {
    // Walk up from the caret's container to find a <pre> ancestor.
    const startContainer = range.startContainer;
    let node: Node | null =
      startContainer.nodeType === Node.ELEMENT_NODE
        ? startContainer
        : startContainer.parentElement;
    let preEl: HTMLPreElement | null = null;
    while (node) {
      if (node.nodeName === 'PRE') {
        preEl = node as HTMLPreElement;
        break;
      }
      node = node.parentElement;
    }
    if (!preEl) return rect;

    const preRect = preEl.getBoundingClientRect();
    const preStyle = getComputedStyle(preEl);
    const paddingTop = parseFloat(preStyle.paddingTop) || 0;
    const paddingLeft = parseFloat(preStyle.paddingLeft) || 0;
    const scrollTop = preEl.scrollTop;
    const scrollLeft = preEl.scrollLeft;

    // ── Reliable vertical anchor via an adjacent real character ──
    // WebKit/WKWebView returns bogus geometry for a COLLAPSED caret range
    // inside `<pre white-space:pre>` (the rect spans multiple line boxes, so
    // its top/height/width are all wrong). But a NON-collapsed range around a
    // single real character is reliable AND already reflects the code block's
    // own scroll + clipping (it's plain viewport coordinates). So we anchor the
    // caret's vertical band to the glyph next to it, and only fall back to a
    // deterministic line-count computation on a truly empty line.
    let caretTop: number;
    let caretHeight: number;
    let caretLeft: number;

    const adj = this.adjacentCharRect(range);
    if (adj) {
      caretTop = adj.rect.top;
      caretHeight =
        adj.rect.height > 0 && adj.rect.height <= lineHeight * 1.6
          ? adj.rect.height
          : lineHeight;
      // The caret sits on the near edge of that glyph: the glyph's LEFT edge
      // when the glyph is after the caret, its RIGHT edge when it is before.
      caretLeft = adj.after ? adj.rect.left : adj.rect.right;
    } else {
      // Empty line — no adjacent glyph to anchor to. Count `\n` from the <pre>
      // start to the caret to get the line index, then derive the line-box top.
      // Subtract scrollTop because preRect is the element's own (unscrolled)
      // edge while lineIndex*lineHeight is measured from the content top.
      //
      // (Highlighting splits the code across many <span>s, so we count `\n`
      // over the serialised range text, not just the caret's own text node.)
      let lineIndex = 0;
      try {
        const preRange = document.createRange();
        preRange.setStart(preEl, 0);
        preRange.setEnd(range.startContainer, range.startOffset);
        const textBeforeCaret = preRange.toString();
        for (let i = 0; i < textBeforeCaret.length; i++) {
          if (textBeforeCaret[i] === '\n') lineIndex++;
        }
      } catch {
        /* keep lineIndex = 0 */
      }
      caretTop = preRect.top + paddingTop + lineIndex * lineHeight - scrollTop;
      caretHeight = lineHeight;
      const contentLeft = preRect.left + paddingLeft - scrollLeft;
      caretLeft =
        rect.left >= contentLeft - 2 && rect.left <= preRect.right ? rect.left : contentLeft;
    }

    // ── Clip to the code block's visible band ──
    // The trail is a WebGL overlay that is NOT clipped by the <pre>'s
    // `overflow`. When the caret's line scrolls out of the code block's
    // viewport, drawing it would float the cursor over neighbouring content;
    // hide it instead (mirroring how the native caret is clipped with the
    // text). Kept visible while any part of the line box intersects the
    // <pre>'s padding box.

    // TEMP DEBUG — snapshot of the viewport-space computation.
    this.__dbgPreInfo = {
      preTop: +preRect.top.toFixed(1),
      preBottom: +preRect.bottom.toFixed(1),
      preClientH: preEl.clientHeight,
      preScrollTop: +scrollTop.toFixed(1),
      preScrollH: preEl.scrollHeight,
      paddingTop,
      lineHeight: +lineHeight.toFixed(1),
      anchor: adj ? 'char' : 'empty-line',
      adjAfter: adj ? adj.after : null,
      adjTop: adj ? +adj.rect.top.toFixed(1) : null,
      adjHeight: adj ? +adj.rect.height.toFixed(1) : null,
      adjLeft: adj ? +adj.rect.left.toFixed(1) : null,
      adjRight: adj ? +adj.rect.right.toFixed(1) : null,
      rawTop: +rect.top.toFixed(1),
      rawHeight: +rect.height.toFixed(1),
      rawLeft: +rect.left.toFixed(1),
      rawWidth: +rect.width.toFixed(1),
      caretTop: +caretTop.toFixed(1),
      caretHeight: +caretHeight.toFixed(1),
      caretLeft: +caretLeft.toFixed(1),
    };

    // Horizontal counterpart of the vertical check above: `overflow: auto`
    // on the <pre> means a long unwrapped line (e.g. `white-space: pre`
    // with no spaces to break on, such as a single long JSON string value)
    // can force the code block to scroll HORIZONTALLY too.
    // `adjacentCharRect()` returns the glyph's real viewport position,
    // which is only inside the <pre>'s visible band while that part of the
    // line is actually scrolled into view — otherwise `caretLeft` lands
    // outside [preRect.left, preRect.right] and, since the trail canvas is
    // not clipped by the <pre>'s own overflow, the cursor floats past the
    // code block's left/right edge instead of being hidden like the native
    // caret would be.
    if (
      caretTop + caretHeight <= preRect.top ||
      caretTop >= preRect.bottom ||
      caretLeft < preRect.left ||
      caretLeft > preRect.right
    ) {
      // eslint-disable-next-line no-console
      logger.debug('[caret-dbg] CLIPPED → hidden', this.__dbgPreInfo);
      this.__dbgPreInfo = null;
      return null;
    }

    return {
      left: caretLeft,
      top: caretTop,
      width: 0,
      height: caretHeight,
      right: caretLeft,
      bottom: caretTop + caretHeight,
      x: caretLeft,
      y: caretTop,
      toJSON: () => ({}),
    } as DOMRect;
  }

  /**
   * Measure the rect of the real character immediately adjacent to a caret,
   * preferring the one AFTER it (the glyph you'd overtype) and falling back to
   * the one BEFORE. Returns `null` at empty positions (line breaks on both
   * sides, or a non-text container).
   *
   * Unlike a collapsed caret range, a range wrapping a single character has a
   * reliable bounding box on WebKit/WKWebView — even inside `<pre>` — so its
   * `top`/`height` give the caret's true line box, and the box already
   * reflects any scroll/clipping of the code block.
   */
  private adjacentCharRect(range: Range): { rect: DOMRect; after: boolean } | null {
    const sc = range.startContainer;
    if (sc.nodeType !== Node.TEXT_NODE) return null;
    const text = sc.textContent ?? '';
    const off = range.startOffset;

    // Character AFTER the caret (skip line breaks — they have no glyph box).
    if (off < text.length && text[off] !== '\n' && text[off] !== '\r') {
      const m = this.measureCodePoint(sc, off, text, +1);
      if (m) return { rect: m.rect, after: true };
    }
    // Character BEFORE the caret.
    if (off > 0 && text[off - 1] !== '\n' && text[off - 1] !== '\r') {
      const m = this.measureCodePoint(sc, off, text, -1);
      if (m) return { rect: m.rect, after: false };
    }
    return null;
  }

  /**
   * Resolve the computed font-size (px) AND line-height (px) of the element
   * containing the caret, in a single `getComputedStyle()` call, cached per
   * element (see {@link metricsCache}).
   *
   * Reading the real metrics from CSS — rather than from
   * `range.getBoundingClientRect()` — is essential because:
   *   • Headings / code blocks each have their own font-size & line-height;
   *     a single global constant mis-sizes the cursor on those lines.
   *   • The collapsed-caret rect height is unreliable on WebKit/WKWebView,
   *     especially inside `<pre>` with `white-space: pre`, where it can span
   *     the entire content area and push the cursor below the text line.
   *
   * The cache makes a static caret (merely blinking on the same element)
   * perform ZERO `getComputedStyle()` calls after the first measurement,
   * while producing identical values — so the animation is unchanged.
   */
  private metricsAt(node: Node | null): { fontSize: number; lineHeight: number } {
    let el: Element | null =
      node && node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node?.parentElement ?? null;
    if (!el || !(el instanceof HTMLElement)) el = this.editorEl;
    if (!el) return { fontSize: 16, lineHeight: 16 * 1.6 };

    const cached = this.metricsCache.get(el);
    if (cached && cached.v === this.metricsVersion) {
      return { fontSize: cached.fontSize, lineHeight: cached.lineHeight };
    }

    const cs = getComputedStyle(el);

    const fsRaw = parseFloat(cs.fontSize);
    const fontSize = Number.isFinite(fsRaw) && fsRaw > 0 ? fsRaw : 16;

    let lineHeight: number;
    const lh = cs.lineHeight;
    if (lh === 'normal' || lh === '') {
      // "normal" ≈ 1.2 × font-size (CSS specification default).
      lineHeight = fontSize * 1.2;
    } else {
      const px = parseFloat(lh);
      lineHeight = Number.isFinite(px) && px > 0 ? px : fontSize * 1.6;
    }

    this.metricsCache.set(el, { v: this.metricsVersion, fontSize, lineHeight });
    return { fontSize, lineHeight };
  }

  /**
   * Fallback caret measurement: insert a temporary zero-width span at the
   * caret position and measure its bounding rect.
   *
   * @param lineHeight  Computed CSS line-height (px), passed through from
   *                    the caller so we don't need to re-derive it here.
   */
  private measureCaretViaTempSpan(lineHeight: number): { left: number; right: number; top: number; bottom: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.textContent = '\u200b';
    span.style.display = 'inline-block';

    const clonedRange = range.cloneRange();
    clonedRange.insertNode(span);

    const rawRect = span.getBoundingClientRect();
    const parent = span.parentNode;
    const fontSize = this.metricsAt(parent).fontSize;
    if (parent) parent.removeChild(span);

    sel.removeAllRanges();
    sel.addRange(range);

    if (rawRect.width === 0 && rawRect.height === 0) return null;

    // Refine for <pre> code blocks (same reason as measureCaretRect()).
    const rect = this.refinePreCaretRect(rawRect, range, lineHeight);
    // null = caret scrolled out of a code block's visible band → hide.
    if (!rect) return null;

    // The temp-span path only triggers at empty positions (no glyph),
    // so there is no character under the caret → half-width fallback.
    return this.toCanvasLocal(rect, fontSize, lineHeight, {
      width: fontSize * CHAR_WIDTH_RATIO,
      onChar: false,
      before: false,
    });
  }

  /**
   * Convert a screen-space DOMRect to overlay-canvas-local coordinates,
   * shaping the cursor to match the glyph at the caret.
   *
   * Width rule (per the spec):
   *   - caret sits ON a character → use that glyph's real advance width
   *     (so CJK / wide / narrow chars all match exactly);
   *   - caret NOT on a character (end of line, empty block) → half width.
   * Height is always the glyph's em-box height.  Position is anchored at
   * the caret's left edge, which is the glyph's left edge.
   *
   * @param lineHeight  Computed CSS line-height (px).  MUST be passed in
   *                    from the caller (via `metricsAt()`) rather than
   *                    derived from `rect.height`, because
   *                    `range.getBoundingClientRect().height` is unreliable
   *                    for collapsed caret ranges — especially inside `<pre>`
   *                    blocks on WebKit/WKWebView, where it can return the
   *                    entire content area height instead of a single line
   *                    box, causing the cursor to be vertically misplaced.
   */
  private toCanvasLocal(
    rect: DOMRect,
    fontSize: number,
    lineHeight: number,
    glyph: {
      width: number;
      onChar: boolean;
      before: boolean;
      cover?: { text: string; rect: DOMRect; font: GlyphFont } | null;
    },
  ): { left: number; right: number; top: number; bottom: number } | null {
    const canvasRect = this.canvas.getBoundingClientRect();
    const caretLeft = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;

    // Cursor footprint width: full glyph width when overtyping a real
    // character, otherwise half the fallback character width.
    const cellWidth = Math.max(
      glyph.onChar ? glyph.width : glyph.width * 0.5,
      CARET_BAR_WIDTH_PX,
    );

    // Horizontal anchor: a glyph *after* the caret occupies the space to
    // the right (left edge = caret); a glyph *before* the caret (e.g. a
    // CJK char you just typed, caret now at end of line) occupies the
    // space to the left, so the cursor must extend leftwards to sit under
    // it instead of dangling half-width to the right.
    const left = glyph.before ? caretLeft - cellWidth : caretLeft;

    // Em-box: the glyph's vertical extent, centred within the line box
    // (CSS splits the leading equally above and below the glyphs).
    //
    // IMPORTANT: we use the CSS-computed `lineHeight` (passed in from the
    // caller) instead of `rect.height`.  The latter is the raw
    // getBoundingClientRect() height of the collapsed caret range, which
    // is unreliable on WebKit/WKWebView — especially inside `<pre>` code
    // blocks with `white-space: pre`, where it can span the entire
    // remaining content area.  Using an oversized `lineHeight` here would
    // vertically centre the em-box far below the actual text line,
    // causing the cursor to overlap the code block's bottom border.
    // ── Vertical positioning ──
    //
    // Centre the em-box within the ACTUAL caret rect, not within the CSS
    // line-height.  On WebKit/WKWebView the collapsed caret rect from
    // getClientRects() covers only the typographic text area (ascent +
    // descent ≈ fontSize × 1.2), whose top is already below the line-box
    // top by half the leading.  Centring within the CSS line-height on top
    // of that adds the half-leading offset a SECOND time, pushing the
    // cursor visibly below the text glyphs.
    //
    // Using rect.height instead is correct in every case:
    //   • Normal text on WebKit  — rect spans the text area (ascent+descent).
    //   • Normal text on Chromium — rect spans the full line box.
    //   • <pre> code blocks       — refinePreCaretRect() already set rect
    //                               height to lineHeight.
    // In all cases (top, height) defines where the text actually is, so
    // centring within it puts the cursor exactly on the glyphs.
    //
    // Safety cap: if rect.height is absurdly large (a residual WebKit
    // multi-line bug that slipped past refinePreCaretRect), fall back to
    // the CSS line-height.
    const safeLineHeight = Math.max(lineHeight, 1);
    const boxHeight =
      rect.height > 0 && rect.height <= safeLineHeight * 1.5
        ? rect.height
        : safeLineHeight;
    const emHeight = Math.min(fontSize * GLYPH_HEIGHT_RATIO, boxHeight);
    const emTop = top + (boxHeight - emHeight) / 2;
    const emBottom = emTop + emHeight;

    // Only the block cursor sits ON TOP of a glyph and hides it.  Capture
    // the covered glyph so the render loop can re-draw it in the inverted
    // colour; clear it for the other styles (and when over empty space).
    if (this.cursorStyle === 'block' && glyph.cover) {
      const c = glyph.cover;
      this.coveredGlyph = {
        text: c.text,
        left: c.rect.left - canvasRect.left,
        top: c.rect.top - canvasRect.top,
        width: c.rect.width,
        height: c.rect.height,
        font: c.font,
      };
    } else {
      this.coveredGlyph = null;
    }

    let trailLeft: number;
    let trailRight: number;
    let trailTop: number;
    let trailBottom: number;

    switch (this.cursorStyle) {
      case 'block': {
        // Solid block covering the glyph cell.
        trailLeft = left;
        trailRight = left + cellWidth;
        trailTop = emTop;
        trailBottom = emBottom;
        break;
      }
      case 'underline': {
        // Horizontal bar resting on the glyph baseline (em-box bottom).
        // Spans the real glyph width when over a character; at empty
        // positions its minimum is ONE full character width (not the
        // half-width used by block) so the underline stays clearly visible.
        const underH = Math.max(fontSize * UNDERLINE_THICKNESS_RATIO, 2);
        const underW = glyph.onChar
          ? glyph.width
          : Math.max(glyph.width, fontSize * CHAR_WIDTH_RATIO);
        trailLeft = left;
        trailRight = left + underW;
        trailBottom = emBottom;
        trailTop = emBottom - underH;
        break;
      }
      case 'bar':
      default: {
        // Thin vertical bar spanning the glyph height — always at the
        // caret itself, never offset to a neighbouring glyph.
        const barW = Math.max(cellWidth * BAR_THICKNESS_RATIO, CARET_BAR_WIDTH_PX);
        trailLeft = caretLeft;
        trailRight = caretLeft + barW;
        trailTop = emTop;
        trailBottom = emBottom;
        break;
      }
    }

    const culled =
      trailRight < 0 || trailLeft > this.cssW || trailBottom < 0 || trailTop > this.cssH;

    // TEMP DEBUG — merge canvas-local values and log the full picture.
    if (this.__dbgPreInfo) {
      // eslint-disable-next-line no-console
      logger.debug('[caret-dbg]', {
        ...this.__dbgPreInfo,
        canvasTop: +canvasRect.top.toFixed(1),
        canvasLeft: +canvasRect.left.toFixed(1),
        cssW: +this.cssW.toFixed(1),
        cssH: +this.cssH.toFixed(1),
        localTop: +top.toFixed(1),
        localLeft: +caretLeft.toFixed(1),
        boxHeight: +boxHeight.toFixed(1),
        emTop: +emTop.toFixed(1),
        emBottom: +emBottom.toFixed(1),
        trailTop: +trailTop.toFixed(1),
        trailBottom: +trailBottom.toFixed(1),
        culled,
      });
      this.__dbgPreInfo = null;
    }

    if (culled) return null;

    return { left: trailLeft, right: trailRight, top: trailTop, bottom: trailBottom };
  }

  // ── Private: Title <input> caret measurement ──

  /**
   * Measure the document-title <input>'s caret in canvas-local coordinates,
   * shaped to the active cursor style (bar / block / underline).
   *
   * A native <input> exposes no DOM Range for its internal text, so we mirror
   * its value + font into a hidden block element, wrap the caret position and
   * the adjacent glyph(s) in measurable <span>s, and reuse {@link toCanvasLocal}
   * — the same shaping the body caret uses — so the title caret is visually
   * identical to the editor caret.
   *
   * HORIZONTAL position comes from the mirror (exact glyph advance, including
   * the input's own horizontal scroll for long titles). The VERTICAL band is
   * recomputed from the input's box geometry: a native input centres its
   * single text line within its content box, whereas a block-level mirror lays
   * text at the top — so taking the mirror's y would misplace the caret.
   */
  private measureTitleCaretRect(
    input: HTMLInputElement,
  ): { left: number; right: number; top: number; bottom: number } | null {
    const selStart = input.selectionStart;
    const selEnd = input.selectionEnd;
    // Hide on a range selection (mirrors the editor's collapsed-caret-only rule).
    if (selStart == null || selEnd == null || selStart !== selEnd) {
      this.coveredGlyph = null;
      return null;
    }

    const caret = selStart;
    const value = input.value;
    const cs = getComputedStyle(input);
    const { fontSize, lineHeight } = this.metricsAt(input);

    // Isolate the code points immediately before / after the caret so we can
    // measure their advance widths (needed for block / underline shaping).
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const afterCp = firstCodePoint(after);
    const beforeCp = lastCodePoint(before);
    const beforeHead = before.slice(0, before.length - beforeCp.length);
    const afterTail = after.slice(afterCp.length);

    // Build the mirror: [beforeHead][beforeSpan][marker][afterSpan][afterTail].
    const mirror = this.syncTitleMirror(input, cs);
    mirror.textContent = '';
    if (beforeHead) mirror.appendChild(document.createTextNode(beforeHead));
    const beforeSpan = beforeCp ? appendSpan(mirror, beforeCp) : null;
    const marker = appendSpan(mirror, '\u200b');
    const afterSpan = afterCp ? appendSpan(mirror, afterCp) : null;
    if (afterTail) mirror.appendChild(document.createTextNode(afterTail));

    const markerRect = marker.getBoundingClientRect();

    // Vertical line box, derived from the input's own geometry (its single
    // text line is vertically centred within the content box).
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const paddingBottom = parseFloat(cs.paddingBottom) || 0;
    const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
    const r = input.getBoundingClientRect();
    const contentTop = r.top + borderTop + paddingTop;
    const contentH = r.height - borderTop - paddingTop - paddingBottom - borderBottom;
    const lineTop = contentTop + Math.max(0, (contentH - lineHeight) / 2);

    // Build a DOMRect-like with the mirror's X but the recomputed Y band.
    const mkRect = (left: number, width: number): DOMRect =>
      ({
        left,
        right: left + width,
        top: lineTop,
        bottom: lineTop + lineHeight,
        width,
        height: lineHeight,
        x: left,
        y: lineTop,
        toJSON: () => ({}),
      }) as DOMRect;

    const caretRect = mkRect(markerRect.left, 0);

    const font: GlyphFont = {
      fontStyle: cs.fontStyle,
      fontWeight: cs.fontWeight,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      letterSpacing: cs.letterSpacing,
    };

    let glyph: {
      width: number;
      onChar: boolean;
      before: boolean;
      cover: { text: string; rect: DOMRect; font: GlyphFont } | null;
    };
    if (afterSpan) {
      // Caret sits ON the character after it (overtype target).
      const cr = afterSpan.getBoundingClientRect();
      glyph = {
        width: cr.width,
        onChar: true,
        before: false,
        cover: { text: afterCp, rect: mkRect(cr.left, cr.width), font },
      };
    } else if (beforeSpan) {
      // End of text — anchor to the character before the caret.
      const cr = beforeSpan.getBoundingClientRect();
      glyph = {
        width: cr.width,
        onChar: true,
        before: true,
        cover: { text: beforeCp, rect: mkRect(cr.left, cr.width), font },
      };
    } else {
      // Empty title — half-width fallback, no covered glyph.
      glyph = {
        width: fontSize * CHAR_WIDTH_RATIO,
        onChar: false,
        before: false,
        cover: null,
      };
    }

    return this.toCanvasLocal(caretRect, fontSize, lineHeight, glyph);
  }

  /**
   * Create / update the hidden mirror that replicates the title input's text
   * box, so a DOM Range inside it measures glyph positions identical to the
   * input's rendered caret.  We copy font + spacing + the left inset and
   * compensate for the input's horizontal scroll; vertical alignment is
   * handled by the caller (see {@link measureTitleCaretRect}).
   */
  private syncTitleMirror(
    input: HTMLInputElement,
    cs: CSSStyleDeclaration,
  ): HTMLDivElement {
    let m = this.titleMirror;
    if (!m) {
      m = document.createElement('div');
      m.setAttribute('aria-hidden', 'true');
      Object.assign(m.style, {
        position: 'fixed',
        visibility: 'hidden',
        whiteSpace: 'pre',
        pointerEvents: 'none',
        margin: '0',
        boxSizing: 'content-box',
        zIndex: '-1',
        top: '0',
        left: '0',
      } as Partial<CSSStyleDeclaration>);
      document.body.appendChild(m);
      this.titleMirror = m;
    }
    const r = input.getBoundingClientRect();
    // Font + spacing must match exactly for glyph advances to line up.
    m.style.fontStyle = cs.fontStyle;
    m.style.fontWeight = cs.fontWeight;
    m.style.fontSize = cs.fontSize;
    m.style.fontFamily = cs.fontFamily;
    m.style.lineHeight = cs.lineHeight;
    m.style.letterSpacing = cs.letterSpacing;
    m.style.textTransform = cs.textTransform;
    m.style.fontVariant = cs.fontVariant;
    // Replicate the left inset so text starts at the input's content edge.
    m.style.paddingLeft = cs.paddingLeft;
    m.style.borderLeftWidth = cs.borderLeftWidth;
    m.style.borderLeftStyle = 'solid';
    // Position over the input and compensate for its horizontal scroll (long
    // titles scroll the caret to keep it in view).
    m.style.top = `${r.top}px`;
    m.style.left = `${r.left}px`;
    m.style.transform = `translateX(${-input.scrollLeft}px)`;
    return m;
  }

}
