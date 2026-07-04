/**
 * Document asset garbage collection.
 *
 * When a block referencing a doc-private asset (`assets/{fileName}`) is
 * removed from a document, the on-disk file becomes an orphan. Rather than
 * deleting it outright we move it into the document's recycle bin (`.trash/`)
 * so the user can restore or permanently delete it later.
 *
 * GC runs at undo-safe moments only (app startup, switching away from a
 * document) — never on every keystroke/save — so the editor's in-session undo
 * history can never resurrect a block whose asset file was already moved.
 */

import type { Document } from '../../types';
import { storage } from '../core/storage';

/**
 * Collect every `assets/{fileName}` reference anywhere in a document.
 *
 * We deliberately scan the *whole* serialized document (not just image/file
 * blocks) so that any block type or nested property that references an asset
 * is counted. This biases toward keeping files: a referenced asset is never
 * mistaken for an orphan.
 */
export function collectReferencedAssets(doc: Document): Set<string> {
  const json = JSON.stringify(doc);
  const refs = new Set<string>();
  // Asset file names are generated as `prefix-timestamp-rand.ext`
  // (see lib/editor/upload.ts → genStoredName), so the charset is limited.
  const re = /assets\/([A-Za-z0-9._-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json)) !== null) {
    refs.add(m[1]);
  }
  return refs;
}

/**
 * Move every on-disk asset of `doc` that the document no longer references
 * into the document's recycle bin.
 *
 * Best-effort: individual failures are swallowed so one bad file can't block
 * the rest. Returns the number of assets moved to the recycle bin.
 */
export async function gcDocumentAssets(doc: Document): Promise<number> {
  let trashed = 0;
  try {
    const onDisk = await storage.listDocAssets(doc.id);
    if (onDisk.length === 0) return 0;

    const referenced = collectReferencedAssets(doc);
    const orphans = onDisk.filter((a) => !referenced.has(a.fileName));

    for (const orphan of orphans) {
      try {
        await storage.trashDocAsset(doc.id, orphan.fileName);
        trashed++;
      } catch {
        // ignore — leave this file in place, retry on a later GC pass
      }
    }
  } catch {
    // ignore — listing failed (e.g. no assets dir); nothing to GC
  }
  return trashed;
}
