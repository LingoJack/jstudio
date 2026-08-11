import { ipc } from "../lib/core/ipc";
import {
  DEFAULT_ACTIVITY_BAR_ITEMS,
  normalizeActivityBarItems
} from "../types/settings";
import { onSaveError } from "./storeHelpers";
import {
  DEFAULT_DOC_SORT_KEY,
  DEFAULT_DOC_SORT_DIRECTION
} from "../lib/documents/sortUtils";
import {
  DEFAULT_LATIN_FONT_ID,
  DEFAULT_CJK_FONT_ID,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_LINE_HEIGHT,
  MAX_LINE_HEIGHT,
  DEFAULT_LINE_HEIGHT,
  resolveFontFamily,
  DEFAULT_MONOSPACE_FONT_ID
} from "../lib/editor/fonts";
import {
  applyAppTheme,
  getAppTheme,
  DEFAULT_APP_THEME_ID_DARK,
  DEFAULT_APP_THEME_ID_LIGHT
} from "../lib/themes";
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_TERMINAL_FONT_SIZE = 10;
const MAX_TERMINAL_FONT_SIZE = 28;
const DEFAULT_TERMINAL_FONT_SIZE = 14;
const DEFAULT_TERMINAL_CURSOR_STYLE = "underline";
const DEFAULT_EDITOR_CURSOR_STYLE = "bar";
const DEFAULT_EDITOR_CURSOR_ANIMATION_ENABLED = true;
const MIN_TAB_BAR_GLASS_OPACITY = 0.02;
const MAX_TAB_BAR_GLASS_OPACITY = 0.15;
const DEFAULT_TAB_BAR_GLASS_OPACITY = 0.06;
const DEFAULT_TAB_BAR_POSITION = "bottom";
function resolveDark(mode) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function applyDark(isDark) {
  if (isDark) document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}
