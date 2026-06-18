import { storage, toMeta, DocumentMeta, type ThemeMode, type Language } from '../lib/storage';
import { migrateFromLocalStorage } from '../lib/migrate';
import { resolveDark, applyFont } from './uiSlice';
import { DEFAULT_LATIN_FONT_ID, DEFAULT_CJK_FONT_ID, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../lib/fonts';
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
      let themeMode: ThemeMode = 'dark';
      let fontId = DEFAULT_LATIN_FONT_ID;
      let cjkFontId = DEFAULT_CJK_FONT_ID;
      let fontSize = DEFAULT_FONT_SIZE;
      let sidebarWidth: number | undefined;
      let language: Language = 'zh';
      let activityBarBorder = false;
      try {
        const settings = await storage.loadSettings();
        if (settings.theme === 'light' || settings.theme === 'system') {
          themeMode = settings.theme;
        }
        if (typeof settings.fontId === 'string' && settings.fontId) {
          fontId = settings.fontId;
        }
        if (typeof settings.cjkFontId === 'string' && settings.cjkFontId) {
          cjkFontId = settings.cjkFontId;
        }
        if (typeof settings.fontSize === 'number') {
          fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, settings.fontSize));
        }
        if (typeof settings.sidebarWidth === 'number') {
          sidebarWidth = settings.sidebarWidth;
        }
        if (settings.language === 'en' || settings.language === 'zh') {
          language = settings.language;
        }
        if (typeof settings.activityBarBorder === 'boolean') {
          activityBarBorder = settings.activityBarBorder;
        }
      } catch {
        // ignore
      }
      const isDark = resolveDark(themeMode);
      if (isDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      applyFont(fontId, cjkFontId, fontSize);

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
        themeMode,
        isDarkMode: isDark,
        language,
        activityBarBorder,
        fontId,
        cjkFontId,
        fontSize,
        ...(sidebarWidth !== undefined ? { sidebarWidth } : {}),
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
      title: '',
      emoji: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blocks: [
        {
          id: `block-${Date.now()}-initial`,
          type: 'text',
          content: [],
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
      stateUpdate.activeDocId = nextDoc?.id ?? '';
    }

    set(stateUpdate as StoreState);

    // Now persist to disk — failures are logged but don't crash the app.
    try {
      await storage.deleteDocument(id);
    } catch (e) {
      console.error('Failed to delete document from disk:', e);
    }

    try {
      await storage.saveIndex(newDocList);
    } catch (e) {
      console.error('Failed to save index after delete:', e);
    }
  },

  openDocument: async (id) => {
    const { documents, activeDocId } = get();
    if (id === activeDocId) return;
    const doc = documents.find((d) => d.id === id);
    if (doc) {
      // CRITICAL: Move focus to <body> and clear selection before switching.
      // React will remove all old block DOM nodes (commitDeletionEffects).
      // If the browser's Selection still references one of those nodes,
      // WebKit throws "NotFoundError: The object can not be found here."
      try {
        const editor = document.querySelector('.ProseMirror') as HTMLElement | null;
        if (editor && (document.activeElement === editor || editor.contains(document.activeElement))) {
          (document.body as HTMLElement).focus();
        }
        window.getSelection()?.removeAllRanges();
      } catch { /* ignore */ }
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

  renameDocument: (id, title) => {
    const { documents, docList } = get();
    const now = new Date().toISOString();

    const newDocuments = documents.map((doc) =>
      doc.id === id ? { ...doc, title, updatedAt: now } : doc,
    );
    const updatedDoc = newDocuments.find((d) => d.id === id) ?? null;
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
