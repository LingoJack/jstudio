/**
 * useEditorWidth — reactively tracks the TipTap editor content width.
 *
 * Returns the content width (px) of the `.ProseMirror` element, i.e.
 * the area inside its horizontal padding where blocks actually render.
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

/** Compute the content width (clientWidth minus horizontal padding). */
function getContentWidth(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  return Math.round(el.clientWidth - padLeft - padRight);
}

export function useEditorWidth(): number {
  const [width, setWidth] = useState<number>(FALLBACK_WIDTH);

  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.ProseMirror');
    if (!surface) {
      setWidth(FALLBACK_WIDTH);
      return;
    }

    // Read the initial content width synchronously.
    setWidth(getContentWidth(surface));

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        // contentRect.width already excludes padding (content box).
        const w = Math.round(entry.contentRect.width);
        if (w > 0) setWidth(w);
      }
    });

    observer.observe(surface);

    return () => observer.disconnect();
  }, []);

  return width;
}
