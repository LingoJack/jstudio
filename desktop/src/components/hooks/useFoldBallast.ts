/**
 * useFoldBallast — scroll-neutral folding for collapsible lists.
 *
 * A running fold (animated 0fr/1fr grid wrapper) shrinks the list content
 * frame by frame. If the total scroll height shrank with it, a scrolled
 * (especially bottom-clamped) container would clamp scrollTop every frame —
 * content above the fold slides down and the fold never reads as "folding
 * up". While a fold runs, the ballast spacer rendered below the list grows
 * in lockstep with the shrink (total height constant, scrollTop untouched,
 * fold plays in place) and then simply STAYS — there is no post-fold settle
 * glide. While idle, the ballast is opportunistically trimmed to the blank
 * stretch the viewport actually reaches into: that part sits entirely below
 * the viewport bottom, so removing it provably never moves the view, and the
 * phantom padding evaporates as the user scrolls away from the bottom.
 *
 * Consumers render the ballast div themselves — a sibling AFTER the observed
 * content wrapper, so its own resize doesn't re-trigger the observer — and
 * call `beginFold()` immediately before flipping their expand state.
 *
 * Used by SectionOutline (heading tree) and DocumentSidebar (folder tree).
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** Duration (ms) of the expand/collapse fold animation (0fr/1fr grid). */
export const FOLD_DURATION_MS = 200;
/** Delay after the last fold-driven content resize before fold tracking is
 *  released (must cover FOLD_DURATION_MS frame gaps). */
const FOLD_RELEASE_DELAY_MS = 150;

interface UseFoldBallastOptions {
  /** The scroll container that wraps the foldable list. */
  containerRef: RefObject<HTMLElement | null>;
  /** Wrapper around the foldable rows whose height the folds change. */
  contentRef: RefObject<HTMLDivElement | null>;
  /** Bottom spacer div rendered after the content wrapper. */
  ballastRef: RefObject<HTMLDivElement | null>;
  /** False while the foldable list is not rendered (search mode, empty). */
  active: boolean;
}

export function useFoldBallast({
  containerRef,
  contentRef,
  ballastRef,
  active,
}: UseFoldBallastOptions) {
  // Content height (incl. any leftover ballast) when the running fold
  // started; null when no fold is running.
  const foldBaseRef = useRef<number | null>(null);

  /** Call immediately before flipping the expand state of a fold. */
  const beginFold = useCallback(() => {
    const content = contentRef.current;
    if (content) {
      foldBaseRef.current =
        content.offsetHeight + (ballastRef.current?.offsetHeight ?? 0);
    }
  }, [contentRef, ballastRef]);

  /** Drop any running baseline and clear the ballast (doc switch etc.). */
  const resetFold = useCallback(() => {
    foldBaseRef.current = null;
    if (ballastRef.current) ballastRef.current.style.height = '0px';
  }, [ballastRef]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!active || !container || !content) return;

    const trimBallast = () => {
      const ballast = ballastRef.current;
      if (!ballast || foldBaseRef.current !== null) return;
      const current = ballast.offsetHeight;
      if (current === 0) return;
      // Blank stretch between the real content end and the viewport bottom.
      const visibleBlank =
        container.clientHeight -
        (content.getBoundingClientRect().bottom -
          container.getBoundingClientRect().top);
      const next = Math.max(0, Math.min(current, visibleBlank));
      if (next !== current) ballast.style.height = `${next}px`;
    };

    let releaseTimer = 0;
    const ro = new ResizeObserver(() => {
      const ballast = ballastRef.current;
      const base = foldBaseRef.current;
      if (!ballast) return;
      if (base === null) {
        trimBallast();
        return;
      }
      // Track the fold frame by frame: keep content + ballast constant.
      ballast.style.height = `${Math.max(0, base - content.offsetHeight)}px`;
      // Release shortly after the fold stops resizing content: stop
      // tracking and trim whatever is already below the viewport.
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        foldBaseRef.current = null;
        trimBallast();
      }, FOLD_RELEASE_DELAY_MS);
    });
    ro.observe(content);
    container.addEventListener('scroll', trimBallast, { passive: true });
    return () => {
      ro.disconnect();
      container.removeEventListener('scroll', trimBallast);
      window.clearTimeout(releaseTimer);
      foldBaseRef.current = null;
    };
  }, [containerRef, contentRef, ballastRef, active]);

  return { beginFold, resetFold };
}
