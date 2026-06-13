import type { Block, BlockType } from '../types';
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
      updatedBlocks[targetIdx - 1] = {
        ...prevBlock,
        content: prevBlock.content + mergeContent,
      };
    }

    updatedBlocks = updatedBlocks.filter((b) => b.id !== blockId);

    // Keep at least one empty block
    if (updatedBlocks.length === 0) {
      updatedBlocks = [
        {
          id: `block-fallback-${Date.now()}`,
          type: 'text',
          content: '',
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
      content: '',
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
      content: '',
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
  // asset insertion
  // ================================================================
  insertAssetAsBlock: (asset) => {
    const { activeDocId, activeDoc, documents } = get();
    if (!activeDocId || !activeDoc) {
      alert('请先选择或创建一个目标文档，然后再置入此本地附件。');
      return;
    }

    let newBlock: Block;
    if (asset.type.startsWith('image/')) {
      newBlock = {
        id: `block-${Date.now()}`,
        type: 'image',
        content: asset.content || '',
        properties: {
          caption: asset.name,
          imageType: asset.content ? 'base64' : 'url',
        },
      };
    } else {
      newBlock = {
        id: `block-${Date.now()}`,
        type: 'attachment',
        content: asset.content || '',
        properties: {
          attachmentName: asset.name,
          attachmentType: asset.type,
          attachmentSize: asset.size,
          attachmentMode: 'card' as const,
        },
      };
    }

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
});
