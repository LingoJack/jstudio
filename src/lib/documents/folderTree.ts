import type { FolderMeta, DocumentMeta } from '../core/storage';

/**
 * A node in the folder tree.
 *
 * `folder` is `null` for the synthetic root node (which holds top-level
 * folders and root-level documents).
 */
export interface FolderTreeNode {
  folder: FolderMeta | null;
  subFolders: FolderTreeNode[];
  documents: DocumentMeta[];
}

/**
 * Build a hierarchical tree from flat `folders` + `documents` arrays.
 *
 * Folders with a dangling `parentId` (parent doesn't exist) are treated
 * as top-level. Documents with a `folderId` that doesn't match any folder
 * are placed at the root.
 */
export function buildFolderTree(
  folders: FolderMeta[],
  documents: DocumentMeta[],
): FolderTreeNode {
  const folderById = new Map<string, FolderMeta>(folders.map((f) => [f.id, f]));

  function buildChildren(parentId: string | null): FolderTreeNode[] {
    const subs = folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((f) => ({
        folder: f,
        subFolders: buildChildren(f.id),
        documents: documents
          .filter((d) => d.folderId === f.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      }));
    return subs;
  }

  return {
    folder: null,
    subFolders: buildChildren(null),
    documents: documents
      .filter((d) => !d.folderId || !folderById.has(d.folderId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

/**
 * Collect all folder ids that are descendants of `folderId` (including itself).
 * Used when deleting a folder to cascade-delete its sub-folders.
 */
export function collectDescendantFolderIds(
  folders: FolderMeta[],
  folderId: string,
): string[] {
  const result: string[] = [folderId];
  const queue = [folderId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const f of folders) {
      if (f.parentId === current) {
        result.push(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
}
