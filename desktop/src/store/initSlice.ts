/**
 * Init slice - application startup logic.
 */

import { ipc } from "../lib/core/ipc";
import type { DocumentMeta } from "../types/storage";
import {
  DEFAULT_ACTIVITY_BAR_ITEMS,
  normalizeActivityBarItems,
  type ThemeMode,
  type Language,
  type TerminalCursorStyle,
  type EditorCursorStyle,
  type ActivityBarItemConfig,
} from "../types/settings";
import { migrateFromLocalStorage } from "../lib/documents/migrateLegacyStore";
import { resolveDark, applyFont, applyLineHeight } from "./uiSlice";
import {
  DEFAULT_LATIN_FONT_ID,
  DEFAULT_CJK_FONT_ID,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_LINE_HEIGHT,
  MAX_LINE_HEIGHT,
  DEFAULT_LINE_HEIGHT,
} from "../lib/editor/fonts";
import type { Document } from "../types";
import { migrateDocAssets } from "../lib/documents/migrateAssets";
import { toast } from "../lib/core/toast";
import type { GlobalShortcutConfig } from "../lib/shortcuts/globalShortcuts";
import type { BrowserShortcut } from "./browserSlice";
import {
  applyAppTheme,
  getAppTheme,
  DEFAULT_APP_THEME_ID_DARK,
  DEFAULT_APP_THEME_ID_LIGHT,
} from "../lib/themes";
import {
  coerceDocSortKey,
  coerceDocSortDirection,
  DEFAULT_DOC_SORT_KEY,
  DEFAULT_DOC_SORT_DIRECTION,
} from "../lib/documents/sortUtils";
import type { SliceCreator } from "./storeHelpers";

/** Methods provided by the init slice (no own state). */
export interface InitSlice {
  init: () => Promise<void>;
}

