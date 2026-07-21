import type { FolderMeta, DocumentMeta } from '../core/storage';
import { sortDocuments, sortFolders, type DocSortKey, type DocSortDirection } from './sortUtils';

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
 * Sort options consumed by {@link buildFolderTree}.
 */
export interface FolderTreeSortOptions {
  sortKey: DocSortKey;
  direction: DocSortDirection;
}

/**
 * Build a hierarchical tree from flat `folders` + `documents` arrays.
 *
 * Folders with a dangling `parentId` (parent doesn't exist) are treated
 * as top-level. Documents with a `folderId` that doesn't match any folder
 * are placed at the root.
 *
 * When `sort` is provided, documents are ordered by the chosen key +
 * direction, and folders are ordered accordingly (`sortOrder` for the
 * `'created'` key, pinyin-aware name for the `'title'` key).  When omitted,
 * the legacy behaviour (documents by `updatedAt` desc, folders by
 * `sortOrder`) is preserved.
 */
export function buildFolderTree(
  folders: FolderMeta[],
  documents: DocumentMeta[],
  sort?: FolderTreeSortOptions,
): FolderTreeNode {
  const folderById = new Map<string, FolderMeta>(folders.map((f) => [f.id, f]));

  /**
   * Sort folders according to the sort options.
   * - `'created'` → by `sortOrder` (folder creation timestamp)
   * - `'title'`   → by name with pinyin support
   */
  const sortSubFolders = (list: FolderMeta[]): FolderMeta[] => {
    if (!sort) {
      return list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    if (sort.sortKey === 'created') {
      const factor = sort.direction === 'asc' ? 1 : -1;
      return list.sort((a, b) => factor * (a.sortOrder - b.sortOrder));
    }
    return sortFolders(list, sort.direction);
  };

  /** Sort documents according to the sort options (or legacy default). */
  const sortDocs = (list: DocumentMeta[]): DocumentMeta[] => {
    if (!sort) {
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return sortDocuments(list, sort.sortKey, sort.direction);
  };

  function buildChildren(parentId: string | null): FolderTreeNode[] {
    const subs = sortSubFolders(
      folders.filter((f) => f.parentId === parentId),
    ).map((f) => ({
      folder: f,
      subFolders: buildChildren(f.id),
      documents: sortDocs(documents.filter((d) => d.folderId === f.id)),
    }));
    return subs;
  }

  return {
    folder: null,
    subFolders: buildChildren(null),
    documents: sortDocs(
      documents.filter((d) => !d.folderId || !folderById.has(d.folderId)),
    ),
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
