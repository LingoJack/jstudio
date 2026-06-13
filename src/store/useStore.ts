import { create } from 'zustand';
import { storage, toMeta, DocumentMeta } from '../lib/storage';
import { migrateFromLocalStorage } from '../lib/migrate';
import type { Document, Block, BlockType } from '../types';
import { DEFAULT_DOCUMENTS } from '../data/defaultData';

// ---- debounce helper ----

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let indexTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleDocumentSave(doc: Document) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    storage.saveDocument(doc).catch(console.error);
  }, 500);
}

function scheduleIndexSave(metas: DocumentMeta[]) {
  if (indexTimer) clearTimeout(indexTimer);
  indexTimer = setTimeout(() => {
    storage.saveIndex(metas).catch(console.error);
  }, 500);
}

// ---- store types ----

interface StoreState {
  // — data —
  docList: DocumentMeta[]; // lightweight list for sidebar
  activeDoc: Document | null; // full doc currently open
  activeDocId: string;

  // we keep full copies of all documents in memory for backlink computation.
  // This is fine because documents are loaded once at init and kept in sync.
  documents: Document[];

  // — ui state —
  isDarkMode: boolean;
  isSidebarOpen: boolean;
  isOutlineOpen: boolean;
  isFolderOpen: boolean;
  isLoading: boolean;

  // — init —
  init: () => Promise<void>;

  // — document ops —
  createDocument: () => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  updateDocumentMeta: (fields: Partial<Document>) => void;

  // — block ops —
  updateBlock: (blockId: string, fields: Partial<Block>) => void;
  deleteBlock: (blockId: string, mergeContent?: string) => void;
  insertBlockBelow: (blockId: string, type: BlockType) => void;
  appendBlockAtEnd: (type: BlockType) => void;

  // — asset insertion —
  insertAssetAsBlock: (asset: {
    name: string;
    type: string;
    size: string;
    content: string;
  }) => void;

  // — ui toggles —
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  toggleFolder: () => void;
  setFolderOpen: (open: boolean) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  docList: [],
  activeDoc: null,
  activeDocId: '',
  documents: [],
  isDarkMode: true,
  isSidebarOpen: true,
  isOutlineOpen: true,
  isFolderOpen: false,
  isLoading: true,

  // ================================================================
  // init
  // ================================================================
  init: async () => {
    try {
      await storage.init();
      await migrateFromLocalStorage();

      // Load settings
      let theme: 'dark' | 'light' = 'dark';
      try {
        const settings = await storage.loadSettings();
        if (settings.theme === 'light') theme = 'light';
      } catch {
        // ignore
      }
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // Load index
      let index: DocumentMeta[] = [];
      try {
        index = await storage.loadIndex();
      } catch {
        // index.json doesn't exist yet
      }

      // If still empty, seed defaults
      if (!index || index.length === 0) {
        for (const doc of DEFAULT_DOCUMENTS) {
          await storage.saveDocument(doc);
        }
        const metas = DEFAULT_DOCUMENTS.map(toMeta);
        await storage.saveIndex(metas);
        index = metas;
      }

      // Load all documents into memory (needed for backlinks).
      // In the future this could be lazy, but for typical usage (< 100 docs)
      // loading everything is instant.
      const docs: Document[] = [];
      for (const meta of index) {
        try {
          const doc = await storage.loadDocument(meta.id);
          docs.push(doc);
        } catch (e) {
          console.error(`Failed to load document ${meta.id}:`, e);
        }
      }

      const firstId = docs.length > 0 ? docs[0].id : '';

      set({
        docList: index,
        documents: docs,
        activeDoc: docs[0] ?? null,
        activeDocId: firstId,
        isDarkMode: theme === 'dark',
        isLoading: false,
      });
    } catch (e) {
      console.error('Store init failed:', e);
      set({ isLoading: false });
    }
  },

  // ================================================================
  // document operations
  // ================================================================
  createDocument: async () => {
    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title: '未命名文档',
      emoji: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blocks: [
        {
          id: `block-${Date.now()}-initial`,
          type: 'text',
          content: '欢迎来到新页面！输入 [[ 可引用其它文档名称，输入 / 快速唤出交互块。',
          properties: {},
        },
      ],
    };

    await storage.saveDocument(newDoc);

    const meta = toMeta(newDoc);
    const newDocList = [meta, ...get().docList];
    const newDocuments = [newDoc, ...get().documents];

    await storage.saveIndex(newDocList);

    set({
      docList: newDocList,
      documents: newDocuments,
      activeDoc: newDoc,
      activeDocId: newDoc.id,
    });
  },

  deleteDocument: async (id) => {
    const { documents, docList, activeDocId } = get();
    if (documents.length <= 1) {
      alert('抱歉，本地库中至少需要保留一篇文档，无法继续删除该项目。');
      return;
    }

    await storage.deleteDocument(id);

    const newDocuments = documents.filter((d) => d.id !== id);
    const newDocList = docList.filter((d) => d.id !== id);
    await storage.saveIndex(newDocList);

    const stateUpdate: Partial<StoreState> = {
      documents: newDocuments,
      docList: newDocList,
    };

    if (activeDocId === id) {
      const nextDoc = newDocuments[0];
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? '';
    }

    set(stateUpdate as StoreState);
  },

  toggleFavorite: async (id) => {
    const { documents, docList } = get();
    const newDocuments = documents.map((doc) =>
      doc.id === id ? { ...doc, isFavorite: !doc.isFavorite } : doc,
    );
    const newDocList = newDocuments.map(toMeta);

    set({ documents: newDocuments, docList: newDocList });

    scheduleIndexSave(newDocList);
    // Also save the toggled document
    const toggled = newDocuments.find((d) => d.id === id);
    if (toggled) scheduleDocumentSave(toggled);
  },

  openDocument: async (id) => {
    const { documents } = get();
    const doc = documents.find((d) => d.id === id);
    if (doc) {
      set({ activeDoc: doc, activeDocId: id });
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
    const newDocList = newDocuments.map(toMeta);

    set({
      documents: newDocuments,
      activeDoc: updatedDoc,
      docList: newDocList,
    });

    if (updatedDoc) scheduleDocumentSave(updatedDoc);
    scheduleIndexSave(newDocList);
  },

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

  // ================================================================
  // ui toggles
  // ================================================================
  toggleDarkMode: () => {
    const next = !get().isDarkMode;
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ isDarkMode: next });
    storage.saveSettings({ theme: next ? 'dark' : 'light' }).catch(console.error);
  },

  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleOutline: () => set((s) => ({ isOutlineOpen: !s.isOutlineOpen })),
  toggleFolder: () => set((s) => ({ isFolderOpen: !s.isFolderOpen })),
  setFolderOpen: (open) => set({ isFolderOpen: open }),
}));
