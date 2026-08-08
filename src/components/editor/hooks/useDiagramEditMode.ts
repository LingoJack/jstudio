/**
 * useDiagramEditMode - 处理 diagram block 的编辑模式和焦点管理
 *
 * 负责:
 *   1. 管理 Graph canvas 的 root element ref
 *   2. 编辑模式激活时自动聚焦到画布 surface
 *   3. 使键盘快捷键(1/2/3工具选择, space拖拽等)生效
 */

import { useEffect, useRef, useCallback } from 'react';

export interface UseDiagramEditModeResult {
  editing: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
  handleRootRef: (el: HTMLDivElement | null) => void;
}

export function useDiagramEditMode(editing: boolean): UseDiagramEditModeResult {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const handleRootRef = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
  }, []);

  // When entering edit mode, focus the canvas surface so it receives keyboard events
  useEffect(() => {
    if (!editing) return;
    const root = rootRef.current;
    if (!root) return;

    if (root.tabIndex < 0) root.tabIndex = -1;
    root.focus({ preventScroll: true });
  }, [editing]);

  return {
    editing,
    rootRef,
    handleRootRef,
  };
}
