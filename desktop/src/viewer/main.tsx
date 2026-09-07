/**
 * Bootstrap of the standalone viewer bundle inside an exported HTML file.
 *
 * Two things have to be faked, because the export has neither the Electron
 * shell nor the Rust sidecar:
 *
 *   - `window.jstudioNative`: node views resolve images and attachments
 *     through `ipc.readFileBytes` → the sidecar. The bridge below answers
 *     that one method from the embedded asset map and refuses everything
 *     else, so `useAssetBlobUrl` works unchanged.
 *   - store state: `studioRoot` / `activeDocId` / language / theme are needed
 *     by the same components, and normally come from the app's bootstrap.
 */

import { createRoot } from 'react-dom/client';

// Same stylesheets as the app entry — the exported page must look identical.
import '../index.css';
import '../styles/vscode-theme.css';

import { useStore } from '../store/useStore';
import { DocumentViewer } from './DocumentViewer';
import type { ViewerPayload } from './viewerPayload';

/** Placeholder data root — asset paths are matched by suffix, never opened. */
const VIEWER_STUDIO_ROOT = 'jstudio-viewer';

/** Marker after which an asset path is the document-relative `assets/…`. */
const ASSET_PATH_MARKER = '/documents/';

function base64ToBytes(base64: string): number[] {
  const binary = atob(base64);
  const bytes: number[] = new Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Install the minimal native bridge the node views need. */
function installViewerBridge(assets: Record<string, string>): void {
  const findAsset = (path: string): string | undefined => {
    const index = path.lastIndexOf(ASSET_PATH_MARKER);
    if (index === -1) return undefined;
    // `…/documents/{docId}/{relPath}` — drop the docId segment.
    const relPath = path.slice(index + ASSET_PATH_MARKER.length).split('/').slice(1).join('/');
    return assets[relPath];
  };

  (window as unknown as { jstudioNative: unknown }).jstudioNative = {
    windowLabel: 'viewer',
    sidecarInvoke: async (method: string, params?: unknown) => {
      if (method === 'read_file_bytes') {
        const path = String((params as { path?: string } | undefined)?.path ?? '');
        const asset = findAsset(path);
        if (asset) return base64ToBytes(asset);
      }
      throw new Error(`viewer: ${method} is unavailable in an exported document`);
    },
    onEvent: () => () => {},
    emitEvent: () => {},
    windowOp: async () => null,
    windowCreate: async () => null,
    windowGetByLabel: async () => false,
    dialogOpen: async () => null,
    dialogSave: async () => null,
    clipboardReadText: async () => '',
    clipboardReadImage: async () => null,
    shellOpen: async () => {},
    openDevtools: async () => {},
    appFileBase64: async () => '',
  };
}

const payloadElement = document.getElementById('jstudio-viewer-data');
const payload = JSON.parse(payloadElement?.textContent ?? 'null') as ViewerPayload;

installViewerBridge(payload.assets);
document.documentElement.classList.toggle('dark', payload.dark === true);
useStore.setState({
  studioRoot: VIEWER_STUDIO_ROOT,
  activeDocId: payload.doc.id,
  language: payload.language,
  isDarkMode: payload.dark === true,
});

const root = document.getElementById('viewer-root');
if (root && payload) {
  createRoot(root).render(<DocumentViewer payload={payload} />);
}
