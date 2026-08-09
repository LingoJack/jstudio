/**
 * Trash slice - document soft-delete (trash / restore / empty) + asset recycle bin.
 *
 * Extracted from documentsSlice because these methods operate on a separate
 * concern (recycle bin lifecycle) that is unrelated to active document CRUD.
 *
 * State fields (trashedDocList, trashedAssets) are initialised in
 * documentsSlice; this slice only provides the methods that mutate them.
 */

import { storage } from "../lib/core/storage";
import type { StoreState, SliceCreator } from "./storeHelpers";
import { scheduleIndexSave } from "./storeHelpers";
import { toast } from "../lib/core/toast";
import { gcDocumentAssets } from "../lib/documents/assetGc";
import type { Document } from "../types";

export const createTrashSlice: SliceCreator = (set, get) => ({
  // ── document trash / restore ──────────────────────────

  trashDocument: async (id) => {
    const { docList, activeDocId, documents } = get();
    const now = new Date().toISOString();

    const moved = docList.find((m) => m.id === id);
    if (!moved) return;

    const marked = { ...moved, trashedAt: now };
    const newDocList = docList.filter((m) => m.id !== id);
    const newTrashed = [marked, ...get().trashedDocList];

    const stateUpdate: Partial<StoreState> = {
      docList: newDocList,
      trashedDocList: newTrashed,
    };

    if (activeDocId === id) {
      const nextDoc = documents.find((d) => d.id !== id) ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? "";
    }

    set(stateUpdate as StoreState);

    // Remove the workspace tab for this document (if any).
    get().removeDocumentTabByDocId(id);

    try {
      await storage.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after trash:", e);
      toast.error("移入废纸篓失败");
    }
  },

  trashDocuments: async (ids) => {
    const { docList, activeDocId, documents } = get();
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    const now = new Date().toISOString();

    const moved = docList
      .filter((m) => idSet.has(m.id))
      .map((m) => ({ ...m, trashedAt: now }));
    const newDocList = docList.filter((m) => !idSet.has(m.id));
    const newTrashed = [...moved, ...get().trashedDocList];

    const stateUpdate: Partial<StoreState> = {
      docList: newDocList,
      trashedDocList: newTrashed,
    };

    if (activeDocId && idSet.has(activeDocId)) {
      const nextDoc = documents.find((d) => !idSet.has(d.id)) ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? "";
    }

    set(stateUpdate as StoreState);

    // Remove workspace tabs for all trashed documents.
    ids.forEach((id) => get().removeDocumentTabByDocId(id));

    try {
      await storage.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after batch trash:", e);
      toast.error("移入废纸篓失败");
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
      await storage.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after restore:", e);
      toast.error("恢复文档失败");
    }
  },

  restoreDocuments: async (ids) => {
    const { trashedDocList } = get();
    const idSet = new Set(ids);
    if (idSet.size === 0) return;

    const restored = trashedDocList
      .filter((m) => idSet.has(m.id))
      .map((m) => ({ ...m, trashedAt: null }));
    const newTrashed = trashedDocList.filter((m) => !idSet.has(m.id));
    const newDocList = [...restored, ...get().docList];

    set({ docList: newDocList, trashedDocList: newTrashed });

    try {
      await storage.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after batch restore:", e);
      toast.error("恢复文档失败");
    }
  },

  emptyTrash: async () => {
    const { trashedDocList, documents } = get();
    if (trashedDocList.length === 0) return;

    const trashedIds = trashedDocList.map((m) => m.id);

    // Delete files from disk FIRST (each successful delete writes a tombstone
    // in the DB, preventing orphan-recovery from resurrecting it on next
    // launch). Only the ids that were actually deleted are removed from the
    // UI/index; failed ones stay in trash so the user can retry.
    const results = await Promise.allSettled(
      trashedIds.map((id) => storage.deleteDocument(id)),
    );
    const deletedIds = new Set(
      trashedIds.filter((_, i) => results[i].status === "fulfilled"),
    );
    const failedCount = trashedIds.length - deletedIds.size;

    const newTrashed = trashedDocList.filter((m) => !deletedIds.has(m.id));
    const newDocuments = documents.filter((d) => !deletedIds.has(d.id));

    set({
      trashedDocList: newTrashed,
      documents: newDocuments,
    });

    try {
      const { docList } = get();
      await storage.saveIndex([...docList, ...newTrashed]);
    } catch (e) {
      console.error("Failed to save index after empty trash:", e);
      toast.error("清空废纸篓失败");
    }

    if (failedCount > 0) {
      toast.error(`${failedCount} 个文档删除失败`);
    }
  },

  // ── asset recycle bin ─────────────────────────────────

  loadTrashedAssets: async () => {
    try {
      const list = await storage.listTrashedAssets();
      set({ trashedAssets: list });
    } catch (e) {
      console.error("Failed to load trashed assets:", e);
    }
  },

  gcDocAssets: async (doc: Document) => {
    const moved = await gcDocumentAssets(doc);
    if (moved > 0) {
      await get().loadTrashedAssets();
    }
  },

  restoreTrashedAsset: async (id) => {
    try {
      await storage.restoreTrashedAsset(id);
      set({ trashedAssets: get().trashedAssets.filter((a) => a.id !== id) });
    } catch (e) {
      console.error("Failed to restore trashed asset:", e);
      toast.error("恢复附件失败");
    }
  },

  deleteTrashedAsset: async (id) => {
    try {
      await storage.deleteTrashedAsset(id);
      set({ trashedAssets: get().trashedAssets.filter((a) => a.id !== id) });
    } catch (e) {
      console.error("Failed to delete trashed asset:", e);
      toast.error("删除附件失败");
    }
  },

  emptyTrashAssets: async () => {
    const { trashedAssets } = get();
    if (trashedAssets.length === 0) return;

    const results = await Promise.allSettled(
      trashedAssets.map((a) => storage.deleteTrashedAsset(a.id)),
    );
    const deletedIds = new Set(
      trashedAssets
        .filter((_, i) => results[i].status === "fulfilled")
        .map((a) => a.id),
    );
    set({
      trashedAssets: get().trashedAssets.filter((a) => !deletedIds.has(a.id)),
    });
  },
});
