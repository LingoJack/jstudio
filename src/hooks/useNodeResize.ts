/**
 * useNodeResize — shared resize-by-dragging hook for TipTap NodeView components.
 *
 * Used by ImageView and FileView to provide the same "drag bottom-right
 * handle to resize" UX without duplicating pointer event logic.
 *
 * Usage:
 *   const { displayWidth, onResizeStart, ref } = useNodeResize({
 *     width: node.attrs.width,           // current persisted width
 *     updateAttributes,                   // TipTap NodeView updateAttributes
 *     minWidth: 80,                       // clamp lower bound
 *     maxWidth?: 800,                     // optional clamp upper bound
 *     fallbackWidth: 300,                 // used when width attr is null
 *   });
 *
 *   <img ref={ref} style={{ width: displayWidth ?? undefined }} />
 *   <div onPointerDown={onResizeStart} />
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseNodeResizeOptions {
  /** Current persisted width from node attrs (null = unset). */
  width: number | null | undefined;
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
  /**
   * Called with the final width when the user finishes dragging.
   * Use this if you need to compute additional attributes (e.g. height
   * derived from aspect ratio). Default: just sets `{ width }`.
   */
  onCommit?: (finalWidth: number) => Record<string, unknown>;
}

export interface UseNodeResizeResult<T extends HTMLElement = HTMLDivElement> {
  /** Ref to attach to the element whose `offsetWidth` seeds the start width. */
  ref: React.RefObject<T | null>;
  /** Live width during drag / display width at rest (null = use CSS default). */
  displayWidth: number | null;
  /** Attach to the resize handle's `onPointerDown`. */
  onResizeStart: (e: React.PointerEvent<HTMLElement>) => void;
}

export function useNodeResize<T extends HTMLElement = HTMLDivElement>(
  options: UseNodeResizeOptions,
): UseNodeResizeResult<T> {
  const {
    width,
    updateAttributes,
    minWidth = 80,
    maxWidth,
    fallbackWidth = 300,
    onCommit,
  } = options;

  const ref = useRef<T>(null);
  const resizingRef = useRef(false);
  const [displayWidth, setDisplayWidth] = useState<number | null>(
    width ?? null,
  );
  const displayWidthRef = useRef<number | null>(displayWidth);
  displayWidthRef.current = displayWidth;

  // Keep local display width in sync when the node attr changes externally.
  useEffect(() => {
    if (!resizingRef.current) {
      setDisplayWidth(width ?? null);
    }
  }, [width]);

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = displayWidth ?? ref.current?.offsetWidth ?? fallbackWidth;

      // Resolve maxWidth: supports number or runtime function
      const resolvedMaxWidth =
        typeof maxWidth === 'function' ? maxWidth() : maxWidth;

      resizingRef.current = true;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        let newWidth = Math.max(minWidth, startWidth + delta);
        if (resolvedMaxWidth !== undefined) {
          newWidth = Math.min(newWidth, resolvedMaxWidth);
        }
        setDisplayWidth(newWidth);
        displayWidthRef.current = newWidth;
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        resizingRef.current = false;

        const finalWidth = displayWidthRef.current ?? startWidth;
        const attrs = onCommit
          ? onCommit(finalWidth)
          : { width: finalWidth };
        updateAttributes(attrs);
      };

      displayWidthRef.current = displayWidth ?? startWidth;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [displayWidth, updateAttributes, minWidth, maxWidth, fallbackWidth, onCommit],
  );

  return { ref, displayWidth, onResizeStart };
}
