import { ipc } from "../lib/core/ipc";
import { onSaveError, scheduleFoldersSave, scheduleIndexSave } from "./storeHelpers";
import { collectDescendantFolderIds } from "../lib/documents/folderTree";
function createFoldersSlice(set, get) {
  return {
    folders: [],
    trashedFolders: [],
    // ── init ──────────────────────────────────────────────
    initFolders: (raw) => {
      const all = raw ?? [];
      const active = all.filter((f) => !f.trashedAt);
      const trashed = all.filter((f) => f.trashedAt);
      set({ folders: active, trashedFolders: trashed });
    },
    // ── create ────────────────────────────────────────────
    /**
     * Create a new folder under `parentId` (null = top-level).
     * Returns the new folder id.
     */
    createFolder: (name, parentId) => {
      const id = `folder-${Date.now()}`;
      const siblings = get().folders.filter((f) => f.parentId === parentId);
      const maxOrder = siblings.reduce((mx, f) => Math.max(mx, f.sortOrder), -1);
      const folder = {
        id,
        name: name.trim() || "Untitled",
        parentId,
        sortOrder: maxOrder + 1,
        collapsed: false
      };
      const next = [...get().folders, folder];
      set({ folders: next });
      scheduleFoldersSave(next);
      return id;
    },
    // ── rename ────────────────────────────────────────────
    renameFolder: (id, name) => {
      const next = get().folders.map(
        (f) => f.id === id ? { ...f, name: name.trim() || f.name } : f
      );
      set({ folders: next });
      scheduleFoldersSave(next);
    },
    // ── delete ────────────────────────────────────────────
    /**
     * Delete a folder and all its sub-folders (cascade).
     * Documents inside the deleted folders are also deleted from disk.
     */
    deleteFolder: (id) => {
      const { folders, docList, documents, activeDocId } = get();
      const toRemove = new Set(collectDescendantFolderIds(folders, id));
      const nextFolders = folders.filter((f) => !toRemove.has(f.id));
      set({ folders: nextFolders });
      scheduleFoldersSave(nextFolders);
      const docIdsToRemove = new Set(
        docList.filter((d) => d.folderId && toRemove.has(d.folderId)).map((d) => d.id)
      );
      const nextDocList = docList.filter((d) => !docIdsToRemove.has(d.id));
      const nextDocuments = documents.filter((d) => !docIdsToRemove.has(d.id));
      const stateUpdate = {
        docList: nextDocList,
        documents: nextDocuments
      };
      if (activeDocId && docIdsToRemove.has(activeDocId)) {
        const nextDoc = nextDocuments[0] ?? null;
        stateUpdate.activeDoc = nextDoc;
        stateUpdate.activeDocId = nextDoc?.id ?? "";
      }
      set(stateUpdate);
      scheduleIndexSave(nextDocList);
      for (const docId of docIdsToRemove) {
        ipc.deleteDocument(docId).catch(onSaveError(`\u6587\u6863 ${docId}`));
      }
    },
    // ── delete (batch) ─────────────────────────────────────
    /**
     * Delete multiple folders (cascade).  Documents inside the deleted
     * folders are also deleted from disk.  Overlapping descendant folders
     * are de-duplicated so that a parent + child selection doesn't double-
     * process.
     */
    deleteFolders: (ids) => {
      const { folders, docList, documents, activeDocId } = get();
      const toRemove = /* @__PURE__ */ new Set();
      for (const id of ids) {
        for (const desc of collectDescendantFolderIds(folders, id)) {
          toRemove.add(desc);
        }
      }
      const nextFolders = folders.filter((f) => !toRemove.has(f.id));
      set({ folders: nextFolders });
      scheduleFoldersSave(nextFolders);
      const docIdsToRemove = new Set(
        docList.filter((d) => d.folderId && toRemove.has(d.folderId)).map((d) => d.id)
      );
      const nextDocList = docList.filter((d) => !docIdsToRemove.has(d.id));
      const nextDocuments = documents.filter((d) => !docIdsToRemove.has(d.id));
      const stateUpdate = {
        docList: nextDocList,
        documents: nextDocuments
      };
      if (activeDocId && docIdsToRemove.has(activeDocId)) {
        const nextDoc = nextDocuments[0] ?? null;
        stateUpdate.activeDoc = nextDoc;
        stateUpdate.activeDocId = nextDoc?.id ?? "";
      }
      set(stateUpdate);
      scheduleIndexSave(nextDocList);
      for (const docId of docIdsToRemove) {
        ipc.deleteDocument(docId).catch(onSaveError(`\u6587\u6863 ${docId}`));
      }
    },
    // ── trash / restore (soft delete) ──────────────────────
    /**
     * Soft-delete a folder and all its sub-folders.  Documents inside
     * are also marked as trashed (but NOT deleted from disk).
     */
    trashFolder: (id) => {
      const { folders, docList, trashedDocList } = get();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const toTrash = new Set(collectDescendantFolderIds(folders, id));
      const movedFolders = folders.filter((f) => toTrash.has(f.id)).map((f) => ({ ...f, trashedAt: now }));
      const nextFolders = folders.filter((f) => !toTrash.has(f.id));
      const nextTrashedFolders = [...movedFolders, ...get().trashedFolders];
      const movedDocs = docList.filter((d) => d.folderId && toTrash.has(d.folderId)).map((d) => ({ ...d, trashedAt: now }));
      const movedDocIds = new Set(movedDocs.map((d) => d.id));
      const nextDocList = docList.filter((d) => !movedDocIds.has(d.id));
      const nextTrashedDocs = [...movedDocs, ...trashedDocList];
      set({
        folders: nextFolders,
        trashedFolders: nextTrashedFolders,
        docList: nextDocList,
        trashedDocList: nextTrashedDocs
      });
      scheduleFoldersSave([...nextFolders, ...nextTrashedFolders]);
      scheduleIndexSave([...nextDocList, ...nextTrashedDocs]);
    },
    /**
     * Restore a trashed folder (and its sub-folders + documents) back
     * to active state.
     */
    restoreFolder: (id) => {
      const { trashedFolders, trashedDocList } = get();
      const toRestore = new Set(
        collectDescendantFolderIds(trashedFolders, id)
      );
      const restoredFolders = trashedFolders.filter((f) => toRestore.has(f.id)).map((f) => ({ ...f, trashedAt: null }));
      const remainingTrashedFolders = trashedFolders.filter(
        (f) => !toRestore.has(f.id)
      );
      const restoredDocs = trashedDocList.filter((d) => d.folderId && toRestore.has(d.folderId)).map((d) => ({ ...d, trashedAt: null }));
      const restoredDocIds = new Set(restoredDocs.map((d) => d.id));
      const remainingTrashedDocs = trashedDocList.filter(
        (d) => !restoredDocIds.has(d.id)
      );
      const { folders, docList } = get();
      const nextFolders = [...restoredFolders, ...folders];
      const nextDocList = [...restoredDocs, ...docList];
      set({
        folders: nextFolders,
        trashedFolders: remainingTrashedFolders,
        docList: nextDocList,
        trashedDocList: remainingTrashedDocs
      });
      scheduleFoldersSave([...nextFolders, ...remainingTrashedFolders]);
      scheduleIndexSave([...nextDocList, ...remainingTrashedDocs]);
    },
    /**
     * Permanently delete all trashed folders (from folders.json only).
     * Document files on disk are cleaned by emptyTrash().
     */
    emptyTrashFolders: () => {
      const { trashedFolders } = get();
      if (trashedFolders.length === 0) return;
      set({ trashedFolders: [] });
      const { folders } = get();
      scheduleFoldersSave(folders);
    },
    // ── toggle collapsed ──────────────────────────────────
    toggleFolderCollapsed: (id) => {
      const next = get().folders.map(
        (f) => f.id === id ? { ...f, collapsed: !f.collapsed } : f
      );
      set({ folders: next });
      scheduleFoldersSave(next);
    },
    // ── move document ─────────────────────────────────────
    /**
     * Move a document to a different folder (or root if `folderId` is null).
     */
    moveDocumentToFolder: (docId, folderId) => {
      const nextDocList = get().docList.map(
        (d) => d.id === docId ? { ...d, folderId } : d
      );
      set({ docList: nextDocList });
      scheduleIndexSave(nextDocList);
    },
    // ── move documents (batch) ────────────────────────────
    /**
     * Move multiple documents to a different folder (or root if `folderId` is null).
     */
    moveDocumentsToFolder: (docIds, folderId) => {
      const idSet = new Set(docIds);
      if (idSet.size === 0) return;
      const nextDocList = get().docList.map(
        (d) => idSet.has(d.id) ? { ...d, folderId } : d
      );
      set({ docList: nextDocList });
      scheduleIndexSave(nextDocList);
    }
  };
}
export {
  createFoldersSlice
};
