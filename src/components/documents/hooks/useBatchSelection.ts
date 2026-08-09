/**
 * useBatchSelection - 从 DocumentSidebar 提取的批量选择逻辑。
 *
 * 职责：
 *   - selectedIds / lastClickedId 状态
 *   - visibleItemIds（shift+click 范围选择用）
 *   - splitSelection / batchDelete / batchMove
 *   - handleDocClick（meta/shift/普通点击的多选逻辑）
 *   - handleContextMenu（右键多选菜单）
 *   - Escape 清除选择 effect
 *
 * batchMenu / batchMoveMenu 状态保留在组件中（供 anyFloatingMenuOpen 使用）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { FolderTreeNode } from '../../../lib/documents/folderTree';
import type { TranslationKey } from '../../../lib/core/i18n';

export interface UseBatchSelectionParams {
  folders: Array<{ id: string; name: string }>;
  tree: { subFolders: FolderTreeNode[]; documents: Array<{ id: string }> };
  filteredDocs: Array<{ id: string }>;
  isSearching: boolean;
  trashDocuments: (ids: string[]) => void;
  trashFolder: (id: string) => void;
  moveDocumentsToFolder: (docIds: string[], folderId: string | null) => void;
  openDocumentTab: (docId: string) => void;
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; docId: string } | null>>;
  setFolderMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; folderId: string } | null>>;
  setBatchMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setBatchMoveMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  suppressClick: MutableRefObject<boolean>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export function useBatchSelection(params: UseBatchSelectionParams) {
  const {
    folders,
    tree,
    filteredDocs,
    isSearching,
    trashDocuments,
    trashFolder,
    moveDocumentsToFolder,
    openDocumentTab,
    setContextMenu,
    setFolderMenu,
    setBatchMenu,
    setBatchMoveMenu,
    suppressClick,
    t,
  } = params;

  // Keep a ref to `t` so callbacks that use it don't need it in their deps
  // (useI18n returns a new `t` function on every render).
  const tRef = useRef(t);
  tRef.current = t;

  // ── Batch selection state ─────────────────────────────────
  /** Unified selection set - contains both document ids and folder ids. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  // ── Derived: ordered visible item ids (docs + folders, for shift+click range) ──
  const visibleItemIds = useMemo(() => {
    const ids: string[] = [];
    const collect = (nodes: FolderTreeNode[]) => {
      for (const node of nodes) {
        if (node.folder) ids.push(node.folder.id);
        for (const doc of node.documents) ids.push(doc.id);
        if (node.folder && !node.folder.collapsed) collect(node.subFolders);
      }
    };
    if (isSearching) {
      return filteredDocs.map((d) => d.id);
    }
    collect(tree.subFolders);
    for (const doc of tree.documents) ids.push(doc.id);
    return ids;
  }, [tree, isSearching, filteredDocs]);

  const splitSelection = useCallback(() => {
    const folderIdSet = new Set(folders.map((f) => f.id));
    const selectedDocs: string[] = [];
    const selectedFolders: string[] = [];
    for (const id of selectedIds) {
      if (folderIdSet.has(id)) selectedFolders.push(id);
      else selectedDocs.push(id);
    }
    return { selectedDocs, selectedFolders };
  }, [selectedIds, folders]);

  const batchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const msg = tRef.current('doclist.batchMoveToTrashConfirm', { count: selectedIds.size });
    if (!window.confirm(msg)) return;
    const { selectedDocs, selectedFolders } = splitSelection();
    if (selectedDocs.length > 0) trashDocuments(selectedDocs);
    if (selectedFolders.length > 0) selectedFolders.forEach((id) => trashFolder(id));
    setSelectedIds(new Set());
    setBatchMenu(null);
  }, [selectedIds, splitSelection, trashDocuments, trashFolder]);

  const batchMove = useCallback((folderId: string | null) => {
    if (selectedIds.size === 0) return;
    const { selectedDocs } = splitSelection();
    if (selectedDocs.length > 0) moveDocumentsToFolder(selectedDocs, folderId);
    setSelectedIds(new Set());
    setBatchMoveMenu(null);
    setBatchMenu(null);
  }, [selectedIds, splitSelection, moveDocumentsToFolder]);

  // ── Effect: Escape clears batch selection ─────────────────
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIds(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds]);

  const handleContextMenu = useCallback((e: React.MouseEvent, id: string, kind: 'doc' | 'folder' = 'doc') => {
    e.preventDefault();
    e.stopPropagation();
    // If right-clicking on an item that's already in a multi-selection,
    // show the batch menu. Otherwise, clear selection and show single menu.
    if (selectedIds.size > 1 && selectedIds.has(id)) {
      setBatchMenu({ x: e.clientX, y: e.clientY });
      return;
    }
    setSelectedIds(new Set());
    if (kind === 'folder') {
      setFolderMenu({ x: e.clientX, y: e.clientY, folderId: id });
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY, docId: id });
    }
  }, [selectedIds, setBatchMenu, setSelectedIds, setFolderMenu, setContextMenu]);

  /**
   * Unified click handler for documents in the sidebar.
   *
   * Supports standard click (open), Cmd/Ctrl+click (toggle individual
   * selection), and Shift+click (range selection using visibleItemIds).
   *
   * The `suppressClick` ref is set by the drag-drop handler to prevent
   * a click from firing immediately after a drag ends.
   */
  const handleDocClick = useCallback((e: React.MouseEvent, docId: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(docId)) next.delete(docId);
        else next.add(docId);
        return next;
      });
      setLastClickedId(docId);
    } else if (e.shiftKey && lastClickedId) {
      const start = visibleItemIds.indexOf(lastClickedId);
      const end = visibleItemIds.indexOf(docId);
      if (start !== -1 && end !== -1) {
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        setSelectedIds(new Set(visibleItemIds.slice(lo, hi + 1)));
      }
      setLastClickedId(docId);
    } else {
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        return;
      }
      setSelectedIds(new Set());
      setLastClickedId(docId);
      openDocumentTab(docId);
    }
  }, [lastClickedId, visibleItemIds, selectedIds, openDocumentTab]);

  return {
    selectedIds,
    setSelectedIds,
    lastClickedId,
    setLastClickedId,
    visibleItemIds,
    splitSelection,
    batchDelete,
    batchMove,
    handleDocClick,
    handleContextMenu,
  };
}
