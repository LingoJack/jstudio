const DEFAULT_DOC_SORT_KEY = "created";
const DEFAULT_DOC_SORT_DIRECTION = "desc";
function coerceDocSortKey(value) {
  return value === "title" ? "title" : "created";
}
function coerceDocSortDirection(value) {
  return value === "asc" ? "asc" : "desc";
}
let pinyinCollator = null;
function getPinyinCollator() {
  if (!pinyinCollator) {
    pinyinCollator = new Intl.Collator("zh-Hans-CN", {
      sensitivity: "base",
      numeric: true
    });
  }
  return pinyinCollator;
}
function compareByPinyin(a, b) {
  return getPinyinCollator().compare(a, b);
}
function sortDocuments(docs, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return docs.sort((a, b) => {
    if (key === "title") {
      return factor * compareByPinyin(a.title || "", b.title || "");
    }
    return factor * (a.createdAt || "").localeCompare(b.createdAt || "");
  });
}
function sortFolders(folders, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return folders.sort((a, b) => factor * compareByPinyin(a.name, b.name));
}
export {
  DEFAULT_DOC_SORT_DIRECTION,
  DEFAULT_DOC_SORT_KEY,
  coerceDocSortDirection,
  coerceDocSortKey,
  compareByPinyin,
  sortDocuments,
  sortFolders
};
