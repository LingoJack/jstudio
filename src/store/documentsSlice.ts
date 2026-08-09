/**
 * Documents slice - in-memory document state + CRUD operations.
 *
 * Also initialises shared state fields used by other slices:
 *   - trashSlice:        trashedDocList, trashedAssets
 *   - importExportSlice: (no own state, uses documents/docList)
 *   - initSlice:         (no own state, populates all fields via set())
 */

import { storage } from "../lib/core/storage";
import { toMeta } from "../types/storage";
import type { Document } from "../types";
import { toast } from "../lib/core/toast";
import {
  scheduleDocumentSave,
  scheduleIndexSave,
  type StoreState,
  type SliceCreator,
} from "./storeHelpers";

export const createDocumentsSlice: SliceCreator = (set, get) => ({
  // ── state ─────────────────────────────────────────────
  docList: [],
  trashedDocList: [],
  trashedAssets: [],
  documents: [],
  activeDoc: null,
  activeDocId: "",
  activeDocReloadNonce: 0,
  studioRoot: "",

  // ================================================================
  // document CRUD
  // ================================================================
  createDocument: async (folderId?: string) => {
    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title: "",
      emoji: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blocks: [
        {
          id: `block-${Date.now()}-initial`,
          type: "text",
          content: [],
          properties: {},
        },
      ],
    };

    await storage.saveDocument(newDoc);

    const meta = { ...toMeta(newDoc), folderId: folderId ?? null };
    const newDocList = [meta, ...get().docList];
    const newDocuments = [newDoc, ...get().documents];

    await storage.saveIndex(newDocList);

    set({
      docList: newDocList,
      documents: newDocuments,
      activeDoc: newDoc,
      activeDocId: newDoc.id,
    });

    // Open a workspace tab for the new document + switch to documents view.
    get().openDocumentTab(newDoc.id);
    set({ activeSidebarView: "documents" });
  },

  deleteDocument: async (id) => {
    const { documents, docList, activeDocId } = get();

    // Update in-memory state FIRST so the UI reacts immediately even if
    // disk operations fail. This prevents the app from getting stuck in
    // an inconsistent state (e.g. black screen if storage throws).
    const newDocuments = documents.filter((d) => d.id !== id);
    const newDocList = docList.filter((d) => d.id !== id);

    const stateUpdate: Partial<StoreState> = {
      documents: newDocuments,
      docList: newDocList,
    };

    if (activeDocId === id) {
      const nextDoc = newDocuments[0] ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? "";
    }

    set(stateUpdate as StoreState);

    // Remove the workspace tab for this document (if any).
    get().removeDocumentTabByDocId(id);

    // Now persist to disk - failures are logged but don't crash the app.
    try {
      await storage.deleteDocument(id);
    } catch (e) {
      console.error("Failed to delete document from disk:", e);
      toast.error("删除文档失败");
    }

    try {
      await storage.saveIndex(newDocList);
    } catch (e) {
      console.error("Failed to save index after delete:", e);
      toast.error("索引保存失败");
    }
  },

  deleteDocuments: async (ids) => {
    const { documents, docList, activeDocId } = get();
    const idSet = new Set(ids);
    if (idSet.size === 0) return;

    // Update in-memory state FIRST so the UI reacts immediately.
    const newDocuments = documents.filter((d) => !idSet.has(d.id));
    const newDocList = docList.filter((d) => !idSet.has(d.id));

    const stateUpdate: Partial<StoreState> = {
      documents: newDocuments,
      docList: newDocList,
    };

    if (activeDocId && idSet.has(activeDocId)) {
      const nextDoc = newDocuments[0] ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? "";
    }

    set(stateUpdate as StoreState);

    // Remove workspace tabs for all deleted documents.
    ids.forEach((id) => get().removeDocumentTabByDocId(id));

    // Persist: delete document files from disk (best-effort, parallel)
    await Promise.allSettled(ids.map((id) => storage.deleteDocument(id)));

    try {
      await storage.saveIndex(newDocList);
    } catch (e) {
      console.error("Failed to save index after batch delete:", e);
      toast.error("索引保存失败");
    }
  },

  // ================================================================
  // document operations (open / reload / update / rename)
  // ================================================================
  openDocument: async (id) => {
    const { documents, activeDocId } = get();
    if (id === activeDocId) return;
    const doc = documents.find((d) => d.id === id);
    if (doc) {
      // Snapshot the document we're leaving so we can GC its assets below.
      const prevDoc = get().activeDoc;
      // CRITICAL: Move focus to <body> and clear selection before switching.
      // React will remove all old block DOM nodes (commitDeletionEffects).
      // If the browser's Selection still references one of those nodes,
      // WebKit throws "NotFoundError: The object can not be found here."
      try {
        const editor = document.querySelector(
          ".ProseMirror",
        ) as HTMLElement | null;
        if (
          editor &&
          (document.activeElement === editor ||
            editor.contains(document.activeElement))
        ) {
          (document.body as HTMLElement).focus();
        }
        window.getSelection()?.removeAllRanges();
      } catch {
        /* ignore */
      }
      set({ activeDoc: doc, activeDocId: id });

      // GC the document we just navigated away from. Its editor instance is
      // being torn down, so its undo history is no longer reachable - moving
      // any now-orphaned assets into the recycle bin is safe here.
      if (prevDoc && prevDoc.id !== id) {
        void get().gcDocAssets(prevDoc);
      }
    }
  },

  reloadDoc: async (docId) => {
    try {
      const doc = await storage.loadDocument(docId);
      const { documents, activeDocId, activeDocReloadNonce } = get();
      const newDocuments = documents.map((d) => (d.id === docId ? doc : d));
      const patch: Partial<StoreState> = {
        documents: newDocuments,
        activeDocReloadNonce: activeDocReloadNonce + 1,
      };
      if (docId === activeDocId) {
        patch.activeDoc = doc;
      }
      set(patch);
    } catch (e) {
      console.error("Failed to reload document:", e);
    }
  },

  updateDocumentMeta: (fields) => {
    const { activeDocId, documents, docList } = get();
    if (!activeDocId) return;

    const now = new Date().toISOString();

    const newDocuments = documents.map((doc) =>
      doc.id === activeDocId ? { ...doc, ...fields, updatedAt: now } : doc,
    );

    const updatedDoc = newDocuments.find((d) => d.id === activeDocId) ?? null;

    // Only patch the active doc's meta - do NOT rebuild from documents,
    // because Document objects don't carry folderId (only DocumentMeta does).
    const newDocList = docList.map((meta) =>
      meta.id === activeDocId ? { ...meta, ...fields, updatedAt: now } : meta,
    );

    set({
      documents: newDocuments,
      activeDoc: updatedDoc,
      docList: newDocList,
    });

    if (updatedDoc) scheduleDocumentSave(updatedDoc);
    scheduleIndexSave(newDocList);
  },

  renameDocument: (id, title) => {
    const { documents, docList } = get();
    const now = new Date().toISOString();

    const newDocuments = documents.map((doc) =>
      doc.id === id ? { ...doc, title, updatedAt: now } : doc,
    );
    const updatedDoc = newDocuments.find((d) => d.id === id) ?? null;

    // Only patch the renamed item's meta - do NOT rebuild from documents,
    // because Document objects don't carry folderId (only DocumentMeta does).
    const newDocList = docList.map((meta) =>
      meta.id === id ? { ...meta, title, updatedAt: now } : meta,
    );

    set({
      documents: newDocuments,
      activeDoc: updatedDoc,
      docList: newDocList,
    });

    if (updatedDoc) scheduleDocumentSave(updatedDoc);
    scheduleIndexSave(newDocList);
  },
});
