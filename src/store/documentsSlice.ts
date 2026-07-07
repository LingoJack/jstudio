import { storage, toMeta, DocumentMeta, type FolderMeta, type ThemeMode, type Language, type TerminalCursorStyle, type EditorCursorStyle, type ActivityBarItemConfig, DEFAULT_ACTIVITY_BAR_ITEMS } from '../lib/core/storage';
import { migrateFromLocalStorage } from '../lib/documents/migrate';
import { resolveDark, applyFont, applyLineHeight } from './uiSlice';
import { DEFAULT_LATIN_FONT_ID, DEFAULT_CJK_FONT_ID, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT, DEFAULT_LINE_HEIGHT } from '../lib/editor/fonts';
import type { Document } from '../types';
import { scheduleDocumentSave, scheduleIndexSave } from './storeHelpers';
import type { StoreState, SliceCreator } from './storeHelpers';
import { markdownToBlocks } from '../lib/editor/markdownImport';
import { migrateDocAssets } from '../lib/documents/migrateAssets';
import { gcDocumentAssets } from '../lib/documents/assetGc';
import { toast } from '../lib/toast';
import type { GlobalShortcutConfig } from '../lib/shortcuts/globalShortcuts';
import { applyAppTheme, getAppTheme, DEFAULT_APP_THEME_ID_DARK, DEFAULT_APP_THEME_ID_LIGHT } from '../lib/themes';

