import { ipc } from "../lib/core/ipc";
import { toMeta } from "../types/storage";
import { markdownToBlocks } from "../lib/editor/markdownImport";
const createImportExportSlice = (set, get) => ({
  importDocumentFromMarkdown: async (filename, md, folderId) => {
    const blocks = markdownToBlocks(md);
    const h1Match = md.match(/^#\s+(.+)$/m);
    const baseName = filename.replace(/\.(md|markdown|mdown)$/i, "");
    const title = h1Match ? h1Match[1].trim() : baseName;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newDoc = {
      id: `doc-${Date.now()}`,
      title,
      emoji: "",
      createdAt: now,
      updatedAt: now,
      blocks
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
      activeDocId: newDoc.id
    });
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
  importMarkdownDirectory: async (dirPath, targetFolderId) => {
    const entries = await ipc.listMarkdownFiles(dirPath);
    const dirName = dirPath.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Imported";
    const { folders } = get();
    const newFolders = [];
    const newDocs = [];
    const newMetas = [];
    let folderSeq = 0;
    let docCount = 0;
    const rootFolderId = `folder-${Date.now()}-${folderSeq++}`;
    newFolders.push({
      id: rootFolderId,
      name: dirName,
      parentId: targetFolderId ?? null,
      sortOrder: 0,
      collapsed: false
    });
    const folderMap = /* @__PURE__ */ new Map();
    folderMap.set("", rootFolderId);
    for (const entry of entries) {
      if (entry.isDir) continue;
      const bytes = await ipc.readFileBytes(entry.path);
      const md = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
      const filename = entry.relativePath.split("/").pop() ?? "Untitled.md";
      const parts = entry.relativePath.split("/");
      const dirParts = parts.slice(0, -1);
      let currentRel = "";
      let parentId = rootFolderId;
      for (const seg of dirParts) {
        const childRel = currentRel ? `${currentRel}/${seg}` : seg;
        if (folderMap.has(childRel)) {
          parentId = folderMap.get(childRel);
        } else {
          const id = `folder-${Date.now()}-${folderSeq++}`;
          newFolders.push({
            id,
            name: seg,
            parentId,
            sortOrder: 0,
            collapsed: false
          });
          folderMap.set(childRel, id);
          parentId = id;
        }
        currentRel = childRel;
      }
      const blocks = markdownToBlocks(md);
      const h1Match = md.match(/^#\s+(.+)$/m);
      const baseName = filename.replace(/\.(md|markdown|mdown)$/i, "");
      const title = h1Match ? h1Match[1].trim() : baseName;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const doc = {
        id: `doc-${Date.now()}-${docCount}`,
        title,
        emoji: "",
        createdAt: now,
        updatedAt: now,
        blocks
      };
      docCount++;
      await ipc.saveDocument(doc);
      newDocs.push(doc);
      newMetas.push({ ...toMeta(doc), folderId: parentId });
    }
    const mergedFolders = newFolders.length > 0 ? [...folders, ...newFolders] : folders;
    const newDocList = [...newMetas, ...get().docList];
    const newDocuments = [...newDocs, ...get().documents];
    await ipc.saveFolders(mergedFolders);
    await ipc.saveIndex(newDocList);
    set({
      folders: mergedFolders,
      docList: newDocList,
      documents: newDocuments,
      // Open the first imported document, if any.
      ...newDocs.length > 0 ? { activeDoc: newDocs[0], activeDocId: newDocs[0].id } : {}
    });
    return docCount;
  },
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
    const doc = get().documents.find((d) => d.id === docId) ?? get().docList.find((m) => m.id === docId);
    const baseName = (doc?.title || "Untitled").replace(/[/\\:*?"<>|]/g, "_").trim() || "Untitled";
    const { save } = await import("@tauri-apps/plugin-dialog");
    const destPath = await save({
      defaultPath: `${baseName}.jnote`,
      filters: [{ name: "JStudio Backup", extensions: ["jnote"] }]
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
      filters: [{ name: "JStudio Backup", extensions: ["jnote"] }]
    });
    if (!srcPath || typeof srcPath !== "string") return null;
    const newDocId = `doc-${Date.now()}`;
    const imported = await ipc.importDocumentBundle(srcPath, newDocId);
    const newDoc = { ...imported, id: newDocId };
    const meta = { ...toMeta(newDoc), folderId: folderId ?? null };
    const newDocList = [meta, ...get().docList];
    const newDocuments = [newDoc, ...get().documents];
    await ipc.saveIndex(newDocList);
    set({
      docList: newDocList,
      documents: newDocuments,
      activeDoc: newDoc,
      activeDocId: newDoc.id
    });
    get().openDocumentTab(newDoc.id);
    set({ activeSidebarView: "documents" });
    return newDoc.id;
  }
});
export {
  createImportExportSlice
};
