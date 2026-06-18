/**
 * Unified file upload pipeline.
 *
 * Extracted from ImageView / FileView / BlockEditor to eliminate
 * triple-duplicated Tauri dialog → readFileBytes → saveDocAsset
 * → readDocAssetBase64 → data-URL logic.
 */

import { storage } from './storage';
import { getMimeType } from './fileUtils';

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
 * For text-based MIME types, append `;charset=utf-8` so the browser
 * decodes the content as UTF-8 instead of defaulting to latin1.
 *
 * This is critical for HTML/SVG/text previews rendered in <iframe> —
 * without an explicit charset, non-ASCII characters (e.g. Chinese)
 * appear as garbled text (mojibake).
 */
function withCharset(mime: string): string {
  const textPrefixes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
    'image/svg+xml',
  ];
  if (
    !mime.includes('charset') &&
    textPrefixes.some((p) => mime.startsWith(p))
  ) {
    return `${mime};charset=utf-8`;
  }
  return mime;
}

/**
 * Convert an array of bytes to a base64 data URL.
 *
 * When an `activeDocId` is provided, the bytes are persisted to the
 * document's local `assets/` folder and read back as base64 (keeping the
 * document self-contained on disk). Otherwise the bytes are encoded inline.
 */
export async function bytesToDataUrl(
  bytes: number[],
  mime: string,
  activeDocId?: string | null,
  storedName?: string,
): Promise<string> {
  const fullMime = withCharset(mime);
  if (activeDocId && storedName) {
    await storage.saveDocAsset(activeDocId, storedName, bytes);
    const base64 = await storage.readDocAssetBase64(activeDocId, storedName);
    return `data:${fullMime};base64,${base64}`;
  }
  // Fallback: encode directly in-memory.
  const binary = String.fromCharCode(...bytes);
  const base64 = btoa(binary);
  return `data:${fullMime};base64,${base64}`;
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

  // Fallback: FileReader (handles large files reliably).
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/**
 * Generate a stored asset name with timestamp + random suffix.
 */
export function genStoredName(prefix: string, ext: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}.${ext || 'bin'}`;
}