/** Documents slice — document CRUD and initialization. */
export const createDocumentsSlice: SliceCreator = (set, get) => ({
  docList: [],
  trashedDocList: [],
  trashedAssets: [],
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
      let appThemeIdDark: string | undefined;
      let appThemeIdLight: string | undefined;
      let terminalFontSize: number | undefined;
      let terminalFontId: string | undefined;
      let terminalCursorStyle: TerminalCursorStyle | undefined;
      let editorCursorStyle: EditorCursorStyle | undefined;
  let useSectionedEditor = false;
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
        if (typeof settings.appThemeIdDark === 'string' && settings.appThemeIdDark) {
          appThemeIdDark = settings.appThemeIdDark;
        }
        if (typeof settings.appThemeIdLight === 'string' && settings.appThemeIdLight) {
          appThemeIdLight = settings.appThemeIdLight;
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
        if (typeof settings.useSectionedEditor === 'boolean') {
          useSectionedEditor = settings.useSectionedEditor;
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
      // Apply app theme (inject CSS variables) before setting .dark class
      const appThemeId = isDark
        ? (appThemeIdDark ?? DEFAULT_APP_THEME_ID_DARK)
        : (appThemeIdLight ?? DEFAULT_APP_THEME_ID_LIGHT);
      const appTheme = getAppTheme(appThemeId, isDark);
      applyAppTheme(appTheme);
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
      // These IDs were injected by early builds of the app and should
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
          toast.error(`加载文档失败: ${meta.title}`);
        }
      }

      const firstId = docs.length > 0 ? docs[0].id : '';

      // Separate active documents from trashed ones for the sidebar lists.
      const activeDocList = index.filter((m) => !m.trashedAt);
      const trashedDocList = index.filter((m) => m.trashedAt);

      set({
        docList: activeDocList,
        trashedDocList,
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
        ...(appThemeIdDark !== undefined ? { appThemeIdDark } : {}),
        ...(appThemeIdLight !== undefined ? { appThemeIdLight } : {}),
        ...(terminalFontSize !== undefined ? { terminalFontSize } : {}),
        ...(terminalFontId !== undefined ? { terminalFontId } : {}),
        ...(terminalCursorStyle !== undefined ? { terminalCursorStyle } : {}),
        ...(editorCursorStyle !== undefined ? { editorCursorStyle } : {}),
        ...(useSectionedEditor ? { useSectionedEditor } : {}),
        ...(keyboardShortcuts !== undefined ? { keyboardShortcuts } : {}),
        ...(globalShortcuts !== undefined ? { globalShortcuts } : {}),
        isLoading: false,
      });

      // Open a workspace tab for the first document (if any).
      // This ensures DocumentTabs shows the active document on startup.
      if (firstId) {
        get().openDocumentTab(firstId);
      }

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

      // Load the asset recycle bin so the trash dialog reflects existing
      // entries, then run a background GC pass over every loaded document.
      // App startup has no live editor undo history, so moving orphaned asset
      // files into the recycle bin here can never break an in-session undo.
      void get().loadTrashedAssets();
      void (async () => {
        for (const d of docs) {
          await get().gcDocAssets(d);
        }
      })();
    } catch (e) {
      console.error('Store init failed:', e);
      toast.error('应用初始化失败');
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

    // Open a workspace tab for the new document + switch to documents view.
    get().openDocumentTab(newDoc.id);
    set({ activeSidebarView: 'documents' });
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

    // Remove the workspace tab for this document (if any).
    get().removeDocumentTabByDocId(id);

    // Now persist to disk — failures are logged but don't crash the app.
    try {
      await storage.deleteDocument(id);
    } catch (e) {
      console.error('Failed to delete document from disk:', e);
      toast.error('删除文档失败');
    }

    try {
      await storage.saveIndex(newDocList);
    } catch (e) {
      console.error('Failed to save index after delete:', e);
      toast.error('索引保存失败');
    }
  },

  deleteDocuments: async (ids) => {
    const { documents, docList, activeDocId } = get();
    const idSet = new Set(ids);
    if (idSet.size === 0) return;

    // Update in-memory state FIRST so the UI reacts immediately.
    const newDocuments = documents.filter((d) => !idSet.has(d.id));
    const newDocList = docList.filter((d) => !idSet.has(d.id));

    const stateUpdate: Partial<StoreState> = {
      documents: newDocuments,
      docList: newDocList,
    };

    if (activeDocId && idSet.has(activeDocId)) {
      const nextDoc = newDocuments[0] ?? null;
      stateUpdate.activeDoc = nextDoc;
      stateUpdate.activeDocId = nextDoc?.id ?? '';
    }

    set(stateUpdate as StoreState);

    // Remove workspace tabs for all deleted documents.
    ids.forEach((id) => get().removeDocumentTabByDocId(id));

    // Persist: delete document files from disk (best-effort, parallel)
    await Promise.allSettled(
      ids.map((id) => storage.deleteDocument(id)),
    );

    try {
      await storage.saveIndex(newDocList);
    } catch (e) {
      console.error('Failed to save index after batch delete:', e);
      toast.error('索引保存失败');
    }
  },

  // ================================================================
  // trash / restore (soft delete)
  // ================================================================
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
      stateUpdate.activeDocId = nextDoc?.id ?? '';
    }

    set(stateUpdate as StoreState);

    // Remove the workspace tab for this document (if any).
    get().removeDocumentTabByDocId(id);

    try {
      await storage.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error('Failed to save index after trash:', e);
      toast.error('移入废纸篓失败');
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
      stateUpdate.activeDocId = nextDoc?.id ?? '';
    }

    set(stateUpdate as StoreState);

    // Remove workspace tabs for all trashed documents.
    ids.forEach((id) => get().removeDocumentTabByDocId(id));

    try {
      await storage.saveIndex([...newDocList, ...newTrashed]);
    } catch (e) {
      console.error('Failed to save index after batch trash:', e);
      toast.error('移入废纸篓失败');
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
      console.error('Failed to save index after restore:', e);
      toast.error('恢复文档失败');
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
      console.error('Failed to save index after batch restore:', e);
      toast.error('恢复文档失败');
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
      trashedIds.filter((_, i) => results[i].status === 'fulfilled'),
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
      console.error('Failed to save index after empty trash:', e);
      toast.error('清空废纸篓失败');
    }

    if (failedCount > 0) {
      toast.error(`${failedCount} 个文档删除失败`);
    }
  },

  // ================================================================
  // asset recycle bin
  // ================================================================
  loadTrashedAssets: async () => {
    try {
      const list = await storage.listTrashedAssets();
      set({ trashedAssets: list });
    } catch (e) {
      console.error('Failed to load trashed assets:', e);
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
      await storage.restoreTrashedAsset(id);
      set({ trashedAssets: get().trashedAssets.filter((a) => a.id !== id) });
    } catch (e) {
      console.error('Failed to restore trashed asset:', e);
      toast.error('恢复附件失败');
    }
  },

  deleteTrashedAsset: async (id) => {
    try {
      await storage.deleteTrashedAsset(id);
      set({ trashedAssets: get().trashedAssets.filter((a) => a.id !== id) });
    } catch (e) {
      console.error('Failed to delete trashed asset:', e);
      toast.error('删除附件失败');
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
        .filter((_, i) => results[i].status === 'fulfilled')
        .map((a) => a.id),
    );
    set({
      trashedAssets: get().trashedAssets.filter((a) => !deletedIds.has(a.id)),
    });
  },

  openDocument: async (id) => {
    const { documents, activeDocId } = get();
    if (id === activeDocId) return;
    const doc = documents.find((d) => d.id === id);
    if (doc) {
      // Snapshot the document we're leaving so we can GC its assets below.
      const prevDoc = get().activeDoc;
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

      // GC the document we just navigated away from. Its editor instance is
      // being torn down, so its undo history is no longer reachable — moving
      // any now-orphaned assets into the recycle bin is safe here.
      if (prevDoc && prevDoc.id !== id) {
        void get().gcDocAssets(prevDoc);
      }
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

    // Open a workspace tab for the imported document.
    get().openDocumentTab(newDoc.id);
    set({ activeSidebarView: 'documents' });
  },

  /**
   * Import all Markdown files inside a directory, preserving the folder
   * hierarchy.  Sub-directories become folders; `.md` / `.markdown` /
   * `.mdown` files become documents placed in the corresponding folder.
   *
   * When `targetFolderId` is provided, the entire tree is imported *inside*
   * that existing folder (used by the folder context-menu "Import Directory").
   *
   * @param dirPath         absolute path of the directory to import.
   * @param targetFolderId  optional parent folder to import into.
   * @returns the number of documents that were imported.
   */
  importMarkdownDirectory: async (dirPath, targetFolderId) => {
    const entries = await storage.listMarkdownFiles(dirPath);

    // Extract the directory name (e.g. "/path/to/MyNotes" → "MyNotes")
    const dirName = dirPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'Imported';

    const { folders } = get();
    const newFolders: FolderMeta[] = [];
    const newDocs: Document[] = [];
    const newMetas: DocumentMeta[] = [];
    let folderSeq = 0;
    let docCount = 0;

    // Create a top-level folder mirroring the imported directory name,
    // so the directory itself (not just its contents) appears in the sidebar.
    const rootFolderId = `folder-${Date.now()}-${folderSeq++}`;
    newFolders.push({
      id: rootFolderId,
      name: dirName,
      parentId: targetFolderId ?? null,
      sortOrder: 0,
      collapsed: false,
    });

    /** relative-path → folder-id lookup. Root maps to the new top-level folder. */
    const folderMap = new Map<string, string | null>();
    folderMap.set('', rootFolderId);

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
      let parentId: string | null = rootFolderId;
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

  // ================================================================
  // lossless backup bundles (.jnote)
  // ================================================================

  /**
   * Export a document to a lossless `.jnote` ZIP archive.
   *
   * Prompts the user for a destination via the native save dialog, then
   * delegates the actual packaging (document.json + assets/ + manifest) to
   * the Rust backend. Returns `true` if a file was written, `false` if the
   * user cancelled the dialog.
   */
  exportDocumentBundle: async (docId) => {
    const doc =
      get().documents.find((d) => d.id === docId) ??
      get().docList.find((m) => m.id === docId);
    const baseName = (doc?.title || 'Untitled').replace(/[/\\:*?"<>|]/g, '_').trim() || 'Untitled';

    const { save } = await import('@tauri-apps/plugin-dialog');
    const destPath = await save({
      defaultPath: `${baseName}.jnote`,
      filters: [{ name: 'JStudio Backup', extensions: ['jnote'] }],
    });
    if (!destPath || typeof destPath !== 'string') return false;

    await storage.exportDocumentBundle(docId, destPath);
    return true;
  },

  /**
   * Import a `.jnote` backup bundle as a brand-new document.
   *
   * Prompts for the file, asks the backend to unpack it into a fresh
   * `documents/{id}/` folder (assets included), then registers the new
   * document in the index + in-memory state and opens it. Returns the new
   * document id, or `null` if the user cancelled.
   */
  importDocumentBundle: async (folderId) => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const srcPath = await open({
      multiple: false,
      filters: [{ name: 'JStudio Backup', extensions: ['jnote'] }],
    });
    if (!srcPath || typeof srcPath !== 'string') return null;

    const newDocId = `doc-${Date.now()}`;
    const imported = await storage.importDocumentBundle(srcPath, newDocId);

    // The backend rewrote `id`; trust its returned Document but keep our id.
    const newDoc: Document = { ...imported, id: newDocId };

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

    get().openDocumentTab(newDoc.id);
    set({ activeSidebarView: 'documents' });

    return newDoc.id;
  },
});
