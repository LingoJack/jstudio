/**
 * useNodeResize — shared resize-by-dragging hook for TipTap NodeView components.
 *
 * Supports two modes:
 *   1. Width-only (backward compatible): pass only `width` — no height tracking.
 *      Used by ImageView (aspect-ratio driven) and LinkView (card auto-height).
 *   2. Two-dimensional: pass both `width` and `height` — tracks both dimensions
 *      independently. Used by DiagramBlockView, FileView (preview mode).
 *
 * Usage (width-only):
 *   const { displayWidth, onResizeStart, ref } = useNodeResize({
 *     width: node.attrs.width,
 *     updateAttributes,
 *     minWidth: 80,
 *     fallbackWidth: 300,
 *     onCommit: (w) => ({ width: w }),
 *   });
 *
 * Usage (width + height):
 *   const { displayWidth, displayHeight, onResizeStart, ref } = useNodeResize({
 *     width: node.attrs.width,
 *     height: node.attrs.height,
 *     updateAttributes,
 *     minWidth: 300, minHeight: 200,
 *     fallbackWidth: 520, fallbackHeight: 320,
 *     onCommit: (w, h) => ({ width: w, height: h }),
 *   });
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseNodeResizeOptions {
  /** Current persisted width from node attrs (null = unset). */
  width: number | null | undefined;
  /** Current persisted height from node attrs (null = unset).
   *  When omitted, the hook operates in width-only mode. */
  height?: number | null | undefined;
  /** TipTap NodeView `updateAttributes` callback. */
  updateAttributes: (attrs: Record<string, unknown>) => void;
  /** Minimum width in pixels (default 80). */
  minWidth?: number;
  /** Optional maximum width in pixels. Pass a number or a function that
   *  returns one (useful when the bound must be read from the DOM at
   *  drag-start time). If omitted, no upper clamp. */
  maxWidth?: number | (() => number | undefined);
  /** Fallback width when `width` is null and the ref element has no size yet. */
  fallbackWidth?: number;
  /** Minimum height in pixels (default 100). Only used when `height` is provided. */
  minHeight?: number;
  /** Optional maximum height in pixels (number or runtime function). */
  maxHeight?: number | (() => number | undefined);
  /** Fallback height when `height` is null and the ref element has no size yet. */
  fallbackHeight?: number;
  /**
   * Called with the final dimensions when the user finishes dragging.
   * Use this if you need to compute additional attributes (e.g. height
   * derived from aspect ratio). Default: sets `{ width }` (or `{ width, height }`).
   * `finalHeight` is null in width-only mode.
   */
  onCommit?: (
    finalWidth: number,
    finalHeight: number | null,
  ) => Record<string, unknown>;
}

export interface UseNodeResizeResult<T extends HTMLElement = HTMLDivElement> {
  /** Ref to attach to the element whose `offsetWidth`/`offsetHeight` seeds start values. */
  ref: React.RefObject<T | null>;
  /** Live width during drag / display width at rest (null = use CSS default). */
  displayWidth: number | null;
  /** Live height during drag / display height at rest (null = use CSS default). */
  displayHeight: number | null;
  /** Attach to the resize handle's `onPointerDown`. */
  onResizeStart: (e: React.PointerEvent<HTMLElement>) => void;
}

export function useNodeResize<T extends HTMLElement = HTMLDivElement>(
  options: UseNodeResizeOptions,
): UseNodeResizeResult<T> {
  const {
    width,
    height,
    updateAttributes,
    minWidth = 80,
    maxWidth,
    fallbackWidth = 300,
    minHeight = 100,
    maxHeight,
    fallbackHeight = 300,
    onCommit,
  } = options;

  // Whether height tracking is enabled.
  const trackHeight = height !== undefined;

  const ref = useRef<T>(null);
  const resizingRef = useRef(false);
  const [displayWidth, setDisplayWidth] = useState<number | null>(width ?? null);
  const [displayHeight, setDisplayHeight] = useState<number | null>(
    trackHeight ? (height ?? null) : null,
  );

  // Refs to read current display values inside event listeners.
  const displayWidthRef = useRef<number | null>(displayWidth);
  const displayHeightRef = useRef<number | null>(displayHeight);
  displayWidthRef.current = displayWidth;
  displayHeightRef.current = displayHeight;

  // Keep local display values in sync when the node attrs change externally.
  useEffect(() => {
    if (!resizingRef.current) {
      setDisplayWidth(width ?? null);
    }
  }, [width]);

  useEffect(() => {
    if (!resizingRef.current && trackHeight) {
      setDisplayHeight(height ?? null);
    }
  }, [height, trackHeight]);

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth =
        displayWidth ?? ref.current?.offsetWidth ?? fallbackWidth;
      const startHeight = trackHeight
        ? (displayHeight ?? ref.current?.offsetHeight ?? fallbackHeight)
        : 0;

      // Resolve max bounds at drag-start time.
      const resolvedMaxWidth =
        typeof maxWidth === 'function' ? maxWidth() : maxWidth;
      const resolvedMaxHeight =
        typeof maxHeight === 'function' ? maxHeight() : maxHeight;

      resizingRef.current = true;
      displayWidthRef.current = displayWidth ?? startWidth;
      if (trackHeight) {
        displayHeightRef.current = displayHeight ?? startHeight;
      }

      const onMove = (ev: PointerEvent) => {
        // --- Width ---
        const deltaX = ev.clientX - startX;
        let newWidth = Math.max(minWidth, startWidth + deltaX);
        if (resolvedMaxWidth !== undefined) {
          newWidth = Math.min(newWidth, resolvedMaxWidth);
        }
        setDisplayWidth(newWidth);
        displayWidthRef.current = newWidth;

        // --- Height (only when tracking) ---
        if (trackHeight) {
          const deltaY = ev.clientY - startY;
          let newHeight = Math.max(minHeight, startHeight + deltaY);
          if (resolvedMaxHeight !== undefined) {
            newHeight = Math.min(newHeight, resolvedMaxHeight);
          }
          setDisplayHeight(newHeight);
          displayHeightRef.current = newHeight;
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        resizingRef.current = false;

        const finalWidth = displayWidthRef.current ?? startWidth;
        const finalHeight = trackHeight
          ? (displayHeightRef.current ?? startHeight)
          : null;

        const attrs = onCommit
          ? onCommit(finalWidth, finalHeight)
          : trackHeight && finalHeight !== null
            ? { width: finalWidth, height: finalHeight }
            : { width: finalWidth };
        updateAttributes(attrs);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [
      displayWidth,
      displayHeight,
      trackHeight,
      updateAttributes,
      minWidth,
      maxWidth,
      fallbackWidth,
      minHeight,
      maxHeight,
      fallbackHeight,
      onCommit,
    ],
  );

  return { ref, displayWidth, displayHeight, onResizeStart };
}
