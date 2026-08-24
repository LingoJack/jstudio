/**
 * EditorScrollCursor — custom visual for the editor's vertical scrollbar.
 *
 * The native scrollbar thumb/track are rendered transparent (see
 * `.editor-scroll-container` in vscode-theme.css); in their place this
 * component draws a 1px track line with a "<-" cursor riding it. The
 * cursor maps scroll progress onto the full track height (0% = top,
 * 100% = bottom). The overlay is purely visual (pointer-events: none) —
 * the transparent native thumb underneath still handles drag scrolling.
 *
 * Together with the outline rail's "->" cursor it forms the app's
 * line-instrument language: two thin tracks with mirrored arrows, each
 * pointing at what it references — "<-" at the document (scroll
 * position), "->" at the outline item (current heading).
 *
 * Positioning trick: the overlay is a zero-height `sticky` box rendered
 * as the FIRST child of the scroll container. `top: 0` keeps it pinned to
 * the scrollport's top while content scrolls beneath it, so children can
 * be placed in scrollport coordinates without leaving the content box
 * (leaving it would trigger a horizontal scrollbar).
 */

import { useEffect, useState, type RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';

/** Re-measure delays (ms) to catch progressive section mounting, which
 *  changes scrollHeight without firing scroll events. */
const REMOUNT_PROBES = [100, 300, 800, 2000];
/** Rendered height (px) of the cursor glyph incl. its bg patch — the
 *  cursor travels the full track so it reaches both ends (0% = track
 *  top, 100% = track bottom), unlike a thumb-centered indicator. */
const CURSOR_HEIGHT = 18;

interface CursorPos {
  /** Cursor center, in scrollport px (CURSOR_HEIGHT/2 .. clientHeight-CURSOR_HEIGHT/2). */
  y: number;
  /** clientHeight at measure time — height of the track line. */
  viewportH: number;
  visible: boolean;
}

export default function EditorScrollCursor({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLElement | null>;
}) {
  const [pos, setPos] = useState<CursorPos>({ y: 0, viewportH: 0, visible: false });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let raf = 0;

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
      setPos({ y, viewportH: clientHeight, visible: scrollable });
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
    };
  }, [scrollContainerRef]);

  if (!pos.visible) return null;

  return (
    <div
      aria-hidden
      className="sticky top-0 ml-auto w-2 h-0 z-20 pointer-events-none"
    >
      {/* Track line spanning the visible scrollport. */}
      <span
        className="absolute top-0 right-[5.5px] w-px bg-[var(--vscode-sideBar-border)]"
        style={{ height: pos.viewportH }}
      />
      {/* "<-" cursor straddling the track line, pointing at the document.
          Accent-colored, mirroring the outline rail's "->" cursor. */}
      <span
        className="absolute right-0 -translate-y-1/2 py-[3px] bg-[var(--vscode-editor-background)] text-[var(--vscode-focusBorder)]"
        style={{ top: pos.y }}
      >
        <ArrowLeft className="w-3 h-3" strokeWidth={2.5} />
      </span>
    </div>
  );
}