export const createInitSlice: SliceCreator = (set, get) => ({
  init: async () => {
    try {
      const studioRoot = await ipc.init();
      await migrateFromLocalStorage();

      // One-time cleanup: remove the legacy global assets directory.
      try {
        await ipc.cleanGlobalAssets();
      } catch {
        // ignore - best-effort cleanup
      }

      // Load settings
      let themeMode: ThemeMode = "dark";
      let fontId = DEFAULT_LATIN_FONT_ID;
      let cjkFontId = DEFAULT_CJK_FONT_ID;
      let fontSize = DEFAULT_FONT_SIZE;
      let editorLineHeight = DEFAULT_LINE_HEIGHT;
      let sidebarWidth: number | undefined;
      let sidebarPinned: boolean | undefined;
      let outlinePinned: boolean | undefined;
      let language: Language = "zh";
      let activityBarItems: ActivityBarItemConfig[] =
        DEFAULT_ACTIVITY_BAR_ITEMS;
      let appThemeIdDark: string | undefined;
      let appThemeIdLight: string | undefined;
      let terminalFontSize: number | undefined;
      let terminalFontId: string | undefined;
      let terminalCursorStyle: TerminalCursorStyle | undefined;
      let editorCursorStyle: EditorCursorStyle | undefined;
      let editorCursorAnimationEnabled: boolean | undefined;
      let tabBarGlassOpacity: number | undefined;
      let tabBarPosition: "top" | "bottom" | undefined;
      let terminalTemplatesRaw: unknown;
      let terminalRecentDirsRaw: unknown;
      let keyboardShortcuts: Record<string, string> | undefined;
      let globalShortcuts: GlobalShortcutConfig[] | undefined;
      let browserSearchEngine: string | undefined;
      let browserShortcuts: BrowserShortcut[] | undefined;
      let docSortKey = DEFAULT_DOC_SORT_KEY;
      let docSortDirection = DEFAULT_DOC_SORT_DIRECTION;
      let runtimeLoggingEnabled: boolean | undefined;
      let confirmOnExit: boolean | undefined;
      try {
        const settings = await ipc.loadSettings();
        if (settings.theme === "light" || settings.theme === "system") {
          themeMode = settings.theme;
        }
        if (typeof settings.fontId === "string" && settings.fontId) {
          fontId = settings.fontId;
        }
        if (typeof settings.cjkFontId === "string" && settings.cjkFontId) {
          cjkFontId = settings.cjkFontId;
        }
        if (typeof settings.fontSize === "number") {
          fontSize = Math.min(
            MAX_FONT_SIZE,
            Math.max(MIN_FONT_SIZE, settings.fontSize),
          );
        }
        if (typeof settings.editorLineHeight === "number") {
          editorLineHeight = Math.min(
            MAX_LINE_HEIGHT,
            Math.max(MIN_LINE_HEIGHT, settings.editorLineHeight),
          );
        }
        if (typeof settings.sidebarWidth === "number") {
          sidebarWidth = settings.sidebarWidth;
        }
        if (typeof settings.sidebarPinned === "boolean") {
          sidebarPinned = settings.sidebarPinned;
        }
        if (typeof settings.outlinePinned === "boolean") {
          outlinePinned = settings.outlinePinned;
        }
        if (settings.language === "en" || settings.language === "zh") {
          language = settings.language;
        }
        // Merge with defaults so new items appear automatically.
        // Normalization also pins settings to the bottom and forces it visible.
        activityBarItems = normalizeActivityBarItems(settings.activityBarItems);
        if (
          typeof settings.appThemeIdDark === "string" &&
          settings.appThemeIdDark
        ) {
          appThemeIdDark = settings.appThemeIdDark;
        }
        if (
          typeof settings.appThemeIdLight === "string" &&
          settings.appThemeIdLight
        ) {
          appThemeIdLight = settings.appThemeIdLight;
        }
        if (typeof settings.terminalFontSize === "number") {
          terminalFontSize = settings.terminalFontSize;
        }
        if (
          typeof settings.terminalFontId === "string" &&
          settings.terminalFontId
        ) {
          terminalFontId = settings.terminalFontId;
        }
        if (
          settings.terminalCursorStyle === "block" ||
          settings.terminalCursorStyle === "underline" ||
          settings.terminalCursorStyle === "bar"
        ) {
          terminalCursorStyle = settings.terminalCursorStyle;
        }
        if (
          settings.editorCursorStyle === "bar" ||
          settings.editorCursorStyle === "block" ||
          settings.editorCursorStyle === "underline"
        ) {
          editorCursorStyle = settings.editorCursorStyle;
        }
        if (typeof settings.editorCursorAnimationEnabled === "boolean") {
          editorCursorAnimationEnabled = settings.editorCursorAnimationEnabled;
        }
        if (settings.terminalTemplates !== undefined) {
          terminalTemplatesRaw = settings.terminalTemplates;
        }
        if (settings.terminalRecentDirs !== undefined) {
          terminalRecentDirsRaw = settings.terminalRecentDirs;
        }
        // Load user-customized keyboard shortcuts
        if (
          settings.keyboardShortcuts &&
          typeof settings.keyboardShortcuts === "object"
        ) {
          keyboardShortcuts = settings.keyboardShortcuts as Record<
            string,
            string
          >;
        }
        // Load OS-level global shortcuts
        if (Array.isArray(settings.globalShortcuts)) {
          globalShortcuts = settings.globalShortcuts;
        }
        // Load tab bar glass opacity
        if (typeof settings.tabBarGlassOpacity === "number") {
          tabBarGlassOpacity = settings.tabBarGlassOpacity;
        }
        // Load tab bar position
        if (
          settings.tabBarPosition === "top" ||
          settings.tabBarPosition === "bottom"
        ) {
          tabBarPosition = settings.tabBarPosition;
        }
        // Load document list sort settings
        docSortKey = coerceDocSortKey(settings.docSortKey);
        docSortDirection = coerceDocSortDirection(settings.docSortDirection);
        // Load runtime logging toggle (Debug settings). Default off - only
        // flip on when the user explicitly opts in.
        if (typeof settings.runtimeLoggingEnabled === "boolean") {
          runtimeLoggingEnabled = settings.runtimeLoggingEnabled;
        }
        // Load exit-confirmation toggle (General settings). Default on -
        // only flip off when the user explicitly opts out.
        if (typeof settings.confirmOnExit === "boolean") {
          confirmOnExit = settings.confirmOnExit;
        }
        // Load browser search engine preference
        if (
          typeof settings.browserSearchEngine === "string" &&
          settings.browserSearchEngine
        ) {
          browserSearchEngine = settings.browserSearchEngine;
        }
        // Load browser shortcuts (validate each entry so corrupted rows
        // can't crash the start page grid).
        if (Array.isArray(settings.browserShortcuts)) {
          browserShortcuts = (settings.browserShortcuts as unknown[]).filter(
            (s): s is BrowserShortcut =>
              typeof s === "object" &&
              s !== null &&
              typeof (s as BrowserShortcut).id === "string" &&
              typeof (s as BrowserShortcut).name === "string" &&
              typeof (s as BrowserShortcut).url === "string" &&
              typeof (s as BrowserShortcut).icon === "string" &&
              typeof (s as BrowserShortcut).color === "string",
            // Note: faviconUrl is optional; old shortcuts without it are valid.
          );
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
      if (isDark) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
      applyFont(fontId, cjkFontId, fontSize);
      applyLineHeight(editorLineHeight);

      // Load index
      let index: DocumentMeta[] = [];
      try {
        index = await ipc.loadIndex();
      } catch {
        // index.json doesn't exist yet
      }

      // Clean up legacy preset documents from earlier versions.
      // These IDs were injected by early builds of the app and should
      // no longer appear for users who want a clean start.
      const LEGACY_PRESET_IDS = [
        "doc-welcome",
        "doc-shortcuts",
        "doc-canvas-lab",
      ];
      if (index.length > 0) {
        const filtered = index.filter((m) => !LEGACY_PRESET_IDS.includes(m.id));
        if (filtered.length !== index.length) {
          // Delete the old document files and rebuild the index
          for (const old of index) {
            if (LEGACY_PRESET_IDS.includes(old.id)) {
              try {
                await ipc.deleteDocument(old.id);
              } catch {
                // best-effort cleanup
              }
            }
          }
          index = filtered;
          await ipc.saveIndex(index);
        }
      }

      // Load index as-is - no preset documents, no auto-creation.
      // If the user has zero documents, the UI shows an empty state.

      // Load all documents into memory.
      const docs: Document[] = [];
      for (const meta of index) {
        try {
          const doc = await ipc.loadDocument(meta.id);
          const migrated = await migrateDocAssets(doc);
          if (migrated) {
            await ipc.saveDocument(migrated);
            docs.push(migrated);
          } else {
            docs.push(doc);
          }
        } catch (e) {
          console.error(`Failed to load document ${meta.id}:`, e);
          toast.error(`加载文档失败: ${meta.title}`);
        }
      }

      const firstId = docs.length > 0 ? docs[0].id : "";

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
        activityBarItems,
        fontId,
        cjkFontId,
        fontSize,
        editorLineHeight,
        ...(sidebarWidth !== undefined ? { sidebarWidth } : {}),
        ...(sidebarPinned !== undefined ? { sidebarPinned } : {}),
        ...(outlinePinned !== undefined ? { outlinePinned } : {}),
        ...(appThemeIdDark !== undefined ? { appThemeIdDark } : {}),
        ...(appThemeIdLight !== undefined ? { appThemeIdLight } : {}),
        ...(terminalFontSize !== undefined ? { terminalFontSize } : {}),
        ...(terminalFontId !== undefined ? { terminalFontId } : {}),
        ...(terminalCursorStyle !== undefined ? { terminalCursorStyle } : {}),
        ...(editorCursorStyle !== undefined ? { editorCursorStyle } : {}),
        ...(editorCursorAnimationEnabled !== undefined
          ? { editorCursorAnimationEnabled }
          : {}),
        ...(tabBarGlassOpacity !== undefined ? { tabBarGlassOpacity } : {}),
        ...(tabBarPosition !== undefined ? { tabBarPosition } : {}),
        ...(keyboardShortcuts !== undefined ? { keyboardShortcuts } : {}),
        ...(globalShortcuts !== undefined ? { globalShortcuts } : {}),
        ...(browserSearchEngine !== undefined ? { browserSearchEngine } : {}),
        ...(browserShortcuts !== undefined ? { browserShortcuts } : {}),
        ...(runtimeLoggingEnabled !== undefined
          ? { runtimeLoggingEnabled }
          : {}),
        ...(confirmOnExit !== undefined ? { confirmOnExit } : {}),
        docSortKey,
        docSortDirection,
        isLoading: false,
      });

      // Apply the loaded runtime-logging flag to the singleton logger so
      // capture hooks (window.onerror, console.error, …) are installed or
      // removed without requiring a window reload. Importing here (inside
      // init) keeps the logger module out of the hot module graph of every
      // component - only the main window's init path pulls it in.
      if (runtimeLoggingEnabled !== undefined) {
        const { logger } = await import("../lib/core/logger");
        logger.setEnabled(runtimeLoggingEnabled);
      }

      // Open a workspace tab for the first document (if any).
      // This ensures DocumentTabs shows the active document on startup.
      if (firstId) {
        get().openDocumentTab(firstId);
      }

      // Load folder index
      try {
        const folders = await ipc.loadFolders();
        get().initFolders(folders);
      } catch {
        // folders.json doesn't exist yet - fine
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

      // Auto-install CLI (`j` command) on first launch.
      // JStudio and `j` are the same application in two forms - GUI and CLI.
      // We attempt installation once; if it fails (e.g. user cancels the
      // sudo prompt), we mark it as attempted and don't retry automatically.
      void (async () => {
        try {
          const currentSettings = await ipc.loadSettings();
          const attempted = currentSettings?.jcliAutoInstallAttempted;
          if (!attempted) {
            const status = await ipc.checkJcli();
            if (!status.installed) {
              const result = await ipc.installJcli();
              if (result) {
                toast.success("CLI 模式已安装，你可以在终端使用 j 命令");
              }
            }
            // Mark as attempted regardless of success/failure
            await ipc.saveSettings({
              ...((await ipc.loadSettings()) ?? {}),
              jcliAutoInstallAttempted: true,
            });
          }
        } catch (e) {
          console.warn("Auto-install CLI skipped:", e);
          // Mark as attempted even on error to avoid retrying every launch
          try {
            await ipc.saveSettings({
              ...((await ipc.loadSettings()) ?? {}),
              jcliAutoInstallAttempted: true,
            });
          } catch {
            // ignore
          }
        }
      })();

      // Remote account session recovery: verify the persisted token against
      // the backend in the background. Non-blocking — verifyRemoteSession
      // loads its own settings, optimistically restores the session, and
      // downgrades to expired/offline based on the /auth/me result.
      void get().verifyRemoteSession();
    } catch (e) {
      console.error("Store init failed:", e);
      toast.error("应用初始化失败");
      set({ isLoading: false });
    }
  },
});
