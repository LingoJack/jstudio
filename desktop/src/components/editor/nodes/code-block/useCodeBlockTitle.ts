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

/**
 * Blur the <input> and, if the browser reassigned focus to the surrounding
 * ProseMirror contenteditable host, blur that too so focus lands on <body>.
 * Without this, unmounting the input after Enter/Escape leaves focus on the
 * contenteditable and a stray text cursor appears at the code block.
 */
function blurAway(input: HTMLInputElement): void {
  input.blur();
  const ae = document.activeElement;
  if (ae instanceof HTMLElement && ae.isContentEditable) {
    ae.blur();
  }
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

  // When Enter/Escape blur the <input> to move focus away, the blur fires
  // onBlur={commitTitle}.  This ref suppresses that redundant/undesired
  // commit so the native keydown handler commits/cancels exactly once.
  const suppressBlurCommitRef = useRef(false);

  const startEditingTitle = useCallback(() => {
    suppressBlurCommitRef.current = false;
    setLocalTitle(title);
    setIsEditingTitle(true);
  }, [title]);

  const commitTitle = useCallback(() => {
    if (suppressBlurCommitRef.current) {
      suppressBlurCommitRef.current = false;
      return;
    }
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

  // Enter commits / Escape cancels via a NATIVE listener on the <input>.
  // The header's useHeaderEventShield registers a bubble-phase keydown
  // listener that calls stopPropagation() for form-control events, which
  // stops the event from ever reaching React's root-container listener -
  // so a React onKeyDown prop on the <input> never fires.  A listener
  // attached directly to the input runs in the target phase (before the
  // header's bubble-phase shield) and can therefore intercept Enter /
  // Escape.  stopPropagation() here also keeps the keys from bubbling on
  // to ProseMirror's own keydown handler on view.dom.
  useEffect(() => {
    if (!isEditingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        // Commit first, then blur to move focus to <body> BEFORE the
        // <input> is unmounted - otherwise the browser hands focus to
        // the ProseMirror contenteditable host and a stray text cursor
        // appears at the code block.  suppressBlurCommitRef stops the
        // blur-fired onBlur={commitTitle} from running a second time.
        commitTitle();
        suppressBlurCommitRef.current = true;
        blurAway(el);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelEditingTitle();
        suppressBlurCommitRef.current = true;
        blurAway(el);
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [isEditingTitle, commitTitle, cancelEditingTitle, titleInputRef]);

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
