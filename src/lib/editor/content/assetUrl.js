import { convertFileSrc } from "@tauri-apps/api/core";
function isAssetPath(src) {
  return src.startsWith("assets/");
}
function resolveAssetFilePath(studioRoot, docId, relPath) {
  const root = studioRoot.replace(/\\/g, "/");
  return `${root}/documents/${docId}/${relPath}`;
}
function resolveAssetUrl(studioRoot, docId, relPath) {
  return convertFileSrc(resolveAssetFilePath(studioRoot, docId, relPath));
}
function toDisplaySrc(src, studioRoot, docId) {
  if (!src || !isAssetPath(src) || !studioRoot || !docId) return src;
  return resolveAssetUrl(studioRoot, docId, src);
}
export {
  isAssetPath,
  resolveAssetFilePath,
  resolveAssetUrl,
  toDisplaySrc
};
