import type { Block, BlockType, RichText } from '../types';
import { ipc } from '../lib/core/ipc';
import { scheduleDocumentSave } from './storeHelpers';
import type { SliceCreator } from './storeHelpers';

/** Editor slice — block operations and asset insertion. */
/** Methods provided by the editor slice (no own state). */
export interface EditorSlice {
  updateBlock: (blockId: string, fields: Partial<Block>) => void;
  deleteBlock: (blockId: string, mergeContent?: RichText[]) => void;
  insertBlockBelow: (blockId: string, type: BlockType) => void;
  appendBlockAtEnd: (type: BlockType) => void;
  duplicateBlock: (blockId: string) => void;
  setActiveDocBlocks: (blocks: Block[], docId?: string) => void;
  flushBlocksToDoc: (docId: string, blocks: Block[]) => void;
  saveImageToDoc: (blob: Blob, afterBlockId?: string) => Promise<string | null>;
}

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
  setActiveDocBlocks: (blocks: Block[], docId?: string) => {
    const { activeDoc, documents } = get();
    if (!activeDoc) return;

    // Ownership guard: these blocks were serialized from the editor for a
    // specific document. If the active document changed since (the user
    // switched docs within the debounce/idle window), applying them now would
    // write one document's edits into another. Drop them in that case.
    if (docId && docId !== activeDoc.id) return;

    const now = new Date().toISOString();
    const updatedDoc = { ...activeDoc, blocks, updatedAt: now };
    const newDocuments = documents.map((d) =>
      d.id === activeDoc.id ? updatedDoc : d,
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
  flushBlocksToDoc: (docId: string, blocks: Block[]) => {
    const { documents, activeDoc } = get();
    const target = documents.find((d) => d.id === docId);
    if (!target) return;

    const now = new Date().toISOString();
    const updatedDoc = { ...target, blocks, updatedAt: now };
    const newDocuments = documents.map((d) => (d.id === docId ? updatedDoc : d));

    set({
      documents: newDocuments,
      ...(activeDoc?.id === docId ? { activeDoc: updatedDoc } : {}),
    });
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
    await ipc.saveDocAsset(activeDocId, fileName, bytes);

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
