import { useCallback, useEffect, useRef, useState } from "react";
import { setSectionHighlight } from "../../../lib/editor/extensions/sectionHighlightSelection";
function sectionIdFromTarget(target) {
  if (!(target instanceof HTMLElement)) return null;
  const el = target.closest("[data-section-id]");
  return el?.getAttribute("data-section-id") ?? null;
}
function useCrossSectionSelection(ctx, resetKey) {
  const [active, setActive] = useState(false);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const selRef = useRef(null);
  const rangesRef = useRef([]);
  const dragOriginRef = useRef(null);
  const moveRafRef = useRef(null);
  const pendingMoveRef = useRef(null);
  const clearHighlights = useCallback(() => {
    const order = ctxRef.current.getOrder();
    for (const id of order) {
      const editor = ctxRef.current.getEditor(id);
      if (!editor) continue;
      setSectionHighlight(editor, null, null);
      editor.view.dom.classList.remove("cross-section-anchor-hide-selection");
    }
  }, []);
  const clear = useCallback(() => {
    clearHighlights();
    selRef.current = null;
    rangesRef.current = [];
    dragOriginRef.current = null;
    setActive(false);
  }, [clearHighlights]);
  const computeRanges = useCallback((sel) => {
    const order = ctxRef.current.getOrder();
    const minIdx = Math.min(sel.anchorIdx, sel.endIdx);
    const maxIdx = Math.max(sel.anchorIdx, sel.endIdx);
    const ranges = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      const id = order[i];
      if (!id) continue;
      const size = ctxRef.current.getHandle(id)?.getDocSize() ?? 0;
      let from;
      let to;
      if (minIdx === maxIdx) {
        from = Math.min(sel.anchorPos, sel.endPos);
        to = Math.max(sel.anchorPos, sel.endPos);
      } else if (i === minIdx) {
        if (sel.forward) {
          from = sel.anchorPos;
          to = size;
        } else {
          from = sel.endPos;
          to = size;
        }
      } else if (i === maxIdx) {
        if (sel.forward) {
          from = 0;
          to = sel.endPos;
        } else {
          from = 0;
          to = sel.anchorPos;
        }
      } else {
        from = 0;
        to = size;
      }
      ranges.push({ id, from, to });
    }
    return ranges;
  }, []);
  const apply = useCallback(
    (sel) => {
      clearHighlights();
      const ranges = computeRanges(sel);
      rangesRef.current = ranges;
      selRef.current = sel;
      for (const r of ranges) {
        setSectionHighlight(ctxRef.current.getEditor(r.id), r.from, r.to);
      }
      const anchorRange = ranges.find((r) => r.id === sel.anchorId);
      if (anchorRange) {
        ctxRef.current.getHandle(sel.anchorId)?.setTextSelection(anchorRange.from, anchorRange.from);
      }
      setActive(true);
    },
    [clearHighlights, computeRanges]
  );
  const handleMove = useCallback(
    (e) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const endId = sectionIdFromTarget(e.target);
      if (!endId) return;
      const endPos = ctxRef.current.getHandle(endId)?.posAtCoords(e.clientX, e.clientY);
      if (endPos == null) return;
      const order = ctxRef.current.getOrder();
      const endIdx = order.indexOf(endId);
      if (endIdx === -1) return;
      if (endId === origin.id) {
        if (selRef.current) clear();
        return;
      }
      e.preventDefault();
      const forward = origin.idx <= endIdx;
      apply({
        anchorId: origin.id,
        anchorIdx: origin.idx,
        anchorPos: origin.pos,
        endId,
        endIdx,
        endPos,
        forward
      });
    },
    [apply, clear]
  );
  const onMove = useCallback(
    (e) => {
      pendingMoveRef.current = e;
      if (moveRafRef.current != null) return;
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = null;
        const ev = pendingMoveRef.current;
        pendingMoveRef.current = null;
        if (ev) handleMove(ev);
      });
    },
    [handleMove]
  );
  const onUp = useCallback(() => {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
    if (moveRafRef.current != null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
  }, [onMove]);
  const onMouseDownCapture = useCallback(
    (e) => {
      if (selRef.current) clear();
      const id = sectionIdFromTarget(e.target);
      if (!id) {
        dragOriginRef.current = null;
        return;
      }
      const pos = ctxRef.current.getHandle(id)?.posAtCoords(e.clientX, e.clientY);
      if (pos == null) {
        dragOriginRef.current = null;
        return;
      }
      const order = ctxRef.current.getOrder();
      const idx = order.indexOf(id);
      if (idx === -1) {
        dragOriginRef.current = null;
        return;
      }
      dragOriginRef.current = { id, idx, pos };
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
    },
    [clear, onMove, onUp]
  );
  const selectAll = useCallback(() => {
    clearHighlights();
    const order = ctxRef.current.getOrder();
    if (order.length === 0) return;
    const ranges = order.map((id) => {
      const size = ctxRef.current.getHandle(id)?.getDocSize() ?? 0;
      return { id, from: 0, to: size };
    });
    const firstId = order[0];
    const lastId = order[order.length - 1];
    const lastSize = ctxRef.current.getHandle(lastId)?.getDocSize() ?? 0;
    rangesRef.current = ranges;
    selRef.current = {
      anchorId: firstId,
      anchorIdx: 0,
      anchorPos: 0,
      endId: lastId,
      endIdx: order.length - 1,
      endPos: lastSize,
      forward: true
    };
    for (const r of ranges) {
      setSectionHighlight(ctxRef.current.getEditor(r.id), r.from, r.to);
    }
    ctxRef.current.getHandle(firstId)?.setTextSelection(0, 0);
    setActive(true);
  }, [clearHighlights]);
  const deleteSelection = useCallback(() => {
    const ranges = rangesRef.current;
    const anchorId = selRef.current?.anchorId;
    for (let i = ranges.length - 1; i >= 0; i--) {
      const r = ranges[i];
      ctxRef.current.getHandle(r.id)?.deleteRange(r.from, r.to);
    }
    if (anchorId) {
      const anchorRange = ranges.find((r) => r.id === anchorId);
      if (anchorRange) {
        ctxRef.current.getHandle(anchorId)?.setTextSelection(anchorRange.from, anchorRange.from);
      }
    }
    ctxRef.current.onAfterDelete?.();
  }, []);
  useEffect(() => {
    const onCopy = (e) => {
      if (!selRef.current) return;
      e.preventDefault();
      const ranges = rangesRef.current;
      const text = ranges.map((r) => ctxRef.current.getHandle(r.id)?.getText(r.from, r.to) ?? "").join("\n");
      const html = ranges.map((r) => ctxRef.current.getHandle(r.id)?.getHTML(r.from, r.to) ?? "").join("");
      e.clipboardData?.setData("text/plain", text);
      e.clipboardData?.setData("text/html", html);
    };
    const onCut = (e) => {
      if (!selRef.current) return;
      onCopy(e);
      deleteSelection();
      clear();
    };
    const onKey = (e) => {
      const sel = selRef.current;
      if (!sel) return;
      const { key, metaKey, ctrlKey, altKey } = e;
      const anchorId = sel.anchorId;
      if ((metaKey || ctrlKey) && !altKey && key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
        return;
      }
      if ((metaKey || ctrlKey) && (key.toLowerCase() === "c" || key.toLowerCase() === "x")) {
        return;
      }
      if (key === "Backspace" || key === "Delete") {
        e.preventDefault();
        deleteSelection();
        clear();
        return;
      }
      if (key === "Escape") {
        e.preventDefault();
        clear();
        ctxRef.current.getHandle(anchorId)?.focus();
        return;
      }
      if (key.startsWith("Arrow")) {
        clear();
        ctxRef.current.getHandle(anchorId)?.focus();
        return;
      }
      if (!metaKey && !ctrlKey && !altKey && key.length === 1) {
        e.preventDefault();
        const ed = ctxRef.current.getEditor(anchorId);
        deleteSelection();
        clear();
        ed?.chain().focus().insertContent(key).run();
        return;
      }
      clear();
      ctxRef.current.getHandle(anchorId)?.focus();
    };
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCut, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCut, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [clear, deleteSelection, selectAll]);
  useEffect(() => {
    clear();
  }, [resetKey]);
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      if (moveRafRef.current != null) cancelAnimationFrame(moveRafRef.current);
      clearHighlights();
    };
  }, [onMove, onUp, clearHighlights]);
  return { active, clear, selectAll, onMouseDownCapture };
}
export {
  useCrossSectionSelection
};
