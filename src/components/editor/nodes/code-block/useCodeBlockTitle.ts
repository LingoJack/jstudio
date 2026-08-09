/**
 * useCodeBlockTitle - 从 CodeBlockView 提取的标题编辑逻辑。
 *
 * 职责：
 *   - 管理 localTitle / isEditingTitle 本地状态
 *   - 外部 title 变更（undo/redo）时同步 localTitle
 *   - 进入编辑模式时自动 focus + select-all
 *   - commitTitle: trim 后写回 node attrs，或回退到原始值
 *   - 暴露 cursorTrailTitleRef 供 JSX 渲染
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useCursorTrailHostRef } from "../../CursorTrailContext";

export interface UseCodeBlockTitleParams {
  title: string;
  updateAttributes: (attrs: Record<string, unknown>) => void;
}

export function useCodeBlockTitle({
  title,
  updateAttributes,
}: UseCodeBlockTitleParams) {
  const [localTitle, setLocalTitle] = useState(title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const cursorTrailTitleRef = useCursorTrailHostRef(titleInputRef);

  // Sync local state when the title changes from outside (e.g. undo/redo).
  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  // Auto-focus + select-all when entering edit mode.
  useEffect(() => {
    if (isEditingTitle) {
      const el = titleInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [isEditingTitle]);

  const startEditingTitle = useCallback(() => {
    setLocalTitle(title);
    setIsEditingTitle(true);
  }, [title]);

  const commitTitle = useCallback(() => {
    const trimmed = localTitle.trim();
    if (trimmed !== title) {
      updateAttributes({ title: trimmed });
    } else {
      // Re-sync in case the user typed then reverted.
      setLocalTitle(title);
    }
    setIsEditingTitle(false);
  }, [localTitle, title, updateAttributes]);

  const cancelEditingTitle = useCallback(() => {
    setLocalTitle(title);
    setIsEditingTitle(false);
  }, [title]);

  return {
    localTitle,
    setLocalTitle,
    isEditingTitle,
    titleInputRef,
    cursorTrailTitleRef,
    startEditingTitle,
    commitTitle,
    cancelEditingTitle,
  };
}
