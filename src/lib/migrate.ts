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
}> {
  const fsEmpty = await isFileSystemEmpty();
  const oldDocs = localStorage.getItem(OLD_DOCS_KEY);
  const oldTheme = localStorage.getItem(OLD_THEME_KEY);

  // Nothing to migrate.
  if (fsEmpty && !oldDocs) {
    return { documentCount: 0 };
  }

  let documentCount = 0;

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
  if (oldTheme) {
    localStorage.removeItem(OLD_THEME_KEY);
  }

  return { documentCount };
}
