import { useCallback, useEffect, useMemo, useRef, useState } from "react";
function useBatchSelection(params) {
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
    t
  } = params;
  const tRef = useRef(t);
  tRef.current = t;
  const [selectedIds, setSelectedIds] = useState(/* @__PURE__ */ new Set());
  const [lastClickedId, setLastClickedId] = useState(null);
  const visibleItemIds = useMemo(() => {
    const ids = [];
    const collect = (nodes) => {
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
    const selectedDocs = [];
    const selectedFolders = [];
    for (const id of selectedIds) {
      if (folderIdSet.has(id)) selectedFolders.push(id);
      else selectedDocs.push(id);
    }
    return { selectedDocs, selectedFolders };
  }, [selectedIds, folders]);
  const batchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const msg = tRef.current("doclist.batchMoveToTrashConfirm", { count: selectedIds.size });
    if (!window.confirm(msg)) return;
    const { selectedDocs, selectedFolders } = splitSelection();
    if (selectedDocs.length > 0) trashDocuments(selectedDocs);
    if (selectedFolders.length > 0) selectedFolders.forEach((id) => trashFolder(id));
    setSelectedIds(/* @__PURE__ */ new Set());
    setBatchMenu(null);
  }, [selectedIds, splitSelection, trashDocuments, trashFolder]);
  const batchMove = useCallback((folderId) => {
    if (selectedIds.size === 0) return;
    const { selectedDocs } = splitSelection();
    if (selectedDocs.length > 0) moveDocumentsToFolder(selectedDocs, folderId);
    setSelectedIds(/* @__PURE__ */ new Set());
    setBatchMoveMenu(null);
    setBatchMenu(null);
  }, [selectedIds, splitSelection, moveDocumentsToFolder]);
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSelectedIds(/* @__PURE__ */ new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds]);
  const handleContextMenu = useCallback((e, id, kind = "doc") => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedIds.size > 1 && selectedIds.has(id)) {
      setBatchMenu({ x: e.clientX, y: e.clientY });
      return;
    }
    setSelectedIds(/* @__PURE__ */ new Set());
    if (kind === "folder") {
      setFolderMenu({ x: e.clientX, y: e.clientY, folderId: id });
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY, docId: id });
    }
  }, [selectedIds, setBatchMenu, setSelectedIds, setFolderMenu, setContextMenu]);
  const handleDocClick = useCallback((e, docId) => {
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
        setSelectedIds(/* @__PURE__ */ new Set());
        return;
      }
      setSelectedIds(/* @__PURE__ */ new Set());
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
    handleContextMenu
  };
}
export {
  useBatchSelection
};
