/**
 * Import / Export slice - Markdown import + .jnote backup bundles.
 */

import { ipc } from "../lib/core/ipc";
import { toMeta, type DocumentMeta, type FolderMeta } from "../types/storage";
import type { Document } from "../types";
import { markdownToBlocks } from "../lib/editor/markdownImport";
import type { GetState, SetState, SliceCreator } from "./storeHelpers";

/** Extensions recognised as Markdown. */
const MARKDOWN_EXT_RE = /\.(md|markdown|mdown)$/i;

/**
 * Behaviour switches shared by "Import Directory" and "Sync Directory".
 * Both walk the same directory tree; they only differ in how they treat
 * names that already exist in the workspace.
 */
interface DirectoryImportOptions {
  /** Skip a file whose base name (minus extension) already matches an
   *  existing document title. */
  skipExistingTitles: boolean;
  /** Reuse an existing folder with the same name + parent instead of
   *  creating a new one (so repeated syncs don't duplicate the tree). */
  reuseExistingFolders: boolean;
}

/** "Import Directory": always creates a fresh folder tree, imports everything. */
const IMPORT_DIRECTORY_OPTIONS: DirectoryImportOptions = {
  skipExistingTitles: false,
  reuseExistingFolders: false,
};

/** "Sync Directory": reuses the existing tree, skips already-imported names. */
const SYNC_DIRECTORY_OPTIONS: DirectoryImportOptions = {
  skipExistingTitles: true,
  reuseExistingFolders: true,
};

/** Everything `importDirectoryInternal` needs to walk one directory. */
interface DirectoryImportRequest {
  set: SetState;
  get: GetState;
  /** Absolute path of the directory to import. */
  dirPath: string;
  /** Optional parent folder to import into. */
  targetFolderId?: string;
  /** Import vs. sync behaviour. */
  options: DirectoryImportOptions;
}

/**
 * Walk a directory of Markdown files and turn it into folders + documents.
 *
 * Shared implementation behind `importMarkdownDirectory` (import everything
 * into a brand-new folder tree) and `syncMarkdownDirectory` (import only the
 * files that are not in the workspace yet, reusing the existing tree).
 *
 * @returns the number of documents that were created.
 */
