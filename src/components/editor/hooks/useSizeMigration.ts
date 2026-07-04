/**
 * useSizeMigration — handles legacy pixel → percentage dimension migration.
 *
 * Many NodeView components store dimensions as percentages (widthPct/heightPct)
 * but older versions stored pixels. This hook lazily migrates legacy pixel
 * values to percentages on mount, ensuring backward compatibility.
 *
 * Migration rules:
 *   - If `widthPct` is null but `width` (px) exists → compute widthPct and nullify width
 *   - If `heightPct` is null but `height` (px) exists → compute heightPct and nullify height
 *   - Percentage is computed relative to editor surface width
 *   - Values are clamped to [1, 100]
 *
 * Usage:
 *   const editorWidth = useEditorWidth();
 *   const { widthPx, heightPx } = useSizeMigration({
 *     width, widthPct, height, heightPct, editorWidth, updateAttributes
 *   });
 */

import { useEffect } from 'react';

export interface UseSizeMigrationOptions {
  /** Legacy pixel width from node attrs. */
  width: number | null | undefined;
  /** Percentage width (preferred storage). */
  widthPct: number | null | undefined;
  /** Legacy pixel height from node attrs. */
  height?: number | null | undefined;
  /** Percentage height (preferred storage). */
  heightPct?: number | null | undefined;
  /** Current editor surface width in pixels. */
  editorWidth: number;
  /** TipTap NodeView `updateAttributes` callback. */
  updateAttributes: (attrs: Record<string, unknown>) => void;
}

export interface UseSizeMigrationResult {
  /** Pixel width (computed from widthPct or fallback to legacy width). */
  widthPx: number | null | undefined;
  /** Pixel height (computed from heightPct or fallback to legacy height). */
  heightPx: number | null | undefined;
}

export function useSizeMigration({
  width,
  widthPct,
  height,
  heightPct,
  editorWidth,
  updateAttributes,
}: UseSizeMigrationOptions): UseSizeMigrationResult {
  // Lazy migration: width → widthPct
  useEffect(() => {
    if (width != null && widthPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((width / editorWidth) * 100)));
      updateAttributes({ widthPct: pct, width: null });
    }
  }, [width, widthPct, editorWidth, updateAttributes]);

  // Lazy migration: height → heightPct
  useEffect(() => {
    if (height != null && heightPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((height / editorWidth) * 100)));
      updateAttributes({ heightPct: pct, height: null });
    }
  }, [height, heightPct, editorWidth, updateAttributes]);

  // Compute pixel dimensions from percentage (preferred) or fallback to legacy
  const widthPx = widthPct != null ? Math.round((widthPct * editorWidth) / 100) : width;
  const heightPx = heightPct != null && heightPct != undefined
    ? Math.round((heightPct * editorWidth) / 100)
    : height;

  return { widthPx, heightPx };
}