import { storage, toMeta, DocumentMeta, type FolderMeta, type ThemeMode, type Language, type TerminalCursorStyle, type EditorCursorStyle, type ActivityBarItemConfig, DEFAULT_ACTIVITY_BAR_ITEMS } from '../lib/storage';
import { migrateFromLocalStorage } from '../lib/migrate';
import { resolveDark, applyFont, applyLineHeight } from './uiSlice';
import { DEFAULT_LATIN_FONT_ID, DEFAULT_CJK_FONT_ID, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT, DEFAULT_LINE_HEIGHT } from '../lib/fonts';
import type { Document } from '../types';
import { scheduleDocumentSave, scheduleIndexSave } from './storeHelpers';
import type { StoreState, SliceCreator } from './storeHelpers';
import { markdownToBlocks } from '../lib/markdownImport';
import { migrateDocAssets } from '../lib/migrateAssets';
import type { GlobalShortcutConfig } from '../lib/globalShortcuts';

/** Documents slice — document CRUD and initialization. */
export const createDocumentsSlice: SliceCreator = (set, get) => ({
  docList: [],
  activeDoc: null,
  activeDocId: '',
  documents: [],
  studioRoot: '',

  // ================================================================
  // init
  // ================================================================
  init: async () => {
    try {
      const studioRoot = await storage.init();
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
      let editorLineHeight = DEFAULT_LINE_HEIGHT;
      let sidebarWidth: number | undefined;
      let language: Language = 'zh';
      let activityBarBorder = false;
      let activityBarItems: ActivityBarItemConfig[] = DEFAULT_ACTIVITY_BAR_ITEMS;
      let terminalThemeIdDark: string | undefined;
      let terminalThemeIdLight: string | undefined;
      let terminalThemeIdLegacy: string | undefined;
      let terminalFontSize: number | undefined;
      let terminalFontId: string | undefined;
      let terminalCursorStyle: TerminalCursorStyle | undefined;
      let editorCursorStyle: EditorCursorStyle | undefined;
      let terminalTemplatesRaw: unknown;
      let terminalRecentDirsRaw: unknown;
      let keyboardShortcuts: Record<string, string> | undefined;
      let globalShortcuts: GlobalShortcutConfig[] | undefined;
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
        if (typeof settings.editorLineHeight === 'number') {
          editorLineHeight = Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, settings.editorLineHeight));
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
        if (Array.isArray(settings.activityBarItems)) {
          // Merge with defaults so new items appear automatically
          const knownIds = new Set(DEFAULT_ACTIVITY_BAR_ITEMS.map((d) => d.id));
          const valid = settings.activityBarItems.filter(
            (item) => item && knownIds.has(item.id) && typeof item.visible === 'boolean',
          );
          // Append any default items missing from saved config
          const savedIds = new Set(valid.map((v) => v.id));
          for (const def of DEFAULT_ACTIVITY_BAR_ITEMS) {
            if (!savedIds.has(def.id)) valid.push({ ...def });
          }
          activityBarItems = valid;
        }
        if (typeof settings.terminalThemeIdDark === 'string' && settings.terminalThemeIdDark) {
          terminalThemeIdDark = settings.terminalThemeIdDark;
        }
        if (typeof settings.terminalThemeIdLight === 'string' && settings.terminalThemeIdLight) {
          terminalThemeIdLight = settings.terminalThemeIdLight;
        }
        // One-time migration: old single-theme setting becomes the dark theme.
        if (typeof settings.terminalThemeId === 'string' && settings.terminalThemeId) {
          terminalThemeIdLegacy = settings.terminalThemeId;
        }
        if (typeof settings.terminalFontSize === 'number') {
          terminalFontSize = settings.terminalFontSize;
        }
        if (typeof settings.terminalFontId === 'string' && settings.terminalFontId) {
          terminalFontId = settings.terminalFontId;
        }
        if (
          settings.terminalCursorStyle === 'block' ||
          settings.terminalCursorStyle === 'underline' ||
          settings.terminalCursorStyle === 'bar'
        ) {
          terminalCursorStyle = settings.terminalCursorStyle;
        }
        if (
          settings.editorCursorStyle === 'bar' ||
          settings.editorCursorStyle === 'block' ||
          settings.editorCursorStyle === 'underline'
        ) {
          editorCursorStyle = settings.editorCursorStyle;
        }
        if (settings.terminalTemplates !== undefined) {
          terminalTemplatesRaw = settings.terminalTemplates;
        }
        if (settings.terminalRecentDirs !== undefined) {
          terminalRecentDirsRaw = settings.terminalRecentDirs;
        }
        // Load user-customized keyboard shortcuts
        if (settings.keyboardShortcuts && typeof settings.keyboardShortcuts === 'object') {
          keyboardShortcuts = settings.keyboardShortcuts as Record<string, string>;
        }
        // Load OS-level global shortcuts
        if (Array.isArray(settings.globalShortcuts)) {
          globalShortcuts = settings.globalShortcuts;
        }
      } catch {
        // ignore
      }
      const isDark = resolveDark(themeMode);
      if (isDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      applyFont(fontId, cjkFontId, fontSize);
      applyLineHeight(editorLineHeight);

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
          const migrated = await migrateDocAssets(doc);
          if (migrated) {
            await storage.saveDocument(migrated);
            docs.push(migrated);
          } else {
            docs.push(doc);
          }
        } catch (e) {
          console.error(`Failed to load document ${meta.id}:`, e);
        }
      }

      const firstId = docs.length > 0 ? docs[0].id : '';

      set({
        docList: index,
        documents: docs,
        studioRoot,
        activeDoc: docs[0] ?? null,
        activeDocId: firstId,
        themeMode,
        isDarkMode: isDark,
        language,
        activityBarBorder,
        activityBarItems,
        fontId,
        cjkFontId,
        fontSize,
        editorLineHeight,
        ...(sidebarWidth !== undefined ? { sidebarWidth } : {}),
        ...(terminalThemeIdDark !== undefined
          ? { terminalThemeIdDark }
          : terminalThemeIdLegacy !== undefined
            ? { terminalThemeIdDark: terminalThemeIdLegacy }
            : {}),
        ...(terminalThemeIdLight !== undefined ? { terminalThemeIdLight } : {}),
        ...(terminalFontSize !== undefined ? { terminalFontSize } : {}),
        ...(terminalFontId !== undefined ? { terminalFontId } : {}),
        ...(terminalCursorStyle !== undefined ? { terminalCursorStyle } : {}),
        ...(editorCursorStyle !== undefined ? { editorCursorStyle } : {}),
        ...(keyboardShortcuts !== undefined ? { keyboardShortcuts } : {}),
        ...(globalShortcuts !== undefined ? { globalShortcuts } : {}),
        isLoading: false,
      });

      // Load folder index
      try {
        const folders = await storage.loadFolders();
        get().initFolders(folders);
      } catch {
        // folders.json doesn't exist yet — fine
      }

      // Initialize terminal templates from settings.
      get().initTemplates(terminalTemplatesRaw);
      get().initRecentDirs(terminalRecentDirsRaw);
    } catch (e) {
      console.error('Store init failed:', e);
      set({ isLoading: false });
    }
  },

  // ================================================================
  // document operations
  // ================================================================
  createDocument: async (folderId?: string) => {
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

    const meta = { ...toMeta(newDoc), folderId: folderId ?? null };
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

    // Only patch the active doc's meta — do NOT rebuild from documents,
    // because Document objects don't carry folderId (only DocumentMeta does).
    const newDocList = docList.map((meta) =>
      meta.id === activeDocId ? { ...meta, ...fields, updatedAt: now } : meta,
    );

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

    // Only patch the renamed item's meta — do NOT rebuild from documents,
    // because Document objects don't carry folderId (only DocumentMeta does).
    const newDocList = docList.map((meta) =>
      meta.id === id ? { ...meta, title, updatedAt: now } : meta,
    );

    set({
      documents: newDocuments,
      activeDoc: updatedDoc,
      docList: newDocList,
    });

    if (updatedDoc) scheduleDocumentSave(updatedDoc);
    scheduleIndexSave(newDocList);
  },

  importDocumentFromMarkdown: async (filename, md, folderId) => {
    const blocks = markdownToBlocks(md);

    // Derive document title: prefer first Markdown H1, fall back to filename.
    const h1Match = md.match(/^#\s+(.+)$/m);
    const baseName = filename.replace(/\.(md|markdown|mdown)$/i, '');
    const title = h1Match ? h1Match[1].trim() : baseName;

    const now = new Date().toISOString();
    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title,
      emoji: '',
      createdAt: now,
      updatedAt: now,
      blocks,
    };

    await storage.saveDocument(newDoc);

    const meta = { ...toMeta(newDoc), folderId: folderId ?? null };
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

  /**
   * Import all Markdown files inside a directory, preserving the folder
   * hierarchy.  Sub-directories become folders; `.md` / `.markdown` /
   * `.mdown` files become documents placed in the corresponding folder.
   *
   * @param dirPath absolute path of the directory to import (from the
   *                native directory picker).
   * @returns the number of documents that were imported.
   */
  importMarkdownDirectory: async (dirPath) => {
    const entries = await storage.listMarkdownFiles(dirPath);

    /** relative-path → folder-id lookup (root maps to `null`). */
    const folderMap = new Map<string, string | null>();
    folderMap.set('', null);

    const { folders } = get();
    const newFolders: FolderMeta[] = [];
    const newDocs: Document[] = [];
    const newMetas: DocumentMeta[] = [];
    let folderSeq = 0;
    let docCount = 0;

    for (const entry of entries) {
      if (entry.isDir) continue; // directories are created lazily below

      // Read + decode the Markdown file.
      const bytes = await storage.readFileBytes(entry.path);
      const md = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
      const filename = entry.relativePath.split('/').pop() ?? 'Untitled.md';

      // Ensure every ancestor folder exists.
      const parts = entry.relativePath.split('/');
      // Remove the file name; remaining parts are directory segments.
      const dirParts = parts.slice(0, -1);
      let currentRel = '';
      let parentId: string | null = null;
      for (const seg of dirParts) {
        const childRel = currentRel ? `${currentRel}/${seg}` : seg;
        if (folderMap.has(childRel)) {
          parentId = folderMap.get(childRel)!;
        } else {
          const id = `folder-${Date.now()}-${folderSeq++}`;
          newFolders.push({
            id,
            name: seg,
            parentId,
            sortOrder: 0,
            collapsed: false,
          });
          folderMap.set(childRel, id);
          parentId = id;
        }
        currentRel = childRel;
      }

      // Build the document.
      const blocks = markdownToBlocks(md);
      const h1Match = md.match(/^#\s+(.+)$/m);
      const baseName = filename.replace(/\.(md|markdown|mdown)$/i, '');
      const title = h1Match ? h1Match[1].trim() : baseName;
      const now = new Date().toISOString();
      const doc: Document = {
        id: `doc-${Date.now()}-${docCount}`,
        title,
        emoji: '',
        createdAt: now,
        updatedAt: now,
        blocks,
      };
      docCount++;

      await storage.saveDocument(doc);
      newDocs.push(doc);
      newMetas.push({ ...toMeta(doc), folderId: parentId });
    }

    // Batch-persist everything.
    const mergedFolders = newFolders.length > 0 ? [...folders, ...newFolders] : folders;
    const newDocList = [...newMetas, ...get().docList];
    const newDocuments = [...newDocs, ...get().documents];

    await storage.saveFolders(mergedFolders);
    await storage.saveIndex(newDocList);

    set({
      folders: mergedFolders,
      docList: newDocList,
      documents: newDocuments,
      // Open the first imported document, if any.
      ...(newDocs.length > 0
        ? { activeDoc: newDocs[0], activeDocId: newDocs[0].id }
        : {}),
    });

    return docCount;
  },
});
