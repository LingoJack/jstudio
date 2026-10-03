/**
 * EditorScrollCursor — the document's reading head (读头).
 *
 * The native scrollbar thumb/track are rendered transparent (see
 * `.editor-scroll-container` in vscode-theme.css); in their place this
 * component draws the document's own caret: a "❯" head riding the
 * (invisible) scroll track. The cursor maps scroll progress onto the full
 * scrollport height (0% = top, 100% = bottom). Purely visual
 * (pointer-events: none) — the transparent native thumb underneath still
 * handles drag scrolling.
 *
 * Design (read-head language, shared with the outline rail's cursor):
 *   - At rest the head dims to 35% — quiet, never competing with reading.
 *   - While scrolling the head brightens and grows a comet trail in its
 *     direction of travel, proportional to scroll velocity (rAF decay).
 *     Motion that answers the reader's action — the scroll sibling of the
 *     editor's animated text caret.
 *
 * Positioning trick: the overlay is a zero-height `sticky` box rendered
 * as the FIRST child of the scroll container. `top: 0` keeps it pinned to
 * the scrollport's top while content scrolls beneath it, so children can
 * be placed in scrollport coordinates without leaving the content box
 * (leaving it would trigger a horizontal scrollbar).
 */

import { useEffect, useRef, useState, type RefObject } from 'react';

/** Re-measure delays (ms) to catch progressive section mounting, which
 *  changes scrollHeight without firing scroll events. */
const REMOUNT_PROBES = [100, 300, 800, 2000];
/** Rendered height (px) of the cursor glyph incl. its bg patch — the
 *  cursor travels the full track so it reaches both ends (0% = track
 *  top, 100% = track bottom), unlike a thumb-centered indicator. */
const CURSOR_HEIGHT = 18;
/** Comet trail limits (px). */
const TRAIL_MIN = 6;
const TRAIL_MAX = 52;
/** Head opacity range: dim at rest → full while scrolling. */
const OPACITY_REST = 0.35;

interface CursorPos {
  /** Cursor center, in scrollport px (CURSOR_HEIGHT/2 .. clientHeight-CURSOR_HEIGHT/2). */
  y: number;
  visible: boolean;
}

export default function EditorScrollCursor({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLElement | null>;
}) {
  const [pos, setPos] = useState<CursorPos>({ y: 0, visible: false });
  const headRef = useRef<HTMLSpanElement>(null);
  const trailRef = useRef<HTMLSpanElement>(null);
  /** Mutable motion state — written by the scroll handler + decay loop,
   *  painted straight to the DOM (no re-render per frame). */
  const motionRef = useRef({
    lastTop: 0,
    lastT: 0,
    /** Smoothed scroll velocity, px per ~16ms frame (signed). */
    v: 0,
    decayRaf: 0,
  });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const motion = motionRef.current;
    let raf = 0;

    /** Paint the velocity-reactive bits straight to the DOM. */
    const paint = () => {
      const head = headRef.current;
      const trail = trailRef.current;
      if (!head || !trail) return;
      const speed = Math.min(Math.abs(motion.v), 120);
      const energy = Math.min(1, speed / 60); // 0 at rest → 1 at brisk scroll
      head.style.opacity = String(OPACITY_REST + (1 - OPACITY_REST) * energy);
      const h = TRAIL_MIN + energy * (TRAIL_MAX - TRAIL_MIN);
      trail.style.height = `${h}px`;
      trail.style.opacity = String(energy * 0.6);
      // The trail streams BEHIND the direction of travel. Ink from the
      // shared indicator token — the read-head language is theme ink, not
      // an accent color (unified with the outline rail's cursor).
      const trailInk =
        'color-mix(in srgb, var(--jstudio-indicator-ink) 85%, transparent)';
      if (motion.v >= 0) {
        trail.style.top = `${-h + 6}px`;
        trail.style.background =
          `linear-gradient(to bottom, transparent, ${trailInk})`;
      } else {
        trail.style.top = '10px';
        trail.style.background =
          `linear-gradient(to bottom, ${trailInk}, transparent)`;
      }
    };

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const scrollable = scrollHeight > clientHeight + 1;
      // Map scroll progress (0..1) onto the FULL track: the cursor rests
      // at the track's top at 0% and at its bottom at 100%. (Deliberately
      // not thumb-centered — a thumb-centered cursor never reaches the
      // extremes, which reads as broken on short documents.)
      const maxScroll = scrollHeight - clientHeight;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
      const y = CURSOR_HEIGHT / 2 + progress * (clientHeight - CURSOR_HEIGHT);
      setPos({ y, visible: scrollable });

      // Velocity (px per ~16ms frame), smoothed.
      const now = performance.now();
      const dt = Math.max(8, now - (motion.lastT || now - 16));
      const inst = (scrollTop - motion.lastTop) / (dt / 16);
      motion.v = motion.v * 0.55 + inst * 0.45;
      motion.lastTop = scrollTop;
      motion.lastT = now;
      paint();

      // Decay the comet back to rest after scrolling stops.
      cancelAnimationFrame(motion.decayRaf);
      const decay = () => {
        motion.v *= 0.8;
        if (Math.abs(motion.v) < 0.4) {
          motion.v = 0;
          paint();
          return;
        }
        paint();
        motion.decayRaf = requestAnimationFrame(decay);
      };
      motion.decayRaf = requestAnimationFrame(decay);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    container.addEventListener('scroll', onScroll, { passive: true });
    const probes = REMOUNT_PROBES.map((ms) => window.setTimeout(update, ms));
    return () => {
      container.removeEventListener('scroll', onScroll);
      probes.forEach((t) => clearTimeout(t));
      cancelAnimationFrame(raf);
      cancelAnimationFrame(motion.decayRaf);
    };
  }, [scrollContainerRef]);

  if (!pos.visible) return null;

  return (
    <div
      aria-hidden
      className="sticky top-0 ml-auto w-2 h-0 z-20 pointer-events-none"
    >
      {/* "❯" read head — terminal-prompt style glyph. Ink per theme via the
          shared indicator token (unified with the outline rail's cursor) —
          deliberately NOT the theme accent, which changes per theme.
          The 18px line box matches CURSOR_HEIGHT so the position math stays
          exact; opacity + comet trail are velocity-painted via refs. */}
      <span
        ref={headRef}
        className="absolute right-0 -translate-y-1/2 px-[3px] bg-[var(--vscode-editor-background)] font-mono text-[12px] leading-[18px] text-[var(--jstudio-indicator-ink)]"
        style={{ top: pos.y, opacity: OPACITY_REST }}
      >
        <span
          ref={trailRef}
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 w-[2px] rounded-full"
          style={{ top: '-20px', height: '0px', opacity: 0 }}
        />
        {"❯"}
      </span>
    </div>
  );
}
