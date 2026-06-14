import { storage, toMeta, DocumentMeta } from '../lib/storage';
import { migrateFromLocalStorage } from '../lib/migrate';
import type { Document } from '../types';
import { scheduleDocumentSave, scheduleIndexSave } from './storeHelpers';
import type { StoreState, SliceCreator } from './storeHelpers';

/** Documents slice — document CRUD and initialization. */
export const createDocumentsSlice: SliceCreator = (set, get) => ({
  docList: [],
  activeDoc: null,
  activeDocId: '',
  documents: [],

  // ================================================================
  // init
  // ================================================================
  init: async () => {
    try {
      await storage.init();
      await migrateFromLocalStorage();

      // One-time cleanup: remove the legacy global assets directory.
      try {
        await storage.cleanGlobalAssets();
      } catch {
        // ignore — best-effort cleanup
      }

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

      // Clean up legacy preset documents from earlier versions.
      // These IDs were hardcoded in the old defaultData.ts and should
      // no longer appear for users who want a clean start.
      const LEGACY_PRESET_IDS = [
        'doc-welcome',
        'doc-shortcuts',
        'doc-canvas-lab',
      ];
      if (index.length > 0) {
        const filtered = index.filter(
          (m) => !LEGACY_PRESET_IDS.includes(m.id),
        );
        if (filtered.length !== index.length) {
          // Delete the old document files and rebuild the index
          for (const old of index) {
            if (LEGACY_PRESET_IDS.includes(old.id)) {
              try {
                await storage.deleteDocument(old.id);
              } catch {
                // best-effort cleanup
              }
            }
          }
          index = filtered;
          await storage.saveIndex(index);
        }
      }

      // Load index as-is — no preset documents, no auto-creation.
      // If the user has zero documents, the UI shows an empty state.

      // Load all documents into memory.
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
          content: '',
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

    // Physically delete the document folder + files from disk
    await storage.deleteDocument(id);

    const newDocuments = documents.filter((d) => d.id !== id);
    const newDocList = docList.filter((d) => d.id !== id);

    // Update index on disk (may become empty array [])
    if (newDocList.length > 0) {
      await storage.saveIndex(newDocList);
    } else {
      await storage.saveIndex([]);
    }

    const stateUpdate: Partial<StoreState> = {
      documents: newDocuments,
      docList: newDocList,
    };

    if (activeDocId === id) {
      const nextDoc = newDocuments[0] ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? '';
    }

    set(stateUpdate as StoreState);
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
});
