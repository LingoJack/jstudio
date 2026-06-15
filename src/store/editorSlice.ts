import type { Block, BlockType, RichText } from '../types';
import { storage } from '../lib/storage';
import { scheduleDocumentSave } from './storeHelpers';
import type { SliceCreator } from './storeHelpers';

/** Editor slice — block operations and asset insertion. */
export const createEditorSlice: SliceCreator = (set, get) => ({
  // ================================================================
  // block operations — all operate on activeDoc
  // ================================================================
  updateBlock: (blockId, fields) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;

    const now = new Date().toISOString();
    const updatedBlocks = activeDoc.blocks.map((b) =>
      b.id === blockId ? { ...b, ...fields } : b,
    );
    const updatedDoc = { ...activeDoc, blocks: updatedBlocks, updatedAt: now };

    const newDocuments = documents.map((d) =>
      d.id === activeDoc.id ? updatedDoc : d,
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

    if (targetIdx > 0 && mergeContent !== undefined) {
      const prevBlock = updatedBlocks[targetIdx - 1];
      // Merge RichText[] arrays: append the deleted block's content
      // to the previous block.
      const prevContent = Array.isArray(prevBlock.content)
        ? prevBlock.content
        : [];
      const toMerge = Array.isArray(mergeContent) ? mergeContent : [];
      updatedBlocks[targetIdx - 1] = {
        ...prevBlock,
        content: [...prevContent, ...toMerge],
      };
    }

    updatedBlocks = updatedBlocks.filter((b) => b.id !== blockId);

    // Keep at least one empty block
    if (updatedBlocks.length === 0) {
      updatedBlocks = [
        {
          id: `block-fallback-${Date.now()}`,
          type: 'text',
          content: [] as RichText[],
          properties: {},
        },
      ];
    }

    const now = new Date().toISOString();
    const updatedDoc = { ...activeDoc, blocks: updatedBlocks, updatedAt: now };
    const newDocuments = documents.map((d) =>
      d.id === activeDoc.id ? updatedDoc : d,
    );

    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },

  insertBlockBelow: (blockId, type) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;

    const targetIdx = activeDoc.blocks.findIndex((b) => b.id === blockId);
    if (targetIdx === -1) return;

    const newBlock: Block = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      content: [] as RichText[],
      properties: {},
    };

    const blocksCopy = [...activeDoc.blocks];
    blocksCopy.splice(targetIdx + 1, 0, newBlock);

    const now = new Date().toISOString();
    const updatedDoc = { ...activeDoc, blocks: blocksCopy, updatedAt: now };
    const newDocuments = documents.map((d) =>
      d.id === activeDoc.id ? updatedDoc : d,
    );

    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },

  appendBlockAtEnd: (type) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;

    const newBlock: Block = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      content: [] as RichText[],
      properties: {},
    };

    const now = new Date().toISOString();
    const updatedDoc = {
      ...activeDoc,
      blocks: [...activeDoc.blocks, newBlock],
      updatedAt: now,
    };
    const newDocuments = documents.map((d) =>
      d.id === activeDoc.id ? updatedDoc : d,
    );

    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },

  // ================================================================
  // duplicate block — insert a copy of the block right below itself
  // ================================================================
  duplicateBlock: (blockId: string) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;

    const idx = activeDoc.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;

    const original = activeDoc.blocks[idx];
    const copy: Block = {
      ...original,
      id: `block-${Date.now()}`,
      properties: { ...original.properties },
    };

    const newBlocks = [...activeDoc.blocks];
    newBlocks.splice(idx + 1, 0, copy);

    const now = new Date().toISOString();
    const updatedDoc = { ...activeDoc, blocks: newBlocks, updatedAt: now };
    const newDocuments = documents.map((d) =>
      d.id === activeDoc.id ? updatedDoc : d,
    );

    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },

  // ================================================================
  // batch replace — used by TipTap editor to sync all blocks at once
  // ================================================================
  setActiveDocBlocks: (blocks: Block[]) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;

    const now = new Date().toISOString();
    const updatedDoc = { ...activeDoc, blocks, updatedAt: now };
    const newDocuments = documents.map((d) =>
      d.id === activeDoc.id ? updatedDoc : d,
    );

    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);
  },

  // ================================================================
  // image paste — save to document's own assets folder
  // ================================================================
  saveImageToDoc: async (blob: Blob, afterBlockId?: string) => {
    const { activeDocId, activeDoc, documents } = get();
    if (!activeDocId || !activeDoc) return null;

    // Generate a unique filename
    const ext = blob.type.split('/')[1] || 'png';
    const fileName = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

    // Convert blob to byte array
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));

    // Save to document's assets folder
    await storage.saveDocAsset(activeDocId, fileName, bytes);

    const assetPath = `assets/${fileName}`;

    const newBlock: Block = {
      id: `block-${Date.now()}`,
      type: 'image',
      content: assetPath,
      properties: {
        imageType: 'asset' as const,
        caption: '',
      },
    };

    let updatedBlocks: Block[];
    if (afterBlockId) {
      const idx = activeDoc.blocks.findIndex((b) => b.id === afterBlockId);
      updatedBlocks = [...activeDoc.blocks];
      updatedBlocks.splice(idx + 1, 0, newBlock);
    } else {
      updatedBlocks = [...activeDoc.blocks, newBlock];
    }

    const now = new Date().toISOString();
    const updatedDoc = { ...activeDoc, blocks: updatedBlocks, updatedAt: now };
    const newDocuments = documents.map((d) =>
      d.id === activeDoc.id ? updatedDoc : d,
    );

    set({ activeDoc: updatedDoc, documents: newDocuments });
    scheduleDocumentSave(updatedDoc);

    return newBlock.id;
  },
});
