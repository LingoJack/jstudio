/**
 * Asset URL → blob URL resolver.
 *
 * Tauri's default `convertFileSrc` produces `asset://localhost/...` URLs. In
 * recent WebKit builds those are treated as cross-origin to the `tauri://localhost`
 * page, so `<img>`, `<audio>`, `<video>`, `fetch()`, and `<iframe>` are blocked
 * with "Domains, protocols and ports must match".
 *
 * This hook reads the on-disk asset via `ipc.readFileBytes` and creates a
 * same-origin `blob:tauri://localhost/...` URL that WebKit allows to load.
 *
 * Non-asset sources (`data:`, `http(s):`, `blob:`, absolute file URLs) pass
 * through unchanged.
 */

import { useEffect, useState } from 'react';
import { ipc } from '../../core/ipc';
import { getExtension, getMimeType } from '../fileUtils';
import { isAssetPath, resolveAssetFilePath } from './assetUrl';

export interface AssetBlobUrlState {
  /** Loadable URL (blob URL for local assets, original src otherwise). */
  url: string;
  /** True while the asset bytes are being read from disk. */
  loading: boolean;
  /** Set if reading the file failed. */
  error: Error | null;
}

/**
 * Resolve an asset reference to a loadable URL.
 *
 * @param src        Document source (`assets/…`, `data:…`, `http(s)://…`, …).
 * @param studioRoot Studio data root (from the store).
 * @param docId      Active document id (from the store).
 * @param mimeType   Optional MIME type hint; inferred from extension when omitted.
 */
export function useAssetBlobUrl(
  src: string,
  studioRoot: string,
  docId: string,
  mimeType?: string,
): AssetBlobUrlState {
  const [state, setState] = useState<AssetBlobUrlState>(() => ({
    url: isAssetPath(src) ? '' : src,
    loading: isAssetPath(src) && !!studioRoot && !!docId,
    error: null,
  }));

  useEffect(() => {
    if (!src || !isAssetPath(src)) {
      setState({ url: src, loading: false, error: null });
      return;
    }
    if (!studioRoot || !docId) {
      // Store data isn't ready yet; stay in loading state so we don't render
      // a broken relative path as a URL.
      setState({ url: '', loading: true, error: null });
      return;
    }

    let cancelled = false;
    const filePath = resolveAssetFilePath(studioRoot, docId, src);
    const type = mimeType || getMimeType(getExtension(src));

    setState((prev) =>
      prev.url === '' && prev.loading
        ? prev
        : { url: '', loading: true, error: null },
    );

    ipc
      .readFileBytes(filePath)
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([new Uint8Array(bytes)], { type });
        setState({ url: URL.createObjectURL(blob), loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          url: '',
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [src, studioRoot, docId, mimeType]);

  // Revoke the blob URL when it is no longer used (src changed or unmount).
  useEffect(() => {
    const { url } = state;
    if (url.startsWith('blob:')) {
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    return undefined;
  }, [state.url]);

  return state;
}
