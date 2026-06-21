/**
 * useEditorWidth — reactively tracks the TipTap editor surface width.
 *
 * Returns the current `clientWidth` (px) of the `.ProseMirror` element.
 * This is used by resizable NodeViews (Image, File, Link, Diagram) to
 * convert between percentage-based widths and pixel widths so that
 * blocks scale proportionally when the window or sidebar is resized.
 *
 * Usage:
 *   const editorWidth = useEditorWidth();
 *   // editorWidth = 800 → a block with widthPct=50 renders at 400px
 */

import { useEffect, useState } from 'react';

/** Fallback width when the editor surface cannot be found (SSR, unmounted). */
const FALLBACK_WIDTH = 800;

export function useEditorWidth(): number {
  const [width, setWidth] = useState<number>(FALLBACK_WIDTH);

  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.ProseMirror');
    if (!surface) {
      setWidth(FALLBACK_WIDTH);
      return;
    }

    // Read the initial width synchronously.
    setWidth(surface.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = Math.round(entry.contentRect.width);
        if (w > 0) setWidth(w);
      }
    });

    observer.observe(surface);

    return () => observer.disconnect();
  }, []);

  return width;
}
