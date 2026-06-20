import type { FolderMeta } from '../lib/storage';
import type { SetState, GetState } from './storeHelpers';
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
     * Documents inside the deleted folders are moved to root level
     * (their `folderId` is set to `null`).
     */
    deleteFolder: (id: string) => {
      const folders = get().folders;
      const toRemove = new Set(collectDescendantFolderIds(folders, id));

      // 1. Remove folders
      const nextFolders = folders.filter((f) => !toRemove.has(f.id));
      set({ folders: nextFolders });
      scheduleFoldersSave(nextFolders);

      // 2. Move affected documents to root
      const nextDocList = get().docList.map((d) =>
        d.folderId && toRemove.has(d.folderId)
          ? { ...d, folderId: null }
          : d,
      );
      set({ docList: nextDocList });
      scheduleIndexSave(nextDocList);
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
