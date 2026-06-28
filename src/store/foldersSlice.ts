import { storage, type FolderMeta } from '../lib/storage';
import { onSaveError, type SetState, type GetState, type StoreState, scheduleFoldersSave, scheduleIndexSave } from './storeHelpers';
import { collectDescendantFolderIds } from '../lib/documents/folderTree';

export function createFoldersSlice(set: SetState, get: GetState) {
  return {
    folders: [] as FolderMeta[],
    trashedFolders: [] as FolderMeta[],

    // ── init ──────────────────────────────────────────────
    initFolders: (raw: FolderMeta[]) => {
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
    createFolder: (name: string, parentId: string | null): string => {
      const id = `folder-${Date.now()}`;
      const siblings = get().folders.filter((f) => f.parentId === parentId);
      const maxOrder = siblings.reduce((mx, f) => Math.max(mx, f.sortOrder), -1);

      const folder: FolderMeta = {
        id,
        name: name.trim() || 'Untitled',
        parentId,
        sortOrder: maxOrder + 1,
        collapsed: false,
      };

      const next = [...get().folders, folder];
      set({ folders: next });
      scheduleFoldersSave(next);
      return id;
    },

    // ── rename ────────────────────────────────────────────
    renameFolder: (id: string, name: string) => {
      const next = get().folders.map((f) =>
        f.id === id ? { ...f, name: name.trim() || f.name } : f,
      );
      set({ folders: next });
      scheduleFoldersSave(next);
    },

    // ── delete ────────────────────────────────────────────
    /**
     * Delete a folder and all its sub-folders (cascade).
     * Documents inside the deleted folders are also deleted from disk.
     */
    deleteFolder: (id: string) => {
      const { folders, docList, documents, activeDocId } = get();
      const toRemove = new Set(collectDescendantFolderIds(folders, id));

      // 1. Remove folders
      const nextFolders = folders.filter((f) => !toRemove.has(f.id));
      set({ folders: nextFolders });
      scheduleFoldersSave(nextFolders);

      // 2. Find documents inside the deleted folders
      const docIdsToRemove = new Set(
        docList
          .filter((d) => d.folderId && toRemove.has(d.folderId))
          .map((d) => d.id),
      );

      // 3. Remove those documents from in-memory state
      const nextDocList = docList.filter((d) => !docIdsToRemove.has(d.id));
      const nextDocuments = documents.filter((d) => !docIdsToRemove.has(d.id));

      const stateUpdate: Partial<StoreState> = {
        docList: nextDocList,
        documents: nextDocuments,
      };

      // If the active document is among the deleted, switch to the first remaining.
      if (activeDocId && docIdsToRemove.has(activeDocId)) {
        const nextDoc = nextDocuments[0] ?? null;
        stateUpdate.activeDoc = nextDoc;
        stateUpdate.activeDocId = nextDoc?.id ?? '';
      }

      set(stateUpdate);
      scheduleIndexSave(nextDocList);

      // 4. Persist: delete document files from disk (best-effort)
      for (const docId of docIdsToRemove) {
        storage.deleteDocument(docId).catch(onSaveError(`文档 ${docId}`));
      }
    },

    // ── delete (batch) ─────────────────────────────────────
    /**
     * Delete multiple folders (cascade).  Documents inside the deleted
     * folders are also deleted from disk.  Overlapping descendant folders
     * are de-duplicated so that a parent + child selection doesn't double-
     * process.
     */
    deleteFolders: (ids: string[]) => {
      const { folders, docList, documents, activeDocId } = get();

      // Collect ALL affected folder ids (each id + its descendants), then
      // de-duplicate into a single set.
      const toRemove = new Set<string>();
      for (const id of ids) {
        for (const desc of collectDescendantFolderIds(folders, id)) {
          toRemove.add(desc);
        }
      }

      // 1. Remove folders
      const nextFolders = folders.filter((f) => !toRemove.has(f.id));
      set({ folders: nextFolders });
      scheduleFoldersSave(nextFolders);

      // 2. Find documents inside the deleted folders
      const docIdsToRemove = new Set(
        docList
          .filter((d) => d.folderId && toRemove.has(d.folderId))
          .map((d) => d.id),
      );

      // 3. Remove those documents from in-memory state
      const nextDocList = docList.filter((d) => !docIdsToRemove.has(d.id));
      const nextDocuments = documents.filter((d) => !docIdsToRemove.has(d.id));

      const stateUpdate: Partial<StoreState> = {
        docList: nextDocList,
        documents: nextDocuments,
      };

      if (activeDocId && docIdsToRemove.has(activeDocId)) {
        const nextDoc = nextDocuments[0] ?? null;
        stateUpdate.activeDoc = nextDoc;
        stateUpdate.activeDocId = nextDoc?.id ?? '';
      }

      set(stateUpdate);
      scheduleIndexSave(nextDocList);

      // 4. Persist: delete document files from disk (best-effort)
      for (const docId of docIdsToRemove) {
        storage.deleteDocument(docId).catch(onSaveError(`文档 ${docId}`));
      }
    },

    // ── trash / restore (soft delete) ──────────────────────
    /**
     * Soft-delete a folder and all its sub-folders.  Documents inside
     * are also marked as trashed (but NOT deleted from disk).
     */
    trashFolder: (id: string) => {
      const { folders, docList, trashedDocList } = get();
      const now = new Date().toISOString();
      const toTrash = new Set(collectDescendantFolderIds(folders, id));

      // 1. Move folders to trashed list
      const movedFolders = folders
        .filter((f) => toTrash.has(f.id))
        .map((f) => ({ ...f, trashedAt: now }));
      const nextFolders = folders.filter((f) => !toTrash.has(f.id));
      const nextTrashedFolders = [...movedFolders, ...get().trashedFolders];

      // 2. Move documents inside those folders to trashed list
      const movedDocs = docList
        .filter((d) => d.folderId && toTrash.has(d.folderId))
        .map((d) => ({ ...d, trashedAt: now }));
      const movedDocIds = new Set(movedDocs.map((d) => d.id));
      const nextDocList = docList.filter((d) => !movedDocIds.has(d.id));
      const nextTrashedDocs = [...movedDocs, ...trashedDocList];

      set({
        folders: nextFolders,
        trashedFolders: nextTrashedFolders,
        docList: nextDocList,
        trashedDocList: nextTrashedDocs,
      });

      scheduleFoldersSave([...nextFolders, ...nextTrashedFolders]);
      scheduleIndexSave([...nextDocList, ...nextTrashedDocs]);
    },

    /**
     * Restore a trashed folder (and its sub-folders + documents) back
     * to active state.
     */
    restoreFolder: (id: string) => {
      const { trashedFolders, trashedDocList } = get();
      const toRestore = new Set(
        collectDescendantFolderIds(trashedFolders, id),
      );

      // 1. Restore folders
      const restoredFolders = trashedFolders
        .filter((f) => toRestore.has(f.id))
        .map((f) => ({ ...f, trashedAt: null }));
      const remainingTrashedFolders = trashedFolders.filter(
        (f) => !toRestore.has(f.id),
      );

      // 2. Restore documents inside those folders
      const restoredDocs = trashedDocList
        .filter((d) => d.folderId && toRestore.has(d.folderId))
        .map((d) => ({ ...d, trashedAt: null }));
      const restoredDocIds = new Set(restoredDocs.map((d) => d.id));
      const remainingTrashedDocs = trashedDocList.filter(
        (d) => !restoredDocIds.has(d.id),
      );

      const { folders, docList } = get();
      const nextFolders = [...restoredFolders, ...folders];
      const nextDocList = [...restoredDocs, ...docList];

      set({
        folders: nextFolders,
        trashedFolders: remainingTrashedFolders,
        docList: nextDocList,
        trashedDocList: remainingTrashedDocs,
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
    toggleFolderCollapsed: (id: string) => {
      const next = get().folders.map((f) =>
        f.id === id ? { ...f, collapsed: !f.collapsed } : f,
      );
      set({ folders: next });
      // Persist immediately — collapse state feels janky if debounced
      scheduleFoldersSave(next);
    },

    // ── move document ─────────────────────────────────────
    /**
     * Move a document to a different folder (or root if `folderId` is null).
     */
    moveDocumentToFolder: (docId: string, folderId: string | null) => {
      const nextDocList = get().docList.map((d) =>
        d.id === docId ? { ...d, folderId } : d,
      );
      set({ docList: nextDocList });
      scheduleIndexSave(nextDocList);
    },

    // ── move documents (batch) ────────────────────────────
    /**
     * Move multiple documents to a different folder (or root if `folderId` is null).
     */
    moveDocumentsToFolder: (docIds: string[], folderId: string | null) => {
      const idSet = new Set(docIds);
      if (idSet.size === 0) return;
      const nextDocList = get().docList.map((d) =>
        idSet.has(d.id) ? { ...d, folderId } : d,
      );
      set({ docList: nextDocList });
      scheduleIndexSave(nextDocList);
    },
  };
}
