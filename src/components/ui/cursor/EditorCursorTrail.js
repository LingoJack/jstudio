import {
  BaseCursorTrail
} from "./BaseCursorTrail";
import { computeBlink, THROTTLE_FPS } from "./editorBlink";
import {
  clipPreCaretRect,
  measureCaretViaTempSpan,
  measureGlyphAt,
  toCanvasLocal
} from "./editorCaretUtils";
import { measureNativeCaretRect } from "./nativeCaretMirror";
class EditorCursorTrail extends BaseCursorTrail {
  /** The ProseMirror editor DOM element (for focus detection). */
  editorEl = null;
  /** The scroll container that wraps the editor (for coordinate mapping). */
  scrollContainer = null;
  /** Hidden mirror for native input/textarea caret measurement. */
  nativeMirror = null;
  /** Native text controls and ProseMirror roots currently owned by this trail. */
  nativeHosts = /* @__PURE__ */ new Map();
  contentHosts = /* @__PURE__ */ new Map();
  /** Current cursor shape - controls the trail geometry. */
  cursorStyle = "bar";
  /** When the cursor first became visible (ms epoch) - for blink phase. */
  cursorVisibleStartTime = 0;
  /** Whether the caret position has changed since last frame. */
  prevCaretKey = "";
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
  dirty = true;
  /** Last measured caret rect (canvas-local), reused while not dirty. */
  cachedRect = null;
  /**
   * Monotonic version tag for {@link metricsCache}.  Bumped by {@link resize}
   * and {@link invalidateMetrics} so a font-size / line-height / font-family
   * change invalidates every cached entry without walking the map.
   */
  metricsVersion = 0;
  /**
   * Per-element cache of computed font metrics (fontSize + lineHeight).
   *
   * `getComputedStyle()` forces a style recalc, and the old code called it
   * 2–3× per caret measurement (font-size, line-height, and again inside
   * measureCodePoint).  These values change ONLY when the editor font
   * settings / zoom change - never while typing - so we cache them per
   * element and invalidate via {@link metricsVersion}.  This is purely an
   * input-gathering optimization: the trail easing / blink / GL render are
   * untouched, so the animation is byte-for-byte identical to before.
   */
  metricsCache = /* @__PURE__ */ new WeakMap();
  /**
   * DOM overlay that re-draws the glyph covered by a block cursor in the
   * editor's *background* colour, so the character stays legible on top of
   * the opaque block (terminal-style colour inversion).  Lazily created.
   */
  glyphEl = null;
  /** The glyph currently sitting under the block cursor (canvas-local). */
  coveredGlyph = null;
  /** Editor background colour for the inverted glyph (cached, refreshed on
   *  caret move). */
  invertColor = "#1e1e1e";
  /**
   * @param canvas           An overlay canvas positioned over the editor area.
   * @param color            Trail color as "#rrggbb".
   * @param editorEl         The .ProseMirror element.
   * @param scrollContainer  The scrollable ancestor container.
   */
  constructor(canvas, color, editorEl, scrollContainer) {
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
  resolveInvertColor() {
    const fromVar = getComputedStyle(document.documentElement).getPropertyValue("--vscode-editor-background").trim();
    if (fromVar) return fromVar;
    let el = this.editorEl;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0")) return bg;
      el = el.parentElement;
    }
    return "#1e1e1e";
  }
  // ── Public API ──
  setCursorStyle(style) {
    this.cursorStyle = style;
    this.dirty = true;
    this.wake();
  }
  /** Register a native text control and own its caret visibility/listeners. */
  registerNativeCaretHost(host) {
    this.unregisterNativeCaretHost(host);
    const originalCaretColor = host.style.caretColor;
    const markDirty = () => this.markDirty();
    const activate = () => {
      this.markDirty();
      requestAnimationFrame(() => {
        if (document.activeElement !== host) return;
        this.activate();
        requestAnimationFrame(() => {
          if (document.activeElement === host) this.markDirty();
        });
      });
    };
    const events = [
      "blur",
      "input",
      "select",
      "click",
      "pointerup",
      "keyup",
      "scroll",
      "compositionend"
    ];
    host.addEventListener("focus", activate);
    for (const event of events) host.addEventListener(event, markDirty);
    host.style.caretColor = "transparent";
    const removeListeners = () => {
      host.removeEventListener("focus", activate);
      for (const event of events) host.removeEventListener(event, markDirty);
    };
    this.nativeHosts.set(host, { originalCaretColor, removeListeners });
    this.markDirty();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.unregisterNativeCaretHost(host);
    };
  }
  /** Register one section-local ProseMirror root and its coordsAtPos resolver. */
  registerContentCaretHost(host, resolver) {
    this.unregisterContentCaretHost(host);
    const originalCaretColor = host.style.caretColor;
    const markDirty = () => this.markDirty();
    const activate = () => {
      this.markDirty();
      requestAnimationFrame(() => {
        if (host.contains(document.activeElement)) this.activate();
      });
    };
    host.addEventListener("focusin", activate);
    host.addEventListener("focusout", markDirty);
    host.style.caretColor = "transparent";
    const removeListeners = () => {
      host.removeEventListener("focusin", activate);
      host.removeEventListener("focusout", markDirty);
    };
    this.contentHosts.set(host, { resolver, originalCaretColor, removeListeners });
    this.markDirty();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.unregisterContentCaretHost(host);
    };
  }
  unregisterNativeCaretHost(host) {
    const entry = this.nativeHosts.get(host);
    if (!entry) return;
    entry.removeListeners();
    host.style.caretColor = entry.originalCaretColor;
    this.nativeHosts.delete(host);
    this.markDirty();
  }
  unregisterContentCaretHost(host) {
    const entry = this.contentHosts.get(host);
    if (!entry) return;
    entry.removeListeners();
    host.style.caretColor = entry.originalCaretColor;
    this.contentHosts.delete(host);
    this.markDirty();
  }
  /**
   * Mark the caret geometry as stale so the next animation frame re-measures
   * it from the DOM.  Cheap (just sets a flag) - call it on any event that
   * can move the caret or reflow the editor: selection changes, edits, focus
   * changes, scroll, resize.  Between dirty marks the loop reuses the cached
   * rect and performs NO DOM reads, while the trail/blink animation keeps
   * running every frame exactly as before.
   *
   * Also wakes the rAF loop if it has parked itself due to inactivity (the
   * loop stops when the trail is fully idle - see BaseCursorTrail.loop).
   */
  markDirty() {
    this.dirty = true;
    this.wake();
  }
  /**
   * Make this trail appear INSTANTLY at the current caret, fully opaque and
   * snapped to position - skipping both the opacity fade-in and the comet
   * fly-in from the corners' previous resting place.
   *
   * Why: in the sectioned editor each section owns its own trail. When focus
   * moves between sections (click, arrow keys crossing a boundary, Cmd+↑/↓),
   * the newly-focused section's trail would otherwise start from opacity 0
   * and ease in over ~0.4s, and its corners would fly from wherever they were
   * left - reading as "cursor disappears, then slowly reappears". Calling this
   * on focus makes the hand-off look like one continuous caret.
   */
  activate() {
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
      this.cursorVisibleStartTime = performance.now();
      this.dirty = false;
    }
    this.wake();
  }
  /** Re-measure on resize: the canvas-local mapping depends on canvas size. */
  resize() {
    super.resize();
    this.dirty = true;
    this.metricsVersion++;
    this.wake();
  }
  /**
   * Invalidate the cached per-element font metrics (font-size / line-height)
   * and the inverted-glyph background colour.  Call this when the editor font
   * settings change (font family, font size, line height, theme) - the values
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
  start() {
    for (const host of this.nativeHosts.keys()) host.style.caretColor = "transparent";
    for (const host of this.contentHosts.keys()) host.style.caretColor = "transparent";
    super.start();
  }
  stop() {
    super.stop();
    for (const [host, entry] of this.nativeHosts) {
      host.style.caretColor = entry.originalCaretColor;
    }
    for (const [host, entry] of this.contentHosts) {
      host.style.caretColor = entry.originalCaretColor;
    }
    if (this.glyphEl) this.glyphEl.style.display = "none";
  }
  dispose() {
    super.dispose();
    for (const host of [...this.nativeHosts.keys()]) this.unregisterNativeCaretHost(host);
    for (const host of [...this.contentHosts.keys()]) this.unregisterContentCaretHost(host);
    if (this.glyphEl?.parentNode) this.glyphEl.parentNode.removeChild(this.glyphEl);
    this.glyphEl = null;
    if (this.nativeMirror?.parentNode) this.nativeMirror.parentNode.removeChild(this.nativeMirror);
    this.nativeMirror = null;
  }
  // ── BaseCursorTrail implementation ──
  /**
   * Throttle predicate - when to drop from full 60fps rAF to a low-frequency
   * blink loop instead of parking entirely.
   *
   * The base default parks the loop only when the cursor is INVISIBLE (blur /
   * range selection).  But the overwhelmingly common state is "editor
   * focused, caret sitting still" - there `cursorVisible` stays true forever,
   * so without throttling the full-editor WebGL overlay gets recomposited
   * 60×/second by the WebView compositor (the high idle GPU / heat this
   * targets).
   *
   * We can't simply PARK a stationary visible caret the way kitty's terminal
   * does, because we keep the blink animation (kitty blinks too) - a parked
   * loop would freeze the caret mid-fade.  Instead, once the comet corners
   * have converged and the caret has faded in, the only thing left to animate
   * is the blink, which is slow (700ms period) and needs nowhere near 60fps.
   * So we keep the loop alive but throttled to {@link THROTTLE_FPS}, cutting
   * the compositor cost to ~1/3 while the caret keeps blinking smoothly.
   *
   * Any caret motion / edit / scroll calls markDirty()->wake() and the loop
   * returns to full 60fps for the comet animation (shouldThrottle goes false
   * the moment the corners are no longer settled).
   */
  shouldThrottle() {
    return this.cursorVisible && this.opacity >= 0.999 && this.cornersSettled();
  }
  /** Blink-only throttle rate (see {@link THROTTLE_FPS}). */
  throttleFps() {
    return THROTTLE_FPS;
  }
  /**
   * Per-frame target update.
   *
   * Event-driven measurement: the expensive DOM read (`measureCaretRect`)
   * runs ONLY when {@link dirty} is set - i.e. right after a selection move,
   * edit, focus change, scroll or resize raised it via {@link markDirty}.
   * On every other frame we reuse {@link cachedRect}, so a static (merely
   * blinking) caret performs zero layout/style work.  The trail easing, blink
   * and GL render below/around this still run every frame, so the animation
   * is byte-for-byte identical to before - only the measurement cadence drops
   * from 60fps to "once per actual change".
   */
  updateTarget() {
    if (this.dirty) {
      this.cachedRect = this.measureCaretRect();
      this.dirty = false;
    }
    const caretRect = this.cachedRect;
    if (caretRect) {
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
    this.syncGlyphOverlay();
  }
  /**
   * Render / position / hide the DOM overlay that re-draws the glyph sitting
   * under a block cursor in the editor's background colour.
   *
   * The WebGL block is drawn in the trail colour and is opaque, so it hides
   * whatever character it covers.  Rather than dimming the block (which
   * leaves the glyph muddy), we paint the same character on top of it in the
   * inverted colour - exactly how a terminal block cursor inverts fg/bg.
   *
   * The overlay's opacity tracks the block's blink so the glyph fades in
   * lock-step with the block (they invert together, never out of phase).
   */
  syncGlyphOverlay() {
    const g = this.cursorVisible ? this.coveredGlyph : null;
    if (!g) {
      if (this.glyphEl) this.glyphEl.style.display = "none";
      return;
    }
    if (!this.glyphEl) {
      const el2 = document.createElement("div");
      Object.assign(el2.style, {
        position: "absolute",
        pointerEvents: "none",
        display: "block",
        textAlign: "left",
        whiteSpace: "pre",
        margin: "0",
        padding: "0",
        boxSizing: "border-box",
        overflow: "visible",
        zIndex: "1"
      });
      this.canvas.parentElement?.appendChild(el2);
      this.glyphEl = el2;
    }
    const el = this.glyphEl;
    el.style.display = "block";
    el.style.left = `${g.left}px`;
    el.style.top = `${g.top}px`;
    el.style.width = `${g.width}px`;
    el.style.height = `${g.height}px`;
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
   * The WebGL fill IS the cursor - the solid quad is shaped per style
   * (bar / block / underline) in {@link toCanvasLocal}, and the native
   * caret is hidden by DocumentPanel (caret-color: transparent).  This is
   * what lets `block` render as a solid block and `underline` as a bar
   * along the baseline - the native caret can only ever be a thin line.
   *
   * Blink is computed here as a smooth 0..1 multiplier so the cursor
   * fades out and back in (rather than a hard on/off), and is reset to
   * fully-solid whenever the caret moves or reappears.
   */
  getRenderOptions() {
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
   *   reduced opacity - a muddy three-way blend.  Snapping between fully
   *   solid (clean inversion) and fully off (original glyph) keeps it crisp,
   *   exactly like a terminal block cursor.
   */
  computeBlink() {
    return computeBlink(this.cursorVisibleStartTime, this.cursorStyle);
  }
  // ── Private: Caret measurement ──
  /**
   * Measure the caret position in overlay-canvas-local pixel coordinates.
   * Returns null when there is no collapsed caret (no focus, or a text
   * range selection is active).
   */
  measureCaretRect() {
    const activeEl = document.activeElement;
    if ((activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) && this.nativeHosts.has(activeEl)) {
      const nativeResult = measureNativeCaretRect(
        activeEl,
        (node) => this.metricsAt(node),
        this.canvas,
        this.cursorStyle,
        this.cssW,
        this.cssH,
        this.nativeMirror
      );
      this.nativeMirror = nativeResult.mirror;
      this.coveredGlyph = nativeResult.coveredGlyph;
      return nativeResult.rect;
    }
    if (!this.editorEl || !this.scrollContainer || !this.editorEl.contains(activeEl)) {
      return null;
    }
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (!sel || !range || !range.collapsed) return null;
    const contentHost = this.findContentHost(range.startContainer);
    let resolved = null;
    if (contentHost) {
      try {
        resolved = this.contentHosts.get(contentHost)?.resolver() ?? null;
      } catch {
        resolved = null;
      }
    }
    let rawRect;
    if (resolved) {
      const width = Math.max(0, resolved.right - resolved.left);
      const height = Math.max(0, resolved.bottom - resolved.top);
      rawRect = {
        left: resolved.left,
        right: resolved.right,
        top: resolved.top,
        bottom: resolved.bottom,
        width,
        height,
        x: resolved.left,
        y: resolved.top,
        toJSON: () => ({})
      };
    } else {
      const rects = range.getClientRects();
      rawRect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
    }
    const { fontSize, lineHeight } = this.metricsAt(range.startContainer);
    const rect = clipPreCaretRect(rawRect, range);
    if (!rect) {
      this.coveredGlyph = null;
      return null;
    }
    const root = contentHost ?? this.editorEl;
    const glyph = measureGlyphAt(
      range,
      fontSize,
      root,
      (node) => this.metricsAt(node),
      this.cursorStyle
    );
    if (!resolved && rect.width === 0 && rect.height === 0) {
      const tempResult = measureCaretViaTempSpan(
        lineHeight,
        (node) => this.metricsAt(node),
        this.canvas,
        this.cursorStyle,
        this.cssW,
        this.cssH
      );
      this.coveredGlyph = tempResult.coveredGlyph;
      return tempResult.rect;
    }
    const result = toCanvasLocal(
      rect,
      fontSize,
      lineHeight,
      glyph,
      this.canvas,
      this.cursorStyle,
      this.cssW,
      this.cssH
    );
    this.coveredGlyph = result.coveredGlyph;
    return result.rect;
  }
  findContentHost(node) {
    for (const host of this.contentHosts.keys()) {
      if (host === node || host.contains(node)) return host;
    }
    return null;
  }
  /**
   * Resolve the computed font-size (px) AND line-height (px) of the element
   * containing the caret, in a single `getComputedStyle()` call, cached per
   * element (see {@link metricsCache}).
   *
   * Reading the real metrics from CSS - rather than from
   * `range.getBoundingClientRect()` - is essential because:
   *   • Headings / code blocks each have their own font-size & line-height;
   *     a single global constant mis-sizes the cursor on those lines.
   *   • The collapsed-caret rect height is unreliable on WebKit/WKWebView,
   *     especially inside `<pre>` with `white-space: pre`, where it can span
   *     the entire content area and push the cursor below the text line.
   *
   * The cache makes a static caret (merely blinking on the same element)
   * perform ZERO `getComputedStyle()` calls after the first measurement,
   * while producing identical values - so the animation is unchanged.
   */
  metricsAt(node) {
    let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement ?? null;
    if (!el || !(el instanceof HTMLElement)) el = this.editorEl;
    if (!el) return { fontSize: 16, lineHeight: 16 * 1.6 };
    const cached = this.metricsCache.get(el);
    if (cached && cached.v === this.metricsVersion) {
      return { fontSize: cached.fontSize, lineHeight: cached.lineHeight };
    }
    const cs = getComputedStyle(el);
    const fsRaw = parseFloat(cs.fontSize);
    const fontSize = Number.isFinite(fsRaw) && fsRaw > 0 ? fsRaw : 16;
    let lineHeight;
    const lh = cs.lineHeight;
    if (lh === "normal" || lh === "") {
      lineHeight = fontSize * 1.2;
    } else {
      const px = parseFloat(lh);
      lineHeight = Number.isFinite(px) && px > 0 ? px : fontSize * 1.6;
    }
    this.metricsCache.set(el, { v: this.metricsVersion, fontSize, lineHeight });
    return { fontSize, lineHeight };
  }
}
export {
  EditorCursorTrail
};
