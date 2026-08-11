import { ipc } from "../lib/core/ipc";
import { toMeta } from "../types/storage";
import { toast } from "../lib/core/toast";
import {
  scheduleDocumentSave,
  scheduleIndexSave
} from "./storeHelpers";
const createDocumentsSlice = (set, get) => ({
  // ── state ─────────────────────────────────────────────
  docList: [],
  documents: [],
  activeDoc: null,
  activeDocId: "",
  activeDocReloadNonce: 0,
  studioRoot: "",
  // ================================================================
  // document CRUD
  // ================================================================
  createDocument: async (folderId) => {
    const newDoc = {
      id: `doc-${Date.now()}`,
      title: "",
      emoji: "",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      blocks: [
        {
          id: `block-${Date.now()}-initial`,
          type: "text",
          content: [],
          properties: {}
        }
      ]
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
  deleteDocument: async (id) => {
    const { documents, docList, activeDocId } = get();
    const newDocuments = documents.filter((d) => d.id !== id);
    const newDocList = docList.filter((d) => d.id !== id);
    const stateUpdate = {
      documents: newDocuments,
      docList: newDocList
    };
    if (activeDocId === id) {
      const nextDoc = newDocuments[0] ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? "";
    }
    set(stateUpdate);
    get().removeDocumentTabByDocId(id);
    try {
      await ipc.deleteDocument(id);
    } catch (e) {
      console.error("Failed to delete document from disk:", e);
      toast.error("\u5220\u9664\u6587\u6863\u5931\u8D25");
    }
    try {
      await ipc.saveIndex(newDocList);
    } catch (e) {
      console.error("Failed to save index after delete:", e);
      toast.error("\u7D22\u5F15\u4FDD\u5B58\u5931\u8D25");
    }
  },
  deleteDocuments: async (ids) => {
    const { documents, docList, activeDocId } = get();
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    const newDocuments = documents.filter((d) => !idSet.has(d.id));
    const newDocList = docList.filter((d) => !idSet.has(d.id));
    const stateUpdate = {
      documents: newDocuments,
      docList: newDocList
    };
    if (activeDocId && idSet.has(activeDocId)) {
      const nextDoc = newDocuments[0] ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? "";
    }
    set(stateUpdate);
    ids.forEach((id) => get().removeDocumentTabByDocId(id));
    await Promise.allSettled(ids.map((id) => ipc.deleteDocument(id)));
    try {
      await ipc.saveIndex(newDocList);
    } catch (e) {
      console.error("Failed to save index after batch delete:", e);
      toast.error("\u7D22\u5F15\u4FDD\u5B58\u5931\u8D25");
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
      const prevDoc = get().activeDoc;
      try {
        const editor = document.querySelector(
          ".ProseMirror"
        );
        if (editor && (document.activeElement === editor || editor.contains(document.activeElement))) {
          document.body.focus();
        }
        window.getSelection()?.removeAllRanges();
      } catch {
      }
      set({ activeDoc: doc, activeDocId: id });
      if (prevDoc && prevDoc.id !== id) {
        void get().gcDocAssets(prevDoc);
      }
    }
  },
  reloadDoc: async (docId) => {
    try {
      const doc = await ipc.loadDocument(docId);
      const { documents, activeDocId, activeDocReloadNonce } = get();
      const newDocuments = documents.map((d) => d.id === docId ? doc : d);
      const patch = {
        documents: newDocuments,
        activeDocReloadNonce: activeDocReloadNonce + 1
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
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newDocuments = documents.map(
      (doc) => doc.id === activeDocId ? { ...doc, ...fields, updatedAt: now } : doc
    );
    const updatedDoc = newDocuments.find((d) => d.id === activeDocId) ?? null;
    const newDocList = docList.map(
      (meta) => meta.id === activeDocId ? { ...meta, ...fields, updatedAt: now } : meta
    );
    set({
      documents: newDocuments,
      activeDoc: updatedDoc,
      docList: newDocList
    });
    if (updatedDoc) scheduleDocumentSave(updatedDoc);
    scheduleIndexSave(newDocList);
  },
  renameDocument: (id, title) => {
    const { documents, docList } = get();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newDocuments = documents.map(
      (doc) => doc.id === id ? { ...doc, title, updatedAt: now } : doc
    );
    const updatedDoc = newDocuments.find((d) => d.id === id) ?? null;
    const newDocList = docList.map(
      (meta) => meta.id === id ? { ...meta, title, updatedAt: now } : meta
    );
    set({
      documents: newDocuments,
      activeDoc: updatedDoc,
      docList: newDocList
    });
    if (updatedDoc) scheduleDocumentSave(updatedDoc);
    scheduleIndexSave(newDocList);
  }
});
export {
  createDocumentsSlice
};
