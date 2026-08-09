/**
 * Asset URL resolution.
 *
 * Binary assets (images, attachments) are stored on disk under
 * `~/.jdata/studio/documents/{docId}/assets/{fileName}` and referenced in
 * documents by the portable relative path `assets/{fileName}`.
 *
 * At render time we resolve that relative path to a loadable URL via Tauri's
 * asset protocol (`convertFileSrc`) — the WebView loads the file directly from
 * disk, with no base64 round-trip or in-memory bloat.
 */

import { convertFileSrc } from '@tauri-apps/api/core';

/** True when `src` is a doc-relative asset reference (`assets/…`). */
export function isAssetPath(src: string): boolean {
  return src.startsWith('assets/');
}

/**
 * Resolve a doc-relative asset path to an absolute filesystem path.
 *
 * `studioRoot` may use OS-native separators (backslashes on Windows); we
 * normalize to forward slashes. The returned path is suitable for passing
 * to Tauri commands such as `ipc.readFileBytes`.
 */
export function resolveAssetFilePath(
  studioRoot: string,
  docId: string,
  relPath: string,
): string {
  const root = studioRoot.replace(/\\/g, '/');
  return `${root}/documents/${docId}/${relPath}`;
}

/**
 * Resolve a doc-relative asset path to an asset-protocol URL.
 *
 * `studioRoot` may use OS-native separators (backslashes on Windows); we
 * normalize to forward slashes before handing the path to `convertFileSrc`.
 */
export function resolveAssetUrl(
  studioRoot: string,
  docId: string,
  relPath: string,
): string {
  return convertFileSrc(resolveAssetFilePath(studioRoot, docId, relPath));
}

/**
 * Resolve `src` to a displayable URL.
 *
 * Doc-relative asset paths (`assets/…`) are resolved via the asset protocol;
 * everything else (`data:`, `http(s):`, `asset:`, blob URLs) is passed through
 * unchanged.
 */
export function toDisplaySrc(
  src: string,
  studioRoot: string,
  docId: string,
): string {
  if (!src || !isAssetPath(src) || !studioRoot || !docId) return src;
  return resolveAssetUrl(studioRoot, docId, src);
}
