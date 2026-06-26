import { storage, type FolderMeta } from '../lib/storage';
import type { SetState, GetState, StoreState } from './storeHelpers';
import { scheduleFoldersSave, scheduleIndexSave } from './storeHelpers';
import { collectDescendantFolderIds } from '../lib/folderTree';

export function createFoldersSlice(set: SetState, get: GetState) {
  return {
    folders: [] as FolderMeta[],

    // ── init ──────────────────────────────────────────────
    initFolders: (raw: FolderMeta[]) => {
      set({ folders: raw ?? [] });
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
        storage.deleteDocument(docId).catch((e) => {
          console.error(`Failed to delete document ${docId} from disk:`, e);
        });
      }
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
  };
}
