/**
 * useDiagramEditMode — 处理 diagram block 的编辑模式和焦点管理
 *
 * 负责:
 *   1. 管理 Excalidraw/Graph canvas 的 root element ref
 *   2. 编辑模式激活时自动聚焦到画布 surface
 *   3. 使键盘快捷键(1/2/3工具选择, space拖拽等)生效
 */

import { useEffect, useRef, useCallback } from 'react';

export interface UseDiagramEditModeResult {
  editing: boolean;
  excalidrawRootRef: React.RefObject<HTMLDivElement | null>;
  handleExcalidrawRoot: (el: HTMLDivElement | null) => void;
}

export function useDiagramEditMode(editing: boolean): UseDiagramEditModeResult {
  const excalidrawRootRef = useRef<HTMLDivElement | null>(null);

  const handleExcalidrawRoot = useCallback((el: HTMLDivElement | null) => {
    excalidrawRootRef.current = el;
  }, []);

  // When entering edit mode, focus the canvas surface so it receives keyboard events
  useEffect(() => {
    if (!editing) return;
    const root = excalidrawRootRef.current;
    if (!root) return;

    const surface = (root.querySelector('.excalidraw') as HTMLElement | null) ?? root;
    if (surface.tabIndex < 0) surface.tabIndex = -1;
    surface.focus({ preventScroll: true });
  }, [editing]);

  return {
    editing,
    excalidrawRootRef,
    handleExcalidrawRoot,
  };
}