/**
 * Unified file upload pipeline.
 *
 * Extracted from ImageView / FileView / BlockEditor to eliminate
 * triple-duplicated Tauri dialog → readFileBytes → saveDocAsset
 * → readDocAssetBase64 → data-URL logic.
 */

import { storage } from './storage';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface UploadResult {
  /** Base64 data URL of the file content (e.g. `data:image/png;base64,…`). */
  dataUrl: string;
  /** Original file name extracted from the file path. */
  fileName: string;
  /** File size in bytes. */
  fileSize: number;
  /** MIME type. */
  mime: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert an array of bytes to a base64 data URL.
 *
 * When an `activeDocId` is available, the bytes are persisted to the
 * document's local `assets/` folder and read back as base64 (keeping the
 * document self-contained on disk). Otherwise the bytes are encoded inline.
 */
export function bytesToDataUrl(
  bytes: number[],
  mime: string,
  activeDocId?: string | null,
  storedName?: string,
): Promise<string> {
  if (activeDocId && storedName) {
    return storage
      .saveDocAsset(activeDocId, storedName, bytes)
      .then(() => storage.readDocAssetBase64(activeDocId, storedName))
      .then((base64) => `data:${mime};base64,${base64}`);
  }
  // Fallback: encode directly in-memory.
  const binary = String.fromCharCode(...bytes);
  const base64 = btoa(binary);
  return Promise.resolve(`data:${mime};base64,${base64}`);
}

/**
 * Encode a `File` object (from clipboard/drag-drop) into a data URL.
 *
 * Uses the document's local asset folder when available.
 */
export async function fileToDataUrl(
  file: File,
  activeDocId: string | null,
  prefix: string = 'file',
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const mime = file.type || 'application/octet-stream';
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(arrayBuffer));

  if (activeDocId) {
    const storedName = `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}.${ext}`;
    return bytesToDataUrl(bytes, mime, activeDocId, storedName);
  }

  // Fallback: FileReader (in case file.type is more reliable than btoa
  // for very large files).
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Tauri dialog-based picker                                          */
/* ------------------------------------------------------------------ */

/**
 * Open a Tauri file-picker dialog and return the selected file as an
 * `UploadResult` (with the file content already converted to a data URL).
 *
 * Returns `null` if the user cancels.
 *
 * @param extensions  File extensions to show in the dialog filter.
 * @param prefix      Prefix for the stored asset name.
 */
export async function uploadFileViaDialog(
  extensions: string[],
  prefix: string = 'file',
): Promise<UploadResult | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const filePath = await open({
    multiple: false,
    filters: [{ name: 'Files', extensions }],
  });
  if (!filePath || typeof filePath !== 'string') return null;

  const activeDocId = useStore_getActiveDocId();

  const fileName = filePath.split(/[/\\]/).pop() || 'file';
  const ext = fileName.split('.').pop()?.toLowerCase() || 'bin';
  const mime = getMimeType(ext);

  const bytes = await storage.readFileBytes(filePath);
  const fileSize = bytes.length;

  const storedName = `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}.${ext || 'bin'}`;

  const dataUrl = await bytesToDataUrl(bytes, mime, activeDocId, storedName);

  return { dataUrl, fileName, fileSize, mime };
}

/* ------------------------------------------------------------------ */
/* MIME helpers (re-exported from fileUtils to avoid circular deps)   */
/* ------------------------------------------------------------------ */

// Lazy import to avoid circular dependency with storage.
import { getMimeType } from './fileUtils';

function useStore_getActiveDocId(): string | null {
  // Inline require-style import to avoid circular dependency issues at
  // module-load time.  The store is only needed at call time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useStore } = require('../store/useStore');
  return useStore.getState().activeDocId;
}
