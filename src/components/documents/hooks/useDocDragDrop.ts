/**
 * useDocDragDrop - 从 DocumentSidebar 提取的文档拖拽到文件夹逻辑。
 *
 * 职责：
 *   - drag ref 管理（pointerdown -> threshold -> activate -> drop）
 *   - draggingDocId / dragOverTarget / flashFolderId / dragArmed 状态
 *   - onDocPointerDown 入口
 *   - pointermove/pointerup/pointercancel effect
 *   - 多选拖拽支持（selectedIds.size > 1 时移动全部选中项）
 *
 * suppressClick ref 由外部组件持有，同时传给 useBatchSelection 和本 hook。
 */

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

export const ROOT_DROP_ID = '__root__';
const DRAG_THRESHOLD = 5;

interface DragState {
  docId: string;
  startX: number;
  startY: number;
  active: boolean;
  pointerId: number;
}

const IDLE_DRAG: DragState = {
  docId: '',
  startX: 0,
  startY: 0,
  active: false,
  pointerId: -1,
};

export interface UseDocDragDropParams {
  docList: Array<{ id: string; folderId?: string | null }>;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  moveDocumentToFolder: (docId: string, folderId: string | null) => void;
  moveDocumentsToFolder: (docIds: string[], folderId: string | null) => void;
  renamingId: string | null;
  suppressClick: MutableRefObject<boolean>;
}

export function useDocDragDrop({
  docList,
  selectedIds,
  setSelectedIds,
  moveDocumentToFolder,
  moveDocumentsToFolder,
  renamingId,
  suppressClick,
}: UseDocDragDropParams) {
  const drag = useRef<DragState>(IDLE_DRAG);
  const [dragArmed, setDragArmed] = useState(false);
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [flashFolderId, setFlashFolderId] = useState<string | null>(null);

  const onDocPointerDown = (e: React.PointerEvent, docId: string) => {
    // Only left button
    if (e.button !== 0) return;
    // Don't interfere with text selection inside rename input
    if (renamingId === docId) return;

    drag.current = {
      docId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
    };
    setDragArmed(true);
  };

  // Global pointermove / pointerup - attached whenever a potential
  // drag is in progress (pointerdown happened but pointerup hasn't yet).
  useEffect(() => {
    if (!dragArmed) return;

    /** Find the drop-target id under a screen point, or null. */
    const findDropTarget = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const target = (el as HTMLElement).closest('[data-drop-target]') as HTMLElement | null;
      return target?.dataset.dropTarget ?? null;
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (d.pointerId === -1) return;

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      // Activate drag once threshold is crossed
      if (!d.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        d.active = true;
        setDraggingDocId(d.docId);
      }

      e.preventDefault();

      // Highlight the folder under the cursor
      const target = findDropTarget(e.clientX, e.clientY);
      setDragOverTarget(target);
    };

    const onUp = (e: PointerEvent) => {
      const d = drag.current;

      if (d.active) {
        // Commit the drop
        const target = findDropTarget(e.clientX, e.clientY);
        if (target) {
          const folderId = target === ROOT_DROP_ID ? null : target;

          // If the dragged doc is part of a multi-selection, move all
          // selected docs. Otherwise move just the one (and clear selection).
          if (selectedIds.size > 1 && selectedIds.has(d.docId)) {
            moveDocumentsToFolder([...selectedIds], folderId);
            setSelectedIds(new Set());
          } else {
            const doc = docList.find((x) => x.id === d.docId);
            const currentFolder = doc?.folderId ?? null;
            if (currentFolder !== folderId) {
              moveDocumentToFolder(d.docId, folderId);
            }
            setSelectedIds(new Set());
          }
          if (folderId) {
            setFlashFolderId(folderId);
            setTimeout(() => setFlashFolderId(null), 600);
          }
        }
        // Suppress the click that follows pointerup so we don't
        // accidentally open the document.
        suppressClick.current = true;
      }

      // Reset
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

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [dragArmed, docList, moveDocumentToFolder, selectedIds, moveDocumentsToFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    draggingDocId,
    dragOverTarget,
    flashFolderId,
    dragArmed,
    onDocPointerDown,
  };
}
