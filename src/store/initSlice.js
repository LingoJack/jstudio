import { ipc } from "../lib/core/ipc";
import {
  DEFAULT_ACTIVITY_BAR_ITEMS,
  normalizeActivityBarItems
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
  DEFAULT_LINE_HEIGHT
} from "../lib/editor/fonts";
import { migrateDocAssets } from "../lib/documents/migrateAssets";
import { toast } from "../lib/core/toast";
import {
  applyAppTheme,
  getAppTheme,
  DEFAULT_APP_THEME_ID_DARK,
  DEFAULT_APP_THEME_ID_LIGHT
} from "../lib/themes";
import {
  coerceDocSortKey,
  coerceDocSortDirection,
  DEFAULT_DOC_SORT_KEY,
  DEFAULT_DOC_SORT_DIRECTION
} from "../lib/documents/sortUtils";
const createInitSlice = (set, get) => ({
  init: async () => {
    try {
      const studioRoot = await ipc.init();
      await migrateFromLocalStorage();
      try {
        await ipc.cleanGlobalAssets();
      } catch {
      }
      let themeMode = "dark";
      let fontId = DEFAULT_LATIN_FONT_ID;
      let cjkFontId = DEFAULT_CJK_FONT_ID;
      let fontSize = DEFAULT_FONT_SIZE;
      let editorLineHeight = DEFAULT_LINE_HEIGHT;
      let sidebarWidth;
      let sidebarPinned;
      let outlinePinned;
      let language = "zh";
      let activityBarItems = DEFAULT_ACTIVITY_BAR_ITEMS;
      let appThemeIdDark;
      let appThemeIdLight;
      let terminalFontSize;
      let terminalFontId;
      let terminalCursorStyle;
      let editorCursorStyle;
      let editorCursorAnimationEnabled;
      let tabBarGlassOpacity;
      let tabBarPosition;
      let terminalTemplatesRaw;
      let terminalRecentDirsRaw;
      let keyboardShortcuts;
      let globalShortcuts;
      let browserSearchEngine;
      let browserShortcuts;
      let docSortKey = DEFAULT_DOC_SORT_KEY;
      let docSortDirection = DEFAULT_DOC_SORT_DIRECTION;
      let runtimeLoggingEnabled;
      let confirmOnExit;
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
            Math.max(MIN_FONT_SIZE, settings.fontSize)
          );
        }
        if (typeof settings.editorLineHeight === "number") {
          editorLineHeight = Math.min(
            MAX_LINE_HEIGHT,
            Math.max(MIN_LINE_HEIGHT, settings.editorLineHeight)
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
        activityBarItems = normalizeActivityBarItems(settings.activityBarItems);
        if (typeof settings.appThemeIdDark === "string" && settings.appThemeIdDark) {
          appThemeIdDark = settings.appThemeIdDark;
        }
        if (typeof settings.appThemeIdLight === "string" && settings.appThemeIdLight) {
          appThemeIdLight = settings.appThemeIdLight;
        }
        if (typeof settings.terminalFontSize === "number") {
          terminalFontSize = settings.terminalFontSize;
        }
        if (typeof settings.terminalFontId === "string" && settings.terminalFontId) {
          terminalFontId = settings.terminalFontId;
        }
        if (settings.terminalCursorStyle === "block" || settings.terminalCursorStyle === "underline" || settings.terminalCursorStyle === "bar") {
          terminalCursorStyle = settings.terminalCursorStyle;
        }
        if (settings.editorCursorStyle === "bar" || settings.editorCursorStyle === "block" || settings.editorCursorStyle === "underline") {
          editorCursorStyle = settings.editorCursorStyle;
        }
        if (typeof settings.editorCursorAnimationEnabled === "boolean") {
          editorCursorAnimationEnabled = settings.editorCursorAnimationEnabled;
        }
        if (settings.terminalTemplates !== void 0) {
          terminalTemplatesRaw = settings.terminalTemplates;
        }
        if (settings.terminalRecentDirs !== void 0) {
          terminalRecentDirsRaw = settings.terminalRecentDirs;
        }
        if (settings.keyboardShortcuts && typeof settings.keyboardShortcuts === "object") {
          keyboardShortcuts = settings.keyboardShortcuts;
        }
        if (Array.isArray(settings.globalShortcuts)) {
          globalShortcuts = settings.globalShortcuts;
        }
        if (typeof settings.tabBarGlassOpacity === "number") {
          tabBarGlassOpacity = settings.tabBarGlassOpacity;
        }
        if (settings.tabBarPosition === "top" || settings.tabBarPosition === "bottom") {
          tabBarPosition = settings.tabBarPosition;
        }
        docSortKey = coerceDocSortKey(settings.docSortKey);
        docSortDirection = coerceDocSortDirection(settings.docSortDirection);
        if (typeof settings.runtimeLoggingEnabled === "boolean") {
          runtimeLoggingEnabled = settings.runtimeLoggingEnabled;
        }
        if (typeof settings.confirmOnExit === "boolean") {
          confirmOnExit = settings.confirmOnExit;
        }
        if (typeof settings.browserSearchEngine === "string" && settings.browserSearchEngine) {
          browserSearchEngine = settings.browserSearchEngine;
        }
        if (Array.isArray(settings.browserShortcuts)) {
          browserShortcuts = settings.browserShortcuts.filter(
            (s) => typeof s === "object" && s !== null && typeof s.id === "string" && typeof s.name === "string" && typeof s.url === "string" && typeof s.icon === "string" && typeof s.color === "string"
            // Note: faviconUrl is optional; old shortcuts without it are valid.
          );
        }
      } catch {
      }
      const isDark = resolveDark(themeMode);
      const appThemeId = isDark ? appThemeIdDark ?? DEFAULT_APP_THEME_ID_DARK : appThemeIdLight ?? DEFAULT_APP_THEME_ID_LIGHT;
      const appTheme = getAppTheme(appThemeId, isDark);
      applyAppTheme(appTheme);
      if (isDark) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
      applyFont(fontId, cjkFontId, fontSize);
      applyLineHeight(editorLineHeight);
      let index = [];
      try {
        index = await ipc.loadIndex();
      } catch {
      }
      const LEGACY_PRESET_IDS = [
        "doc-welcome",
        "doc-shortcuts",
        "doc-canvas-lab"
      ];
      if (index.length > 0) {
        const filtered = index.filter((m) => !LEGACY_PRESET_IDS.includes(m.id));
        if (filtered.length !== index.length) {
          for (const old of index) {
            if (LEGACY_PRESET_IDS.includes(old.id)) {
              try {
                await ipc.deleteDocument(old.id);
              } catch {
              }
            }
          }
          index = filtered;
          await ipc.saveIndex(index);
        }
      }
      const docs = [];
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
          toast.error(`\u52A0\u8F7D\u6587\u6863\u5931\u8D25: ${meta.title}`);
        }
      }
      const firstId = docs.length > 0 ? docs[0].id : "";
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
        ...sidebarWidth !== void 0 ? { sidebarWidth } : {},
        ...sidebarPinned !== void 0 ? { sidebarPinned } : {},
        ...outlinePinned !== void 0 ? { outlinePinned } : {},
        ...appThemeIdDark !== void 0 ? { appThemeIdDark } : {},
        ...appThemeIdLight !== void 0 ? { appThemeIdLight } : {},
        ...terminalFontSize !== void 0 ? { terminalFontSize } : {},
        ...terminalFontId !== void 0 ? { terminalFontId } : {},
        ...terminalCursorStyle !== void 0 ? { terminalCursorStyle } : {},
        ...editorCursorStyle !== void 0 ? { editorCursorStyle } : {},
        ...editorCursorAnimationEnabled !== void 0 ? { editorCursorAnimationEnabled } : {},
        ...tabBarGlassOpacity !== void 0 ? { tabBarGlassOpacity } : {},
        ...tabBarPosition !== void 0 ? { tabBarPosition } : {},
        ...keyboardShortcuts !== void 0 ? { keyboardShortcuts } : {},
        ...globalShortcuts !== void 0 ? { globalShortcuts } : {},
        ...browserSearchEngine !== void 0 ? { browserSearchEngine } : {},
        ...browserShortcuts !== void 0 ? { browserShortcuts } : {},
        ...runtimeLoggingEnabled !== void 0 ? { runtimeLoggingEnabled } : {},
        ...confirmOnExit !== void 0 ? { confirmOnExit } : {},
        docSortKey,
        docSortDirection,
        isLoading: false
      });
      if (runtimeLoggingEnabled !== void 0) {
        const { logger } = await import("../lib/core/logger");
        logger.setEnabled(runtimeLoggingEnabled);
      }
      if (firstId) {
        get().openDocumentTab(firstId);
      }
      try {
        const folders = await ipc.loadFolders();
        get().initFolders(folders);
      } catch {
      }
      get().initTemplates(terminalTemplatesRaw);
      get().initRecentDirs(terminalRecentDirsRaw);
      void get().loadTrashedAssets();
      void (async () => {
        for (const d of docs) {
          await get().gcDocAssets(d);
        }
      })();
      void (async () => {
        try {
          const currentSettings = await ipc.loadSettings();
          const attempted = currentSettings?.jcliAutoInstallAttempted;
          if (!attempted) {
            const status = await ipc.checkJcli();
            if (!status.installed) {
              const result = await ipc.installJcli();
              if (result) {
                toast.success("CLI \u6A21\u5F0F\u5DF2\u5B89\u88C5\uFF0C\u4F60\u53EF\u4EE5\u5728\u7EC8\u7AEF\u4F7F\u7528 j \u547D\u4EE4");
              }
            }
            await ipc.saveSettings({
              ...await ipc.loadSettings() ?? {},
              jcliAutoInstallAttempted: true
            });
          }
        } catch (e) {
          console.warn("Auto-install CLI skipped:", e);
          try {
            await ipc.saveSettings({
              ...await ipc.loadSettings() ?? {},
              jcliAutoInstallAttempted: true
            });
          } catch {
          }
        }
      })();
    } catch (e) {
      console.error("Store init failed:", e);
      toast.error("\u5E94\u7528\u521D\u59CB\u5316\u5931\u8D25");
      set({ isLoading: false });
    }
  }
});
export {
  createInitSlice
};