async function importDirectoryInternal({
  set,
  get,
  dirPath,
  targetFolderId,
  options,
}: DirectoryImportRequest): Promise<number> {
  const entries = await ipc.listMarkdownFiles(dirPath);

  // Extract the directory name (e.g. "/path/to/MyNotes" -> "MyNotes")
  const dirName =
    dirPath
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .pop() || "Imported";

  const { folders, docList } = get();
  const newFolders: FolderMeta[] = [];
  const newDocs: Document[] = [];
  const newMetas: DocumentMeta[] = [];
  let folderSeq = 0;
  let docSeq = 0;
  const timestamp = Date.now();

  // Titles that must not be imported again (sync mode only).
  const existingTitles = options.skipExistingTitles
    ? new Set(docList.map((m) => m.title.trim()))
    : null;
  // Base names claimed during this run — also de-duplicates files with the
  // same base name living in different sub-directories.
  const claimedTitles = new Set<string>();

  /** Always create a new folder (import mode). */
  const createFolder = (name: string, parentId: string | null): string => {
    const id = `folder-${timestamp}-${folderSeq++}`;
    newFolders.push({
      id,
      name,
      parentId,
      sortOrder: 0,
      collapsed: false,
    });
    return id;
  };

  /** Reuse a same-named sibling folder if one exists, else create it. */
  const reuseFolder = (name: string, parentId: string | null): string => {
    const existing = [...folders, ...newFolders].find(
      (f) => !f.trashedAt && f.name === name && (f.parentId ?? null) === parentId,
    );
    return existing ? existing.id : createFolder(name, parentId);
  };

  const resolveFolder = options.reuseExistingFolders ? reuseFolder : createFolder;

  // Create a top-level folder mirroring the imported directory name,
  // so the directory itself (not just its contents) appears in the sidebar.
  const rootFolderId = resolveFolder(dirName, targetFolderId ?? null);

  /** relative-path -> folder-id lookup. Root maps to the new top-level folder. */
  const folderMap = new Map<string, string | null>();
  folderMap.set("", rootFolderId);

  for (const entry of entries) {
    if (entry.isDir) continue; // directories are created lazily below

    const filename = entry.relativePath.split("/").pop() ?? "Untitled.md";
    const baseName = filename.replace(MARKDOWN_EXT_RE, "");

    // Sync mode: a document with this name already exists (or was just
    // imported from another sub-directory) — skip it.
    if (existingTitles) {
      if (existingTitles.has(baseName) || claimedTitles.has(baseName)) continue;
    }
    claimedTitles.add(baseName);

    // Ensure every ancestor folder exists.
    const parts = entry.relativePath.split("/");
    // Remove the file name; remaining parts are directory segments.
    const dirParts = parts.slice(0, -1);
    let currentRel = "";
    let parentId: string | null = rootFolderId;
    for (const seg of dirParts) {
      const childRel = currentRel ? `${currentRel}/${seg}` : seg;
      if (folderMap.has(childRel)) {
        parentId = folderMap.get(childRel)!;
      } else {
        parentId = resolveFolder(seg, parentId);
        folderMap.set(childRel, parentId);
      }
      currentRel = childRel;
    }

    // Read + decode the Markdown file.
    const bytes = await ipc.readFileBytes(entry.path);
    const md = new TextDecoder("utf-8").decode(new Uint8Array(bytes));

    // Build the document.
    const blocks = markdownToBlocks(md);
    const h1Match = md.match(/^#\s+(.+)$/m);
    const title = h1Match ? h1Match[1].trim() : baseName;
    const now = new Date().toISOString();
    const doc: Document = {
      id: `doc-${timestamp}-${docSeq}`,
      title,
      emoji: "",
      createdAt: now,
      updatedAt: now,
      blocks,
    };
    docSeq++;

    await ipc.saveDocument(doc);
    newDocs.push(doc);
    newMetas.push({ ...toMeta(doc), folderId: parentId });
  }

  // Batch-persist everything (nothing to persist on a no-op sync).
  const mergedFolders =
    newFolders.length > 0 ? [...folders, ...newFolders] : folders;
  const newDocList = [...newMetas, ...get().docList];
  const newDocuments = [...newDocs, ...get().documents];

  if (newFolders.length > 0) await ipc.saveFolders(mergedFolders);
  if (newDocs.length > 0) await ipc.saveIndex(newDocList);

  set({
    folders: mergedFolders,
    docList: newDocList,
    documents: newDocuments,
    // Open the first imported document, if any.
    ...(newDocs.length > 0
      ? { activeDoc: newDocs[0], activeDocId: newDocs[0].id }
      : {}),
  });

  return newDocs.length;
}

/** Methods provided by the import/export slice (no own state). */
export interface ImportExportSlice {
  importDocumentFromMarkdown: (
    filename: string,
    md: string,
    folderId?: string,
  ) => Promise<void>;
  importMarkdownDirectory: (
    dirPath: string,
    targetFolderId?: string,
  ) => Promise<number>;
  syncMarkdownDirectory: (
    dirPath: string,
    targetFolderId?: string,
  ) => Promise<number>;
  exportDocumentBundle: (docId: string) => Promise<boolean>;
  importDocumentBundle: (folderId?: string) => Promise<string | null>;
}

export const createImportExportSlice: SliceCreator = (set, get) => ({
  importDocumentFromMarkdown: async (filename, md, folderId) => {
    const blocks = markdownToBlocks(md);

    // Derive document title: prefer first Markdown H1, fall back to filename.
    const h1Match = md.match(/^#\s+(.+)$/m);
    const baseName = filename.replace(/\.(md|markdown|mdown)$/i, "");
    const title = h1Match ? h1Match[1].trim() : baseName;

    const now = new Date().toISOString();
    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title,
      emoji: "",
      createdAt: now,
      updatedAt: now,
      blocks,
    };

    await ipc.saveDocument(newDoc);

    const meta = { ...toMeta(newDoc), folderId: folderId ?? null };
    const newDocList = [meta, ...get().docList];
    const newDocuments = [newDoc, ...get().documents];

    await ipc.saveIndex(newDocList);

    set({
      docList: newDocList,
      documents: newDocuments,
      activeDoc: newDoc,
      activeDocId: newDoc.id,
    });

    // Open a workspace tab for the imported document.
    get().openDocumentTab(newDoc.id);
    set({ activeSidebarView: "documents" });
  },

  /**
   * Import all Markdown files inside a directory, preserving the folder
   * hierarchy.  Sub-directories become folders; `.md` / `.markdown` /
   * `.mdown` files become documents placed in the corresponding folder.
   *
   * When `targetFolderId` is provided, the entire tree is imported *inside*
   * that existing folder (used by the folder context-menu "Import Directory").
   *
   * @param dirPath         absolute path of the directory to import.
   * @param targetFolderId  optional parent folder to import into.
   * @returns the number of documents that were imported.
   */
  importMarkdownDirectory: async (dirPath, targetFolderId) =>
    importDirectoryInternal({
      set,
      get,
      dirPath,
      targetFolderId,
      options: IMPORT_DIRECTORY_OPTIONS,
    }),

  syncMarkdownDirectory: async (dirPath, targetFolderId) =>
    importDirectoryInternal({
      set,
      get,
      dirPath,
      targetFolderId,
      options: SYNC_DIRECTORY_OPTIONS,
    }),

  // ── lossless backup bundles (.jnote) ──────────────────

  /**
   * Export a document to a lossless `.jnote` ZIP archive.
   *
   * Prompts the user for a destination via the native save dialog, then
   * delegates the actual packaging (document.json + assets/ + manifest) to
   * the Rust backend. Returns `true` if a file was written, `false` if the
   * user cancelled the dialog.
   */
  exportDocumentBundle: async (docId) => {
    const doc =
      get().documents.find((d) => d.id === docId) ??
      get().docList.find((m) => m.id === docId);
    const baseName =
      (doc?.title || "Untitled").replace(/[/\\:*?"<>|]/g, "_").trim() ||
      "Untitled";

    const { save } = await import("@tauri-apps/plugin-dialog");
    const destPath = await save({
      defaultPath: `${baseName}.jnote`,
      filters: [{ name: "JStudio Backup", extensions: ["jnote"] }],
    });
    if (!destPath || typeof destPath !== "string") return false;

    await ipc.exportDocumentBundle(docId, destPath);
    return true;
  },

  /**
   * Import a `.jnote` backup bundle as a brand-new document.
   *
   * Prompts for the file, asks the backend to unpack it into a fresh
   * `documents/{id}/` folder (assets included), then registers the new
   * document in the index + in-memory state and opens it. Returns the new
   * document id, or `null` if the user cancelled.
   */
  importDocumentBundle: async (folderId) => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const srcPath = await open({
      multiple: false,
      filters: [{ name: "JStudio Backup", extensions: ["jnote"] }],
    });
    if (!srcPath || typeof srcPath !== "string") return null;

    const newDocId = `doc-${Date.now()}`;
    const imported = await ipc.importDocumentBundle(srcPath, newDocId);

    // The backend rewrote `id`; trust its returned Document but keep our id.
    const newDoc: Document = { ...imported, id: newDocId };

    const meta = { ...toMeta(newDoc), folderId: folderId ?? null };
    const newDocList = [meta, ...get().docList];
    const newDocuments = [newDoc, ...get().documents];

    await ipc.saveIndex(newDocList);

    set({
      docList: newDocList,
      documents: newDocuments,
      activeDoc: newDoc,
      activeDocId: newDoc.id,
    });

    get().openDocumentTab(newDoc.id);
    set({ activeSidebarView: "documents" });

    return newDoc.id;
  },
});
