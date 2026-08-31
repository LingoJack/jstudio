/**
 * useDiagramSize — 处理 diagram block 的尺寸计算与迁移逻辑
 *
 * 负责:
 *   1. Legacy pixel → percentage 的懒迁移
 *   2. 从 widthPct/heightPct 计算实际像素尺寸
 *   3. 提供 resize handler
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNodeResize } from './useNodeResize';
import { useEditorWidth } from './useEditorWidth';
import type { DiagramNodeAttributes } from '../../../lib/editor/extensions/diagramExtension';

export interface UseDiagramSizeOptions {
  attrs: DiagramNodeAttributes;
  updateAttributes: (attrs: Partial<DiagramNodeAttributes>) => void;
  minWidth?: number;
  minHeight?: number;
  fallbackWidth?: number;
  fallbackHeight?: number;
}

export interface UseDiagramSizeResult {
  figureRef: React.RefObject<HTMLDivElement | null>;
  setFigureRef: (el: HTMLDivElement | null) => void;
  displayWidth: number | null;
  displayHeight: number | null;
  onResizeStart: (e: React.PointerEvent<HTMLElement>) => void;
}

export function useDiagramSize({
  attrs,
  updateAttributes,
  minWidth = 300,
  minHeight = 200,
  fallbackWidth = 520,
  fallbackHeight = 600,
}: UseDiagramSizeOptions): UseDiagramSizeResult {
  const { width, widthPct, height, heightPct } = attrs;
  const editorWidth = useEditorWidth();
  const figureRefInternal = useRef<HTMLDivElement>(null);

  // Lazy migration: legacy pixel width → percentage
  useEffect(() => {
    if (width != null && widthPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((width / editorWidth) * 100)));
      updateAttributes({ widthPct: pct, width: null });
    }
  }, [width, widthPct, editorWidth, updateAttributes]);

  // Lazy migration: legacy pixel height → percentage
  useEffect(() => {
    if (height != null && heightPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((height / editorWidth) * 100)));
      updateAttributes({ heightPct: pct, height: null });
    }
  }, [height, heightPct, editorWidth, updateAttributes]);

  // Compute pixel dimensions from percentages (preferred) or legacy px
  const widthPx = widthPct != null ? Math.round((widthPct * editorWidth) / 100) : width;
  const heightPx = heightPct != null ? Math.round((heightPct * editorWidth) / 100) : height;

  const { ref: figureRef, displayWidth, displayHeight, onResizeStart } =
    useNodeResize<HTMLDivElement>({
      width: widthPx,
      height: heightPx,
      updateAttributes,
      minWidth,
      minHeight,
      fallbackWidth,
      fallbackHeight,
      maxWidth: () => {
        const el = figureRefInternal.current;
        const editorSurface = el?.closest('.ProseMirror') as HTMLElement | null;
        if (editorSurface) {
          const style = getComputedStyle(editorSurface);
          const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
          return editorSurface.clientWidth - padX - 24;
        }
        return window.innerWidth - 24;
      },
      onCommit: (finalWidth, finalHeight) => {
        const pct =
          editorWidth > 0
            ? Math.min(100, Math.max(1, Math.round((finalWidth / editorWidth) * 100)))
            : 50;
        const attrs: Record<string, number | null> = { widthPct: pct, width: null };
        if (finalHeight !== null) {
          const hPct =
            editorWidth > 0
              ? Math.min(100, Math.max(1, Math.round((finalHeight / editorWidth) * 100)))
              : null;
          attrs.heightPct = hPct;
          attrs.height = null;
        }
        return attrs;
      },
    });

  const setFigureRef = useCallback((el: HTMLDivElement | null) => {
    (figureRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    figureRefInternal.current = el;
  }, []);

  return {
    figureRef,
    setFigureRef,
    displayWidth,
    displayHeight,
    onResizeStart,
  };
}