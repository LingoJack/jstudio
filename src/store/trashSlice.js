import { ipc } from "../lib/core/ipc";
import { toast } from "../lib/core/toast";
import { gcDocumentAssets } from "../lib/documents/assetRecycle";
const createTrashSlice = (set, get) => ({
  // ── state ─────────────────────────────────────────────
  trashedDocList: [],
  trashedAssets: [],
  // ── document trash / restore ──────────────────────────
  trashDocument: async (id) => {
    const { docList, activeDocId, documents } = get();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const moved = docList.find((m) => m.id === id);
    if (!moved) return;
    const marked = { ...moved, trashedAt: now };
    const newDocList = docList.filter((m) => m.id !== id);
    const newTrashed = [marked, ...get().trashedDocList];
    const stateUpdate = {
      docList: newDocList,
      trashedDocList: newTrashed
    };
    if (activeDocId === id) {
      const nextDoc = documents.find((d) => d.id !== id) ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? "";
    }
    set(stateUpdate);
    get().removeDocumentTabByDocId(id);
    try {
      await ipc.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after trash:", e);
      toast.error("\u79FB\u5165\u5E9F\u7EB8\u7BD3\u5931\u8D25");
    }
  },
  trashDocuments: async (ids) => {
    const { docList, activeDocId, documents } = get();
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const moved = docList.filter((m) => idSet.has(m.id)).map((m) => ({ ...m, trashedAt: now }));
    const newDocList = docList.filter((m) => !idSet.has(m.id));
    const newTrashed = [...moved, ...get().trashedDocList];
    const stateUpdate = {
      docList: newDocList,
      trashedDocList: newTrashed
    };
    if (activeDocId && idSet.has(activeDocId)) {
      const nextDoc = documents.find((d) => !idSet.has(d.id)) ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? "";
    }
    set(stateUpdate);
    ids.forEach((id) => get().removeDocumentTabByDocId(id));
    try {
      await ipc.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after batch trash:", e);
      toast.error("\u79FB\u5165\u5E9F\u7EB8\u7BD3\u5931\u8D25");
    }
  },
  restoreDocument: async (id) => {
    const { trashedDocList } = get();
    const target = trashedDocList.find((m) => m.id === id);
    if (!target) return;
    const restored = { ...target, trashedAt: null };
    const newTrashed = trashedDocList.filter((m) => m.id !== id);
    const newDocList = [restored, ...get().docList];
    set({ docList: newDocList, trashedDocList: newTrashed });
    try {
      await ipc.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after restore:", e);
      toast.error("\u6062\u590D\u6587\u6863\u5931\u8D25");
    }
  },
  restoreDocuments: async (ids) => {
    const { trashedDocList } = get();
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    const restored = trashedDocList.filter((m) => idSet.has(m.id)).map((m) => ({ ...m, trashedAt: null }));
    const newTrashed = trashedDocList.filter((m) => !idSet.has(m.id));
    const newDocList = [...restored, ...get().docList];
    set({ docList: newDocList, trashedDocList: newTrashed });
    try {
      await ipc.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after batch restore:", e);
      toast.error("\u6062\u590D\u6587\u6863\u5931\u8D25");
    }
  },
  emptyTrash: async () => {
    const { trashedDocList, documents } = get();
    if (trashedDocList.length === 0) return;
    const trashedIds = trashedDocList.map((m) => m.id);
    const results = await Promise.allSettled(
      trashedIds.map((id) => ipc.deleteDocument(id))
    );
    const deletedIds = new Set(
      trashedIds.filter((_, i) => results[i].status === "fulfilled")
    );
    const failedCount = trashedIds.length - deletedIds.size;
    const newTrashed = trashedDocList.filter((m) => !deletedIds.has(m.id));
    const newDocuments = documents.filter((d) => !deletedIds.has(d.id));
    set({
      trashedDocList: newTrashed,
      documents: newDocuments
    });
    try {
      const { docList } = get();
      await ipc.saveIndex([...docList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after empty trash:", e);
      toast.error("\u6E05\u7A7A\u5E9F\u7EB8\u7BD3\u5931\u8D25");
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} \u4E2A\u6587\u6863\u5220\u9664\u5931\u8D25`);
    }
  },
  // ── asset recycle bin ─────────────────────────────────
  loadTrashedAssets: async () => {
    try {
      const list = await ipc.listTrashedAssets();
      set({ trashedAssets: list });
    } catch (e) {
      console.error("Failed to load trashed assets:", e);
    }
  },
  gcDocAssets: async (doc) => {
    const moved = await gcDocumentAssets(doc);
    if (moved > 0) {
      await get().loadTrashedAssets();
    }
  },
  restoreTrashedAsset: async (id) => {
    try {
      await ipc.restoreTrashedAsset(id);
      set({ trashedAssets: get().trashedAssets.filter((a) => a.id !== id) });
    } catch (e) {
      console.error("Failed to restore trashed asset:", e);
      toast.error("\u6062\u590D\u9644\u4EF6\u5931\u8D25");
    }
  },
  deleteTrashedAsset: async (id) => {
    try {
      await ipc.deleteTrashedAsset(id);
      set({ trashedAssets: get().trashedAssets.filter((a) => a.id !== id) });
    } catch (e) {
      console.error("Failed to delete trashed asset:", e);
      toast.error("\u5220\u9664\u9644\u4EF6\u5931\u8D25");
    }
  },
  emptyTrashAssets: async () => {
    const { trashedAssets } = get();
    if (trashedAssets.length === 0) return;
    const results = await Promise.allSettled(
      trashedAssets.map((a) => ipc.deleteTrashedAsset(a.id))
    );
    const deletedIds = new Set(
      trashedAssets.filter((_, i) => results[i].status === "fulfilled").map((a) => a.id)
    );
    set({
      trashedAssets: get().trashedAssets.filter((a) => !deletedIds.has(a.id))
    });
  }
});
export {
  createTrashSlice
};
