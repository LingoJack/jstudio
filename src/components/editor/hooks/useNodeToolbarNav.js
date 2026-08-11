import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo
} from "react";
function isPrintableKey(e) {
  if (e.isComposing || e.keyCode === 229) return false;
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}
function useNodeToolbarNav(selected, editor, buttonCount, interactive = false) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [editing, setEditing] = useState(false);
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  const buttonRefs = useRef([]);
  buttonRefs.current.length = buttonCount;
  const registerButton = useCallback((index) => {
    return (el) => {
      buttonRefs.current[index] = el;
    };
  }, []);
  const hostElRef = useRef(null);
  const interactiveRef = useCallback((el) => {
    hostElRef.current = el;
  }, []);
  const enterEditing = useCallback(() => {
    if (!interactive) return;
    setActiveIndex(-1);
    setEditing(true);
  }, [interactive]);
  const exitEditing = useCallback(() => {
    setEditing(false);
    editor?.commands.focus();
  }, [editor]);
  useEffect(() => {
    if (!selected) {
      setActiveIndex(-1);
      setEditing(false);
    }
  }, [selected]);
  useEffect(() => {
    if (!selected || !editor) return;
    const editorDom = editor.view.dom;
    const handleCaptureKeyDown = (e) => {
      if (editingRef.current) return;
      if (e.isComposing || e.keyCode === 229) return;
      const key = e.key;
      const isTab = key === "Tab";
      const isEnter = key === "Enter";
      const isSpace = key === " ";
      const isEscape = key === "Escape";
      const printable = isPrintableKey(e);
      if (!isTab && !isEnter && !isSpace && !isEscape && !printable) {
        return;
      }
      const itemCount = buttonCount;
      const current = activeIndexRef.current;
      if (isEscape) {
        e.preventDefault();
        e.stopPropagation();
        const { to } = editor.state.selection;
        editor.chain().setTextSelection(to).focus().run();
        return;
      }
      if (isTab && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (itemCount > 0) setActiveIndex(current >= itemCount - 1 ? 0 : current + 1);
        return;
      }
      if (isTab && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (itemCount > 0) setActiveIndex(current <= 0 ? itemCount - 1 : current - 1);
        return;
      }
      if (isEnter || isSpace) {
        e.preventDefault();
        e.stopPropagation();
        if (current >= 0 && current < itemCount) {
          buttonRefs.current[current]?.click();
        } else if (interactive) {
          enterEditing();
        }
        return;
      }
      if (printable) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };
    editorDom.addEventListener("keydown", handleCaptureKeyDown, true);
    return () => {
      editorDom.removeEventListener("keydown", handleCaptureKeyDown, true);
    };
  }, [selected, editor, buttonCount, interactive, enterEditing]);
  useEffect(() => {
    if (!editing) return;
    const host = hostElRef.current;
    if (!host) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        exitEditing();
      }
    };
    host.addEventListener("keydown", onKeyDown);
    return () => host.removeEventListener("keydown", onKeyDown);
  }, [editing, exitEditing]);
  const interactiveProps = useMemo(
    () => ({
      onDoubleClick: (e) => {
        if (!interactive) return;
        e.stopPropagation();
        enterEditing();
      },
      // `data-editing` lets CSS show a distinct ring while editing.
      ...editing ? { "data-editing": "true" } : {}
    }),
    [interactive, enterEditing, editing]
  );
  return {
    activeIndex,
    registerButton,
    editing,
    enterEditing,
    exitEditing,
    interactiveRef,
    interactiveProps
  };
}
export {
  useNodeToolbarNav
};
