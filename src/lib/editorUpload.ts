/**
 * Editor upload helpers — save pasted/dropped files to the active document's
 * assets folder and return doc-relative references suitable for TipTap node
 * attributes (resolved to loadable URLs at render time via the asset protocol).
 */

import { saveBytesAsAsset, fileToAssetRef, genStoredName } from './upload';
import { useStore } from '../store/useStore';

/**
 * Save an image file to the active document's assets and return a
 * doc-relative reference (`assets/{fileName}`).
 */
export async function uploadImage(file: File): Promise<string> {
  const activeDocId = useStore.getState().activeDocId;
  return fileToAssetRef(file, activeDocId, 'image');
}

/**
 * Save a non-image file (attachment) to the active document's assets.
 * Returns the attribute object for a fileBlock node.
 */
export async function uploadAttachment(
  file: File,
): Promise<Record<string, unknown>> {
  const activeDocId = useStore.getState().activeDocId;
  const originalName = file.name || 'file';
  const ext = originalName.split('.').pop()?.toLowerCase() || 'bin';
  const mime = file.type || 'application/octet-stream';

  const arrayBuffer = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(arrayBuffer));
  const sizeBytes = bytes.length;
  const storedName = genStoredName('file', ext);

  const src = await saveBytesAsAsset(bytes, mime, activeDocId, storedName);

  return {
    src,
    fileName: originalName,
    fileSize: sizeBytes,
    fileType: mime,
  };
}

