import { useEffect, useRef, useState } from "react";
const ROOT_DROP_ID = "__root__";
const DRAG_THRESHOLD = 5;
const IDLE_DRAG = {
  docId: "",
  startX: 0,
  startY: 0,
  active: false,
  pointerId: -1
};
function useDocDragDrop({
  docList,
  selectedIds,
  setSelectedIds,
  moveDocumentToFolder,
  moveDocumentsToFolder,
  renamingId,
  suppressClick
}) {
  const drag = useRef(IDLE_DRAG);
  const [dragArmed, setDragArmed] = useState(false);
  const [draggingDocId, setDraggingDocId] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [flashFolderId, setFlashFolderId] = useState(null);
  const onDocPointerDown = (e, docId) => {
    if (e.button !== 0) return;
    if (renamingId === docId) return;
    drag.current = {
      docId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId
    };
    setDragArmed(true);
  };
  useEffect(() => {
    if (!dragArmed) return;
    const findDropTarget = (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const target = el.closest("[data-drop-target]");
      return target?.dataset.dropTarget ?? null;
    };
    const onMove = (e) => {
      const d = drag.current;
      if (d.pointerId === -1) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        d.active = true;
        setDraggingDocId(d.docId);
      }
      e.preventDefault();
      const target = findDropTarget(e.clientX, e.clientY);
      setDragOverTarget(target);
    };
    const onUp = (e) => {
      const d = drag.current;
      if (d.active) {
        const target = findDropTarget(e.clientX, e.clientY);
        if (target) {
          const folderId = target === ROOT_DROP_ID ? null : target;
          if (selectedIds.size > 1 && selectedIds.has(d.docId)) {
            moveDocumentsToFolder([...selectedIds], folderId);
            setSelectedIds(/* @__PURE__ */ new Set());
          } else {
            const doc = docList.find((x) => x.id === d.docId);
            const currentFolder = doc?.folderId ?? null;
            if (currentFolder !== folderId) {
              moveDocumentToFolder(d.docId, folderId);
            }
            setSelectedIds(/* @__PURE__ */ new Set());
          }
          if (folderId) {
            setFlashFolderId(folderId);
            setTimeout(() => setFlashFolderId(null), 600);
          }
        }
        suppressClick.current = true;
      }
      drag.current = IDLE_DRAG;
      setDraggingDocId(null);
      setDragOverTarget(null);
      setDragArmed(false);
    };
    const onCancel = () => {
      drag.current = IDLE_DRAG;
      setDraggingDocId(null);
      setDragOverTarget(null);
      setDragArmed(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [dragArmed, docList, moveDocumentToFolder, selectedIds, moveDocumentsToFolder]);
  return {
    draggingDocId,
    dragOverTarget,
    flashFolderId,
    dragArmed,
    onDocPointerDown
  };
}
export {
  ROOT_DROP_ID,
  useDocDragDrop
};
