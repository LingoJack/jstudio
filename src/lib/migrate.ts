import { storage, toMeta, DocumentMeta } from './storage';
import type { Document } from '../types';

/**
 * One-time migration from localStorage to the Tauri file system.
 *
 * Called during `store.init()`. After a successful migration the old
 * localStorage keys are kept (renamed with a `_migrated` suffix) so the
 * user has a backup, but the app never reads from them again.
 */

/**
 * Legacy localStorage keys from earlier builds.
 *
 * IMPORTANT: do NOT rename these constants — they are the literal keys
 * written by previous app versions. Renaming would silently strand any
 * existing user data still living in localStorage and block migration.
 * The product is now uniformly called "JStudio"; these keys remain only
 * for one-time backward-compatibility data migration.
 */
const OLD_DOCS_KEY = 'omninote_docs';
const OLD_THEME_KEY = 'omninote_theme';
const OLD_ASSETS_KEY = 'omninote_assets';

/** Check whether the file-system store has already been seeded. */
async function isFileSystemEmpty(): Promise<boolean> {
  try {
    const index = await storage.loadIndex();
    return !index || index.length === 0;
  } catch {
    return true; // index.json doesn't exist yet
  }
}

/** Migrate documents + theme from localStorage to ~/.jdata/studio. */
export async function migrateFromLocalStorage(): Promise<{
  documentCount: number;
  assetCount: number;
}> {
  const fsEmpty = await isFileSystemEmpty();
  const oldDocs = localStorage.getItem(OLD_DOCS_KEY);
  const oldTheme = localStorage.getItem(OLD_THEME_KEY);
  const oldAssets = localStorage.getItem(OLD_ASSETS_KEY);

  // Nothing to migrate.
  if (fsEmpty && !oldDocs && !oldAssets) {
    return { documentCount: 0, assetCount: 0 };
  }

  let documentCount = 0;
  let assetCount = 0;

  // --- Documents ---
  if (fsEmpty) {
    let docs: Document[] = [];

    if (oldDocs) {
      try {
        const parsed = JSON.parse(oldDocs) as Document[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          docs = parsed;
        }
      } catch {
        // corrupted — fall through to defaults
      }
    }

    // If no valid docs found, create a single blank document.
    if (docs.length === 0) {
      docs = [
        {
          id: `doc-${Date.now()}`,
          title: '',
          emoji: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          blocks: [
            {
              id: `block-${Date.now()}-initial`,
              type: 'text',
              content: '',
              properties: {},
            },
          ],
        },
      ];
    }

    // Write each document + build the index.
    const metas: DocumentMeta[] = [];
    for (const doc of docs) {
      await storage.saveDocument(doc);
      metas.push(toMeta(doc));
    }
    await storage.saveIndex(metas);
    documentCount = docs.length;
  }

  // --- Assets ---
  if (oldAssets && fsEmpty) {
    try {
      const parsed = JSON.parse(oldAssets) as Array<{
        id: string;
        name: string;
        type: string;
        content: string; // base64 data URI
      }>;

      if (Array.isArray(parsed)) {
        for (const asset of parsed) {
          // Parse "data:image/png;base64,...." → ext + raw bytes
          const match = /^data:([^;]+);base64,(.+)$/.exec(asset.content);
          if (!match) continue;

          const mimeType = match[1];
          const base64Data = match[2];
          const ext = mimeTypeToExt(mimeType);
          const bytes = base64ToBytes(base64Data);

          await storage.saveAsset(asset.id, Array.from(bytes), ext);
          assetCount++;
        }
      }
    } catch {
      // corrupted assets — skip silently
    }
  }

  // --- Theme / settings ---
  const settings: Record<string, unknown> = {};
  try {
    const existing = await storage.loadSettings();
    Object.assign(settings, existing);
  } catch {
    // ignore
  }

  if (oldTheme) {
    settings.theme = oldTheme === 'light' ? 'light' : 'dark';
  }
  if (Object.keys(settings).length > 0) {
    await storage.saveSettings(settings);
  }

  // --- Backup old localStorage keys (don't delete, just rename) ---
  if (oldDocs) {
    localStorage.setItem(`${OLD_DOCS_KEY}_migrated_backup`, oldDocs);
    localStorage.removeItem(OLD_DOCS_KEY);
  }
  if (oldAssets) {
    localStorage.setItem(`${OLD_ASSETS_KEY}_migrated_backup`, oldAssets);
    localStorage.removeItem(OLD_ASSETS_KEY);
  }
  if (oldTheme) {
    localStorage.removeItem(OLD_THEME_KEY);
  }

  return { documentCount, assetCount };
}

// ---- helpers ----

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function mimeTypeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'text/html': 'html',
    'text/css': 'css',
    'text/javascript': 'js',
    'application/json': 'json',
    'text/plain': 'txt',
  };
  return map[mime] ?? 'bin';
}
