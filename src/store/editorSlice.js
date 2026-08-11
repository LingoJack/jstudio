import { ipc } from "../lib/core/ipc";
import { scheduleDocumentSave } from "./storeHelpers";
const createEditorSlice = (set, get) => ({
  // ================================================================
  // block operations — all operate on activeDoc
  // ================================================================
  updateBlock: (blockId, fields) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatedBlocks = activeDoc.blocks.map(
      (b) => b.id === blockId ? { ...b, ...fields } : b
    );
    const updatedDoc = { ...activeDoc, blocks: updatedBlocks, updatedAt: now };
    const newDocuments = documents.map(
      (d) => d.id === activeDoc.id ? updatedDoc : d
    );
    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },
  deleteBlock: (blockId, mergeContent) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;
    const targetIdx = activeDoc.blocks.findIndex((b) => b.id === blockId);
    if (targetIdx === -1) return;
    let updatedBlocks = [...activeDoc.blocks];
    if (targetIdx > 0 && mergeContent !== void 0) {
      const prevBlock = updatedBlocks[targetIdx - 1];
      const prevContent = Array.isArray(prevBlock.content) ? prevBlock.content : [];
      const toMerge = Array.isArray(mergeContent) ? mergeContent : [];
      updatedBlocks[targetIdx - 1] = {
        ...prevBlock,
        content: [...prevContent, ...toMerge]
      };
    }
    updatedBlocks = updatedBlocks.filter((b) => b.id !== blockId);
    if (updatedBlocks.length === 0) {
      updatedBlocks = [
        {
          id: `block-fallback-${Date.now()}`,
          type: "text",
          content: [],
          properties: {}
        }
      ];
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatedDoc = { ...activeDoc, blocks: updatedBlocks, updatedAt: now };
    const newDocuments = documents.map(
      (d) => d.id === activeDoc.id ? updatedDoc : d
    );
    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },
  insertBlockBelow: (blockId, type) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;
    const targetIdx = activeDoc.blocks.findIndex((b) => b.id === blockId);
    if (targetIdx === -1) return;
    const newBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      content: [],
      properties: {}
    };
    const blocksCopy = [...activeDoc.blocks];
    blocksCopy.splice(targetIdx + 1, 0, newBlock);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatedDoc = { ...activeDoc, blocks: blocksCopy, updatedAt: now };
    const newDocuments = documents.map(
      (d) => d.id === activeDoc.id ? updatedDoc : d
    );
    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },
  appendBlockAtEnd: (type) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;
    const newBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      content: [],
      properties: {}
    };
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatedDoc = {
      ...activeDoc,
      blocks: [...activeDoc.blocks, newBlock],
      updatedAt: now
    };
    const newDocuments = documents.map(
      (d) => d.id === activeDoc.id ? updatedDoc : d
    );
    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },
  // ================================================================
  // duplicate block — insert a copy of the block right below itself
  // ================================================================
  duplicateBlock: (blockId) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;
    const idx = activeDoc.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    const original = activeDoc.blocks[idx];
    const copy = {
      ...original,
      id: `block-${Date.now()}`,
      properties: { ...original.properties }
    };
    const newBlocks = [...activeDoc.blocks];
    newBlocks.splice(idx + 1, 0, copy);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatedDoc = { ...activeDoc, blocks: newBlocks, updatedAt: now };
    const newDocuments = documents.map(
      (d) => d.id === activeDoc.id ? updatedDoc : d
    );
    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },
  // ================================================================
  // batch replace — used by TipTap editor to sync all blocks at once
  // ================================================================
  setActiveDocBlocks: (blocks, docId) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;
    if (docId && docId !== activeDoc.id) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatedDoc = { ...activeDoc, blocks, updatedAt: now };
    const newDocuments = documents.map(
      (d) => d.id === activeDoc.id ? updatedDoc : d
    );
    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },
  // ================================================================
  // flush blocks to a specific (possibly non-active) document
  //
  // Used when switching documents: the outgoing document's pending edits
  // must be saved against ITS id, even though `activeDoc` has already moved
  // to the incoming document. Updates the `documents` array entry (and
  // `activeDoc` too if it happens to still match) and schedules a save.
  // ================================================================
  flushBlocksToDoc: (docId, blocks) => {
    const { documents, activeDoc } = get();
    const target = documents.find((d) => d.id === docId);
    if (!target) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatedDoc = { ...target, blocks, updatedAt: now };
    const newDocuments = documents.map((d) => d.id === docId ? updatedDoc : d);
    set({
      documents: newDocuments,
      ...activeDoc?.id === docId ? { activeDoc: updatedDoc } : {}
    });
    scheduleDocumentSave(updatedDoc);
  },
  // ================================================================
  // image paste — save to document's own assets folder
  // ================================================================
  saveImageToDoc: async (blob, afterBlockId) => {
    const { activeDocId, activeDoc, documents } = get();
    if (!activeDocId || !activeDoc) return null;
    const ext = blob.type.split("/")[1] || "png";
    const fileName = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));
    await ipc.saveDocAsset(activeDocId, fileName, bytes);
    const assetPath = `assets/${fileName}`;
    const newBlock = {
      id: `block-${Date.now()}`,
      type: "image",
      content: assetPath,
      properties: {
        imageType: "asset",
        caption: ""
      }
    };
    let updatedBlocks;
    if (afterBlockId) {
      const idx = activeDoc.blocks.findIndex((b) => b.id === afterBlockId);
      updatedBlocks = [...activeDoc.blocks];
      updatedBlocks.splice(idx + 1, 0, newBlock);
    } else {
      updatedBlocks = [...activeDoc.blocks, newBlock];
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatedDoc = { ...activeDoc, blocks: updatedBlocks, updatedAt: now };
    const newDocuments = documents.map(
      (d) => d.id === activeDoc.id ? updatedDoc : d
    );
    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
    return newBlock.id;
  }
});
export {
  createEditorSlice
};
