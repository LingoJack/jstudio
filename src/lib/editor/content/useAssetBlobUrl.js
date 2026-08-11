import { useEffect, useState } from "react";
import { ipc } from "../../core/ipc";
import { getExtension, getMimeType } from "../fileUtils";
import { isAssetPath, resolveAssetFilePath } from "./assetUrl";
function useAssetBlobUrl(src, studioRoot, docId, mimeType) {
  const [state, setState] = useState(() => ({
    url: isAssetPath(src) ? "" : src,
    loading: isAssetPath(src) && !!studioRoot && !!docId,
    error: null
  }));
  useEffect(() => {
    if (!src || !isAssetPath(src)) {
      setState({ url: src, loading: false, error: null });
      return;
    }
    if (!studioRoot || !docId) {
      setState({ url: "", loading: true, error: null });
      return;
    }
    let cancelled = false;
    const filePath = resolveAssetFilePath(studioRoot, docId, src);
    const type = mimeType || getMimeType(getExtension(src));
    setState(
      (prev) => prev.url === "" && prev.loading ? prev : { url: "", loading: true, error: null }
    );
    ipc.readFileBytes(filePath).then((bytes) => {
      if (cancelled) return;
      const blob = new Blob([new Uint8Array(bytes)], { type });
      setState({ url: URL.createObjectURL(blob), loading: false, error: null });
    }).catch((err) => {
      if (cancelled) return;
      setState({
        url: "",
        loading: false,
        error: err instanceof Error ? err : new Error(String(err))
      });
    });
    return () => {
      cancelled = true;
    };
  }, [src, studioRoot, docId, mimeType]);
  useEffect(() => {
    const { url } = state;
    if (url.startsWith("blob:")) {
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    return void 0;
  }, [state.url]);
  return state;
}
export {
  useAssetBlobUrl
};
