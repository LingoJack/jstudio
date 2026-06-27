/**
 * Unified file upload pipeline.
 *
 * Saves a file's raw bytes into the active document's `assets/` folder and
 * returns a portable, doc-relative reference (`assets/{fileName}`). The
 * reference is resolved to a loadable URL at render time via the asset
 * protocol (see `lib/assetUrl.ts`) — no base64 round-trip.
 */

import { storage } from '../storage';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Save an array of bytes to the active document's `assets/` folder and return
 * a doc-relative reference (`assets/{fileName}`).
 *
 * When no `activeDocId`/`storedName` is available (rare — e.g. no open
 * document), falls back to an inline base64 data URL so the content is still
 * usable in the current session.
 */
export async function saveBytesAsAsset(
  bytes: number[],
  mime: string,
  activeDocId?: string | null,
  storedName?: string,
): Promise<string> {
  if (activeDocId && storedName) {
    const finalName = await storage.saveDocAsset(activeDocId, storedName, bytes);
    return `assets/${finalName}`;
  }
  // Fallback: encode directly in-memory.
  const binary = String.fromCharCode(...bytes);
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Save a `File` object (from clipboard/drag-drop) to the active document's
 * `assets/` folder and return a doc-relative reference.
 */
export async function fileToAssetRef(
  file: File,
  activeDocId: string | null,
  prefix: string = 'file',
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const mime = file.type || 'application/octet-stream';
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(arrayBuffer));

  if (activeDocId) {
    const storedName = genStoredName(prefix, ext);
    return saveBytesAsAsset(bytes, mime, activeDocId, storedName);
  }

  // Fallback: FileReader data URL (handles large files reliably).
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