function applyFont(fontId, cjkFontId, fontSize) {
  const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize));
  const root = document.documentElement;
  root.style.setProperty(
    "--jstudio-font-family",
    resolveFontFamily(fontId, cjkFontId)
  );
  root.style.setProperty("--jstudio-font-size", `${clamped}px`);
}
function applyLineHeight(lineHeight) {
  const clamped = Math.min(
    MAX_LINE_HEIGHT,
    Math.max(MIN_LINE_HEIGHT, lineHeight)
  );
  document.documentElement.style.setProperty(
    "--jstudio-line-height",
    `${clamped}`
  );
}
const createUiSlice = (set, get) => ({
  themeMode: "dark",
  isDarkMode: true,
  appThemeIdDark: DEFAULT_APP_THEME_ID_DARK,
  appThemeIdLight: DEFAULT_APP_THEME_ID_LIGHT,
  language: "zh",
  activityBarItems: DEFAULT_ACTIVITY_BAR_ITEMS,
  isSidebarOpen: true,
  sidebarPinned: true,
  /** Transient flag: true while the pointer is over the ActivityBar. Sidebars
   *  watch this to stay expanded when the user overshoots from the sidebar
   *  into the ActivityBar (they are visually one "left panel" zone). */
  leftPanelHovered: false,
  isOutlineOpen: false,
  isSettingsOpen: false,
  isCommandPaletteOpen: false,
  isFindBarOpen: false,
  isOpenDocDialogOpen: false,
  findQuery: "",
  isLoading: true,
  searchQuery: "",
  fontId: DEFAULT_LATIN_FONT_ID,
  cjkFontId: DEFAULT_CJK_FONT_ID,
  fontSize: DEFAULT_FONT_SIZE,
  editorLineHeight: DEFAULT_LINE_HEIGHT,
  editorCursorStyle: DEFAULT_EDITOR_CURSOR_STYLE,
  editorCursorAnimationEnabled: DEFAULT_EDITOR_CURSOR_ANIMATION_ENABLED,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  activeSidebarView: "documents",
  settingsActiveSection: "general",
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalFontId: DEFAULT_MONOSPACE_FONT_ID,
  terminalCursorStyle: DEFAULT_TERMINAL_CURSOR_STYLE,
  tabBarGlassOpacity: DEFAULT_TAB_BAR_GLASS_OPACITY,
  tabBarPosition: DEFAULT_TAB_BAR_POSITION,
  keyboardShortcuts: {},
  globalShortcuts: [],
  docSortKey: DEFAULT_DOC_SORT_KEY,
  docSortDirection: DEFAULT_DOC_SORT_DIRECTION,
  /** Runtime logger off by default — opt-in via Debug settings. */
  runtimeLoggingEnabled: false,
  /** Exit confirmation on by default — opt-out via General settings. */
  confirmOnExit: true,
  setThemeMode: (mode) => {
    const isDark = resolveDark(mode);
    const themeId = isDark ? get().appThemeIdDark : get().appThemeIdLight;
    const theme = getAppTheme(themeId, isDark);
    applyAppTheme(theme);
    applyDark(isDark);
    set({ themeMode: mode, isDarkMode: isDark });
    ipc.saveSettings({ theme: mode }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  toggleDarkMode: () => {
    const next = !get().isDarkMode;
    const mode = next ? "dark" : "light";
    const themeId = next ? get().appThemeIdDark : get().appThemeIdLight;
    const theme = getAppTheme(themeId, next);
    applyAppTheme(theme);
    applyDark(next);
    set({ themeMode: mode, isDarkMode: next });
    ipc.saveSettings({ theme: mode }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleSidebarPinned: () => {
    const next = !get().sidebarPinned;
    set({ sidebarPinned: next });
    ipc.saveSettings({ sidebarPinned: next }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setLeftPanelHovered: (hovered) => set({ leftPanelHovered: hovered }),
  toggleOutline: () => set((s) => ({ isOutlineOpen: !s.isOutlineOpen })),
  setOutlineOpen: (open) => set({ isOutlineOpen: open }),
  toggleOutlinePinned: () => {
    const next = !get().outlinePinned;
    set({ outlinePinned: next });
    ipc.saveSettings({ outlinePinned: next }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  toggleCommandPalette: () => set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  toggleFindBar: () => set((s) => ({ isFindBarOpen: !s.isFindBarOpen })),
  setFindBarOpen: (open) => set({ isFindBarOpen: open }),
  setOpenDocDialogOpen: (open) => set({ isOpenDocDialogOpen: open }),
  setFindQuery: (q) => set({ findQuery: q }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveSidebarView: (view) => set({ activeSidebarView: view }),
  setSettingsActiveSection: (section) => set({ settingsActiveSection: section }),
  setLanguage: (lang) => {
    set({ language: lang });
    ipc.saveSettings({ language: lang }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setActivityBarItems: (items) => {
    const normalized = normalizeActivityBarItems(items);
    set({ activityBarItems: normalized });
    ipc.saveSettings({ activityBarItems: normalized }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setFontId: (id) => {
    const s = get();
    applyFont(id, s.cjkFontId, s.fontSize);
    set({ fontId: id });
    ipc.saveSettings({ fontId: id }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setCjkFontId: (id) => {
    const s = get();
    applyFont(s.fontId, id, s.fontSize);
    set({ cjkFontId: id });
    ipc.saveSettings({ cjkFontId: id }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setFontSize: (size) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
    const s = get();
    applyFont(s.fontId, s.cjkFontId, clamped);
    set({ fontSize: clamped });
    ipc.saveSettings({ fontSize: clamped }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setEditorLineHeight: (lh) => {
    const clamped = Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, lh));
    applyLineHeight(clamped);
    set({ editorLineHeight: clamped });
    ipc.saveSettings({ editorLineHeight: clamped }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setEditorCursorStyle: (style) => {
    set({ editorCursorStyle: style });
    ipc.saveSettings({ editorCursorStyle: style }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setEditorCursorAnimationEnabled: (enabled) => {
    set({ editorCursorAnimationEnabled: enabled });
    ipc.saveSettings({ editorCursorAnimationEnabled: enabled }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setSidebarWidth: (width) => {
    const clamped = Math.min(
      MAX_SIDEBAR_WIDTH,
      Math.max(MIN_SIDEBAR_WIDTH, width)
    );
    set({ sidebarWidth: clamped });
    ipc.saveSettings({ sidebarWidth: clamped }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setAppThemeIdDark: (id) => {
    set({ appThemeIdDark: id });
    if (get().isDarkMode) {
      const theme = getAppTheme(id, true);
      applyAppTheme(theme);
    }
    ipc.saveSettings({ appThemeIdDark: id }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setAppThemeIdLight: (id) => {
    set({ appThemeIdLight: id });
    if (!get().isDarkMode) {
      const theme = getAppTheme(id, false);
      applyAppTheme(theme);
    }
    ipc.saveSettings({ appThemeIdLight: id }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setTerminalFontSize: (size) => {
    const clamped = Math.min(
      MAX_TERMINAL_FONT_SIZE,
      Math.max(MIN_TERMINAL_FONT_SIZE, size)
    );
    set({ terminalFontSize: clamped });
    ipc.saveSettings({ terminalFontSize: clamped }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setTerminalFontId: (id) => {
    set({ terminalFontId: id });
    ipc.saveSettings({ terminalFontId: id }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setTerminalCursorStyle: (style) => {
    set({ terminalCursorStyle: style });
    ipc.saveSettings({ terminalCursorStyle: style }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setTabBarGlassOpacity: (opacity) => {
    const clamped = Math.min(
      MAX_TAB_BAR_GLASS_OPACITY,
      Math.max(MIN_TAB_BAR_GLASS_OPACITY, opacity)
    );
    set({ tabBarGlassOpacity: clamped });
    ipc.saveSettings({ tabBarGlassOpacity: clamped }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setTabBarPosition: (position) => {
    set({ tabBarPosition: position });
    ipc.saveSettings({ tabBarPosition: position }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setKeyboardShortcut: (id, binding) => {
    const next = { ...get().keyboardShortcuts, [id]: binding };
    set({ keyboardShortcuts: next });
    ipc.saveSettings({ keyboardShortcuts: next }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  resetKeyboardShortcut: (id) => {
    const next = { ...get().keyboardShortcuts };
    delete next[id];
    set({ keyboardShortcuts: next });
    ipc.saveSettings({ keyboardShortcuts: next }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  resetAllKeyboardShortcuts: () => {
    set({ keyboardShortcuts: {} });
    ipc.saveSettings({ keyboardShortcuts: {} }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setGlobalShortcuts: (configs) => {
    set({ globalShortcuts: configs });
    ipc.saveSettings({ globalShortcuts: configs }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setDocSortKey: (key) => {
    set({ docSortKey: key });
    ipc.saveSettings({ docSortKey: key }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setDocSortDirection: (dir) => {
    set({ docSortDirection: dir });
    ipc.saveSettings({ docSortDirection: dir }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setRuntimeLoggingEnabled: (enabled) => {
    set({ runtimeLoggingEnabled: enabled });
    ipc.saveSettings({ runtimeLoggingEnabled: enabled }).catch(onSaveError("\u8BBE\u7F6E"));
  },
  setConfirmOnExit: (enabled) => {
    set({ confirmOnExit: enabled });
    ipc.saveSettings({ confirmOnExit: enabled }).catch(onSaveError("\u8BBE\u7F6E"));
  }
});
export {
  applyFont,
  applyLineHeight,
  createUiSlice,
  resolveDark
};
