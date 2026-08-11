import { useCallback, useEffect, useRef, useState } from "react";
import { useCursorTrailHostRef } from "../../CursorTrailContext";
function blurAway(input) {
  input.blur();
  const ae = document.activeElement;
  if (ae instanceof HTMLElement && ae.isContentEditable) {
    ae.blur();
  }
}
function useCodeBlockTitle({
  title,
  updateAttributes
}) {
  const [localTitle, setLocalTitle] = useState(title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef(null);
  const cursorTrailTitleRef = useCursorTrailHostRef(titleInputRef);
  useEffect(() => {
    setLocalTitle(title);
  }, [title]);
  useEffect(() => {
    if (isEditingTitle) {
      const el = titleInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [isEditingTitle]);
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
      setLocalTitle(title);
    }
    setIsEditingTitle(false);
  }, [localTitle, title, updateAttributes]);
  const cancelEditingTitle = useCallback(() => {
    setLocalTitle(title);
    setIsEditingTitle(false);
  }, [title]);
  useEffect(() => {
    if (!isEditingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    const onKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
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
    cancelEditingTitle
  };
}
export {
  useCodeBlockTitle
};
