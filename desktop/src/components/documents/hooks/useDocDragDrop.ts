/**
 * useDocDragDrop - 从 DocumentSidebar 提取的文档/文件夹拖拽逻辑。
 *
 * 职责：
 *   - drag ref 管理（pointerdown -> threshold -> activate -> drop）
 *   - draggingDocId / draggingFolderId / dragOverTarget / flashFolderId / dragArmed 状态
 *   - onDocPointerDown / onFolderPointerDown 入口
 *   - pointermove/pointerup/pointercancel effect
 *   - 多选拖拽支持（selectedIds.size > 1 时移动全部选中项，仅文档）
 *   - 文件夹拖拽（单文件夹迁移，含自子树排除的循环保护）
 *
 * suppressClick ref 由外部组件持有，同时传给 useBatchSelection 和本 hook。
 */

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { collectDescendantFolderIds } from '../../../lib/documents/folderTree';

export const ROOT_DROP_ID = '__root__';
const DRAG_THRESHOLD = 5;

type DragKind = 'doc' | 'folder';

interface DragState {
  kind: DragKind;
  id: string;
  startX: number;
  startY: number;
  active: boolean;
  pointerId: number;
}

const IDLE_DRAG: DragState = {
  kind: 'doc',
  id: '',
  startX: 0,
  startY: 0,
  active: false,
  pointerId: -1,
};

export interface UseDocDragDropParams {
  docList: Array<{ id: string; folderId?: string | null }>;
  folders: Array<{ id: string; parentId: string | null }>;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  moveDocumentToFolder: (docId: string, folderId: string | null) => void;
  moveDocumentsToFolder: (docIds: string[], folderId: string | null) => void;
  moveFolder: (id: string, parentId: string | null) => void;
  renamingId: string | null;
  renamingFolderId: string | null;
  suppressClick: MutableRefObject<boolean>;
}

export function useDocDragDrop({
  docList,
  folders,
  selectedIds,
  setSelectedIds,
  moveDocumentToFolder,
  moveDocumentsToFolder,
  moveFolder,
  renamingId,
  renamingFolderId,
  suppressClick,
}: UseDocDragDropParams) {
  const drag = useRef<DragState>(IDLE_DRAG);
  const [dragArmed, setDragArmed] = useState(false);
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [flashFolderId, setFlashFolderId] = useState<string | null>(null);

  const beginDrag = (e: React.PointerEvent, kind: DragKind, id: string, renaming: string | null) => {
    // Only left button
    if (e.button !== 0) return;
    // Don't interfere with text selection inside rename input
    if (renaming === id) return;

    drag.current = {
      kind,
      id,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
    };
    setDragArmed(true);
  };

  const onDocPointerDown = (e: React.PointerEvent, docId: string) => {
    beginDrag(e, 'doc', docId, renamingId);
  };

  const onFolderPointerDown = (e: React.PointerEvent, folderId: string) => {
    beginDrag(e, 'folder', folderId, renamingFolderId);
  };

  // Global pointermove / pointerup - attached whenever a potential
  // drag is in progress (pointerdown happened but pointerup hasn't yet).
  useEffect(() => {
    if (!dragArmed) return;

    /**
     * Find the drop-target id under a screen point, or null.
     *
     * When dragging a folder, its own subtree (itself + descendants) is
     * excluded: dropping a folder into itself or a child of itself would
     * create a cycle, and the subtree rows sit under the cursor while
     * the original wrapper is still rendered in place.
     */
    const findDropTarget = (kind: DragKind, draggedId: string, x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const target = (el as HTMLElement).closest('[data-drop-target]') as HTMLElement | null;
      const id = target?.dataset.dropTarget ?? null;
      if (id === null) return null;
      if (kind === 'folder') {
        const excluded = new Set(collectDescendantFolderIds(folders, draggedId));
        if (excluded.has(id)) return null;
      }
      return id;
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
        if (d.kind === 'doc') setDraggingDocId(d.id);
        else setDraggingFolderId(d.id);
      }

      e.preventDefault();

      // Highlight the folder under the cursor
      setDragOverTarget(findDropTarget(d.kind, d.id, e.clientX, e.clientY));
    };

    const onUp = (e: PointerEvent) => {
      const d = drag.current;

      if (d.active) {
        // Commit the drop
        const target = findDropTarget(d.kind, d.id, e.clientX, e.clientY);
        if (target) {
          const folderId = target === ROOT_DROP_ID ? null : target;

          if (d.kind === 'folder') {
            // Folder drag moves just the folder itself (multi-drag is a
            // documents-only affordance). Store-side cycle guard is
            // defense in depth against a stale `folders` array.
            moveFolder(d.id, folderId);
            setSelectedIds(new Set());
          } else if (selectedIds.size > 1 && selectedIds.has(d.id)) {
            // If the dragged doc is part of a multi-selection, move all
            // selected docs. Otherwise move just the one (and clear selection).
            moveDocumentsToFolder([...selectedIds], folderId);
            setSelectedIds(new Set());
          } else {
            const doc = docList.find((x) => x.id === d.id);
            const currentFolder = doc?.folderId ?? null;
            if (currentFolder !== folderId) {
              moveDocumentToFolder(d.id, folderId);
            }
            setSelectedIds(new Set());
          }
          if (folderId) {
            setFlashFolderId(folderId);
            setTimeout(() => setFlashFolderId(null), 600);
          }
        }
        // Suppress the click that follows pointerup so we don't
        // accidentally open the document / toggle the folder.
        suppressClick.current = true;
      }

      // Reset
      drag.current = IDLE_DRAG;
      setDraggingDocId(null);
      setDraggingFolderId(null);
      setDragOverTarget(null);
      setDragArmed(false);
    };

    const onCancel = () => {
      drag.current = IDLE_DRAG;
      setDraggingDocId(null);
      setDraggingFolderId(null);
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
  }, [dragArmed, docList, folders, moveDocumentToFolder, selectedIds, moveDocumentsToFolder, moveFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    draggingDocId,
    draggingFolderId,
    dragOverTarget,
    flashFolderId,
    dragArmed,
    onDocPointerDown,
    onFolderPointerDown,
  };
}
