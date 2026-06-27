/**
 * Lazy migration: legacy base64 → on-disk assets.
 *
 * Older documents stored image/file content inline as base64 data URLs
 * (`data:{mime};base64,…`) directly in `document.json`. This bloats the JSON,
 * keeps the whole file resident in memory, and can't be loaded incrementally.
 *
 * On document load we rewrite any such block to the asset model: write the
 * bytes into the document's `assets/` folder and replace `content` with the
 * portable relative path `assets/{fileName}` (resolved to a loadable URL at
 * render time via the asset protocol). One-time cost per document.
 */

import { storage } from './storage';
import { genStoredName } from './editor/upload';
import type { Document, Block } from '../types';

/** MIME → file extension, for naming the migrated asset. */
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/html': 'html',
    'application/json': 'json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'docx',
  };
  if (map[mime]) return map[mime];
  const slash = mime.indexOf('/');
  if (slash >= 0) {
    const sub = mime.slice(slash + 1).split(/[;+]/)[0];
    if (sub) return sub;
  }
  return 'bin';
}

/** Decode a base64 data URL into raw bytes + a derived file extension. */
function decodeDataUrl(dataUrl: string): { bytes: number[]; ext: string } {
  const commaIdx = dataUrl.indexOf(',');
  const header = dataUrl.substring(5, commaIdx); // strip leading "data:"
  const mime = header.split(';')[0] || 'application/octet-stream';
  const payload = dataUrl.substring(commaIdx + 1);
  const binary = atob(payload);
  const bytes = new Array<number>(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, ext: mimeToExt(mime) };
}

/**
 * Migrate a document's inline base64 image/file blocks to on-disk assets.
 *
 * Returns the rewritten document if any block changed, or `null` when there
 * was nothing to migrate (so the caller can skip an unnecessary save).
 */
export async function migrateDocAssets(
  doc: Document,
): Promise<Document | null> {
  let changed = false;

  const blocks: Block[] = await Promise.all(
    doc.blocks.map(async (b) => {
      if (
        (b.type === 'image' || b.type === 'file') &&
        typeof b.content === 'string' &&
        b.content.startsWith('data:')
      ) {
        try {
          const { bytes, ext } = decodeDataUrl(b.content);
          const storedName = genStoredName(
            b.type === 'image' ? 'image' : 'file',
            ext,
          );
          const finalName = await storage.saveDocAsset(
            doc.id,
            storedName,
            bytes,
          );
          changed = true;
          return {
            ...b,
            content: `assets/${finalName}`,
            properties: {
              ...b.properties,
              ...(b.type === 'image'
                ? { imageType: 'asset' as const }
                : {}),
            },
          };
        } catch {
          // Leave the block untouched if decoding/writing fails.
          return b;
        }
      }
      return b;
    }),
  );

  return changed ? { ...doc, blocks } : null;
}
