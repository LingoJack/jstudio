import { sortDocuments, sortFolders } from "./sortUtils";
function buildFolderTree(folders, documents, sort) {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const sortSubFolders = (list) => {
    if (!sort) {
      return list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    if (sort.sortKey === "created") {
      const factor = sort.direction === "asc" ? 1 : -1;
      return list.sort((a, b) => factor * (a.sortOrder - b.sortOrder));
    }
    return sortFolders(list, sort.direction);
  };
  const sortDocs = (list) => {
    if (!sort) {
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return sortDocuments(list, sort.sortKey, sort.direction);
  };
  function buildChildren(parentId) {
    const subs = sortSubFolders(
      folders.filter((f) => f.parentId === parentId)
    ).map((f) => ({
      folder: f,
      subFolders: buildChildren(f.id),
      documents: sortDocs(documents.filter((d) => d.folderId === f.id))
    }));
    return subs;
  }
  return {
    folder: null,
    subFolders: buildChildren(null),
    documents: sortDocs(
      documents.filter((d) => !d.folderId || !folderById.has(d.folderId))
    )
  };
}
function collectDescendantFolderIds(folders, folderId) {
  const result = [folderId];
  const queue = [folderId];
  while (queue.length) {
    const current = queue.shift();
    for (const f of folders) {
      if (f.parentId === current) {
        result.push(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
}
export {
  buildFolderTree,
  collectDescendantFolderIds
};
