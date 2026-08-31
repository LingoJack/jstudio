import { ipc } from "../lib/core/ipc";
import {
  type ThemeMode,
  type Language,
  type TerminalCursorStyle,
  type EditorCursorStyle,
  type ActivityBarItemConfig,
  type ActivityItemId,
  DEFAULT_ACTIVITY_BAR_ITEMS,
  normalizeActivityBarItems,
} from "../types/settings";
import type { ShortcutOverrides } from "../lib/shortcuts/keyboardShortcuts";
import type { GlobalShortcutConfig } from "../lib/shortcuts/globalShortcuts";
import { onSaveError, type SliceCreator } from "./storeHelpers";
import {
  type DocSortKey,
  type DocSortDirection,
  DEFAULT_DOC_SORT_KEY,
  DEFAULT_DOC_SORT_DIRECTION,
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
  DEFAULT_MONOSPACE_FONT_ID,
} from "../lib/editor/fonts";
import {
  applyAppTheme,
  getAppTheme,
  DEFAULT_APP_THEME_ID_DARK,
  DEFAULT_APP_THEME_ID_LIGHT,
} from "../lib/themes";

/** Sidebar width constraints (px). */
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 240;

/** Terminal font size constraints (px). Independent from editor font. */
const MIN_TERMINAL_FONT_SIZE = 10;
const MAX_TERMINAL_FONT_SIZE = 28;
const DEFAULT_TERMINAL_FONT_SIZE = 14;

/** Default terminal cursor shape — also drives the cursor trail shape. */
const DEFAULT_TERMINAL_CURSOR_STYLE: TerminalCursorStyle = "underline";

/** Default editor cursor shape — also drives the editor cursor trail shape. */
const DEFAULT_EDITOR_CURSOR_STYLE: EditorCursorStyle = "bar";

/** Default: the animated WebGL cursor trail is on (native caret hidden). */
const DEFAULT_EDITOR_CURSOR_ANIMATION_ENABLED = true;

/** Tab bar glassmorphism opacity constraints. */
const MIN_TAB_BAR_GLASS_OPACITY = 0.02;
const MAX_TAB_BAR_GLASS_OPACITY = 0.15;
const DEFAULT_TAB_BAR_GLASS_OPACITY = 0.06;

/** Default tab bar position. */
const DEFAULT_TAB_BAR_POSITION: "top" | "bottom" = "bottom";

/**
 * Resolve a theme preference to the actual dark/light value.
 * When `mode` is `system`, queries the OS via `prefers-color-scheme`.
 */
export function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply (or remove) the `dark` class on <html> AND inject the app theme colors. */
function applyDark(isDark: boolean) {
  if (isDark) document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

/**
 * Push font settings into the DOM by writing CSS custom properties on
 * <html>.  vscode-theme.css reads --jstudio-font-family /
 * --jstudio-font-size on `body` and `.ProseMirror`.
 */
export function applyFont(fontId: string, cjkFontId: string, fontSize: number) {
  const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize));
  const root = document.documentElement;
  root.style.setProperty(
    "--jstudio-font-family",
    resolveFontFamily(fontId, cjkFontId),
  );
  root.style.setProperty("--jstudio-font-size", `${clamped}px`);
}

/**
 * Push the editor line-height setting into the DOM as a CSS custom
 * property.  vscode-theme.css reads --jstudio-line-height on
 * `.ProseMirror`.
 */
export function applyLineHeight(lineHeight: number) {
  const clamped = Math.min(
    MAX_LINE_HEIGHT,
    Math.max(MIN_LINE_HEIGHT, lineHeight),
  );
  document.documentElement.style.setProperty(
    "--jstudio-line-height",
    `${clamped}`,
  );
}

/** Which sidebar panel is currently active. */
export type SidebarView = "documents" | "terminal" | "agent" | "browser";

/** Which settings section is currently displayed. Driven by store so palette can navigate. */
export type SettingsSectionId =
  | "general"
  | "account"
  | "agent"
  | "editor"
  | "terminal"
  | "shortcuts"
  | "help"
  | "about"
  | "debug";

/** UI slice — panel visibility, theme, font, and loading state. */
/** State + methods provided by the UI slice. */
export interface UISlice {
  themeMode: ThemeMode;
  isDarkMode: boolean;
  appThemeIdDark: string;
  appThemeIdLight: string;
  language: Language;
  activityBarItems: ActivityBarItemConfig[];
  isSidebarOpen: boolean;
  sidebarPinned: boolean;
  leftPanelHovered: boolean;
  isOutlineOpen: boolean;
  outlinePinned: boolean;
  isSettingsOpen: boolean;
  isCommandPaletteOpen: boolean;
  isFindBarOpen: boolean;
  isOpenDocDialogOpen: boolean;
  findQuery: string;
  isLoading: boolean;
  searchQuery: string;
  fontId: string;
  cjkFontId: string;
  fontSize: number;
  editorLineHeight: number;
  editorCursorStyle: EditorCursorStyle;
  editorCursorAnimationEnabled: boolean;
  sidebarWidth: number;
  activeSidebarView: SidebarView;
  settingsActiveSection: SettingsSectionId;
  terminalFontSize: number;
  terminalFontId: string;
  terminalCursorStyle: TerminalCursorStyle;
  tabBarGlassOpacity: number;
  tabBarPosition: 'top' | 'bottom';
  keyboardShortcuts: ShortcutOverrides;
  globalShortcuts: GlobalShortcutConfig[];
  docSortKey: DocSortKey;
  docSortDirection: DocSortDirection;
  runtimeLoggingEnabled: boolean;
  confirmOnExit: boolean;
  /** Whether the global search dialog is currently open. */
  isGlobalSearchOpen: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
  toggleSidebarPinned: () => void;
  setLeftPanelHovered: (v: boolean) => void;
  toggleOutline: () => void;
  setOutlineOpen: (v: boolean) => void;
  toggleOutlinePinned: () => void;
  toggleSettings: () => void;
  setSettingsOpen: (v: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (v: boolean) => void;
  toggleFindBar: () => void;
  setFindBarOpen: (v: boolean) => void;
  setOpenDocDialogOpen: (v: boolean) => void;
  setFindQuery: (q: string) => void;
  setSearchQuery: (q: string) => void;
  setFontId: (id: string) => void;
  setCjkFontId: (id: string) => void;
  setFontSize: (n: number) => void;
  setEditorLineHeight: (n: number) => void;
  setEditorCursorStyle: (s: EditorCursorStyle) => void;
  setEditorCursorAnimationEnabled: (v: boolean) => void;
  setSidebarWidth: (n: number) => void;
  setLanguage: (l: Language) => void;
  setActivityBarBorder: (id: ActivityItemId, border: boolean) => void;
  setActivityBarItems: (items: ActivityBarItemConfig[]) => void;
  setActiveSidebarView: (v: SidebarView) => void;
  setSettingsActiveSection: (s: SettingsSectionId) => void;
  setAppThemeIdDark: (id: string) => void;
  setAppThemeIdLight: (id: string) => void;
  setTerminalFontSize: (n: number) => void;
  setTerminalFontId: (id: string) => void;
  setTerminalCursorStyle: (s: TerminalCursorStyle) => void;
  setTabBarGlassOpacity: (n: number) => void;
  setTabBarPosition: (p: 'top' | 'bottom') => void;
  setKeyboardShortcut: (id: string, keys: string) => void;
  resetKeyboardShortcut: (id: string) => void;
  resetAllKeyboardShortcuts: () => void;
  setGlobalShortcuts: (s: GlobalShortcutConfig[]) => void;
  setDocSortKey: (k: DocSortKey) => void;
  setDocSortDirection: (d: DocSortDirection) => void;
  setRuntimeLoggingEnabled: (v: boolean) => void;
  setConfirmOnExit: (v: boolean) => void;
  setGlobalSearchOpen: (v: boolean) => void;
  toggleGlobalSearch: () => void;
  /** Doc whose BackupRestoreDialog is open; null = closed. */
  backupRestoreDialogDoc: { id: string; title: string } | null;
  openBackupRestore: (docId: string, title: string) => void;
  closeBackupRestore: () => void;
}

export const createUiSlice: SliceCreator = (set, get) => ({
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
  activeSidebarView: "documents" as SidebarView,
  settingsActiveSection: "general",
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalFontId: DEFAULT_MONOSPACE_FONT_ID,
  terminalCursorStyle: DEFAULT_TERMINAL_CURSOR_STYLE,
  tabBarGlassOpacity: DEFAULT_TAB_BAR_GLASS_OPACITY,
  tabBarPosition: DEFAULT_TAB_BAR_POSITION,
  keyboardShortcuts: {} as ShortcutOverrides,
  globalShortcuts: [] as GlobalShortcutConfig[],
  docSortKey: DEFAULT_DOC_SORT_KEY,
  docSortDirection: DEFAULT_DOC_SORT_DIRECTION,
  /** Runtime logger off by default — opt-in via Debug settings. */
  runtimeLoggingEnabled: false,
  /** Exit confirmation on by default — opt-out via General settings. */
  confirmOnExit: true,
  /** Double-Shift global search on by default - opt-out via General settings. */
  /** Global search dialog closed by default. */
  isGlobalSearchOpen: false,

  setThemeMode: (mode) => {
    const isDark = resolveDark(mode);
    const themeId = isDark ? get().appThemeIdDark : get().appThemeIdLight;
    const theme = getAppTheme(themeId, isDark);
    applyAppTheme(theme);
    applyDark(isDark);
    set({ themeMode: mode, isDarkMode: isDark });
    ipc.saveSettings({ theme: mode }).catch(onSaveError("设置"));
  },

  toggleDarkMode: () => {
    // Convenience toggle — cycles between explicit dark/light only.
    const next = !get().isDarkMode;
    const mode: ThemeMode = next ? "dark" : "light";
    const themeId = next ? get().appThemeIdDark : get().appThemeIdLight;
    const theme = getAppTheme(themeId, next);
    applyAppTheme(theme);
    applyDark(next);
    set({ themeMode: mode, isDarkMode: next });
    ipc.saveSettings({ theme: mode }).catch(onSaveError("设置"));
  },

  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleSidebarPinned: () => {
    const next = !get().sidebarPinned;
    set({ sidebarPinned: next });
    ipc.saveSettings({ sidebarPinned: next }).catch(onSaveError("设置"));
  },
  setLeftPanelHovered: (hovered) => set({ leftPanelHovered: hovered }),
  toggleOutline: () => set((s) => ({ isOutlineOpen: !s.isOutlineOpen })),
  setOutlineOpen: (open) => set({ isOutlineOpen: open }),
  toggleOutlinePinned: () => {
    const next = !get().outlinePinned;
    set({ outlinePinned: next });
    ipc.saveSettings({ outlinePinned: next }).catch(onSaveError("设置"));
  },
  toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  toggleCommandPalette: () =>
    set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  toggleFindBar: () => set((s) => ({ isFindBarOpen: !s.isFindBarOpen })),
  setFindBarOpen: (open) => set({ isFindBarOpen: open }),
  setOpenDocDialogOpen: (open) => set({ isOpenDocDialogOpen: open }),
  setFindQuery: (q) => set({ findQuery: q }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveSidebarView: (view) => set({ activeSidebarView: view }),
  setSettingsActiveSection: (section) =>
    set({ settingsActiveSection: section }),

  setLanguage: (lang: Language) => {
    set({ language: lang });
    ipc.saveSettings({ language: lang }).catch(onSaveError("设置"));
  },

  setActivityBarItems: (items: ActivityBarItemConfig[]) => {
    // Normalize on every write so settings always stays visible and pinned to the bottom.
    const normalized = normalizeActivityBarItems(items);
    set({ activityBarItems: normalized });
    ipc
      .saveSettings({ activityBarItems: normalized })
      .catch(onSaveError("设置"));
  },

  setFontId: (id) => {
    const s = get();
    applyFont(id, s.cjkFontId, s.fontSize);
    set({ fontId: id });
    ipc.saveSettings({ fontId: id }).catch(onSaveError("设置"));
  },

  setCjkFontId: (id) => {
    const s = get();
    applyFont(s.fontId, id, s.fontSize);
    set({ cjkFontId: id });
    ipc.saveSettings({ cjkFontId: id }).catch(onSaveError("设置"));
  },

  setFontSize: (size) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
    const s = get();
    applyFont(s.fontId, s.cjkFontId, clamped);
    set({ fontSize: clamped });
    ipc.saveSettings({ fontSize: clamped }).catch(onSaveError("设置"));
  },

  setEditorLineHeight: (lh) => {
    const clamped = Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, lh));
    applyLineHeight(clamped);
    set({ editorLineHeight: clamped });
    ipc
      .saveSettings({ editorLineHeight: clamped })
      .catch(onSaveError("设置"));
  },

  setEditorCursorStyle: (style) => {
    set({ editorCursorStyle: style });
    ipc
      .saveSettings({ editorCursorStyle: style })
      .catch(onSaveError("设置"));
  },

  setEditorCursorAnimationEnabled: (enabled) => {
    set({ editorCursorAnimationEnabled: enabled });
    ipc
      .saveSettings({ editorCursorAnimationEnabled: enabled })
      .catch(onSaveError("设置"));
  },

  setSidebarWidth: (width) => {
    const clamped = Math.min(
      MAX_SIDEBAR_WIDTH,
      Math.max(MIN_SIDEBAR_WIDTH, width),
    );
    set({ sidebarWidth: clamped });
    ipc.saveSettings({ sidebarWidth: clamped }).catch(onSaveError("设置"));
  },

  setAppThemeIdDark: (id) => {
    set({ appThemeIdDark: id });
    // If currently in dark mode, apply the new theme immediately
    if (get().isDarkMode) {
      const theme = getAppTheme(id, true);
      applyAppTheme(theme);
    }
    ipc.saveSettings({ appThemeIdDark: id }).catch(onSaveError("设置"));
  },

  setAppThemeIdLight: (id) => {
    set({ appThemeIdLight: id });
    // If currently in light mode, apply the new theme immediately
    if (!get().isDarkMode) {
      const theme = getAppTheme(id, false);
      applyAppTheme(theme);
    }
    ipc.saveSettings({ appThemeIdLight: id }).catch(onSaveError("设置"));
  },

  setTerminalFontSize: (size) => {
    const clamped = Math.min(
      MAX_TERMINAL_FONT_SIZE,
      Math.max(MIN_TERMINAL_FONT_SIZE, size),
    );
    set({ terminalFontSize: clamped });
    ipc
      .saveSettings({ terminalFontSize: clamped })
      .catch(onSaveError("设置"));
  },

  setTerminalFontId: (id) => {
    set({ terminalFontId: id });
    ipc.saveSettings({ terminalFontId: id }).catch(onSaveError("设置"));
  },

  setTerminalCursorStyle: (style) => {
    set({ terminalCursorStyle: style });
    ipc
      .saveSettings({ terminalCursorStyle: style })
      .catch(onSaveError("设置"));
  },

  setTabBarGlassOpacity: (opacity) => {
    const clamped = Math.min(
      MAX_TAB_BAR_GLASS_OPACITY,
      Math.max(MIN_TAB_BAR_GLASS_OPACITY, opacity),
    );
    set({ tabBarGlassOpacity: clamped });
    ipc
      .saveSettings({ tabBarGlassOpacity: clamped })
      .catch(onSaveError("设置"));
  },

  setTabBarPosition: (position) => {
    set({ tabBarPosition: position });
    ipc
      .saveSettings({ tabBarPosition: position })
      .catch(onSaveError("设置"));
  },

  setKeyboardShortcut: (id: string, binding: string) => {
    const next = { ...get().keyboardShortcuts, [id]: binding };
    set({ keyboardShortcuts: next });
    ipc
      .saveSettings({ keyboardShortcuts: next })
      .catch(onSaveError("设置"));
  },

  resetKeyboardShortcut: (id: string) => {
    const next = { ...get().keyboardShortcuts };
    delete next[id];
    set({ keyboardShortcuts: next });
    ipc
      .saveSettings({ keyboardShortcuts: next })
      .catch(onSaveError("设置"));
  },

  resetAllKeyboardShortcuts: () => {
    set({ keyboardShortcuts: {} });
    ipc.saveSettings({ keyboardShortcuts: {} }).catch(onSaveError("设置"));
  },

  setGlobalShortcuts: (configs) => {
    set({ globalShortcuts: configs });
    ipc
      .saveSettings({ globalShortcuts: configs })
      .catch(onSaveError("设置"));
  },

  setDocSortKey: (key: DocSortKey) => {
    set({ docSortKey: key });
    ipc.saveSettings({ docSortKey: key }).catch(onSaveError("设置"));
  },

  setDocSortDirection: (dir: DocSortDirection) => {
    set({ docSortDirection: dir });
    ipc.saveSettings({ docSortDirection: dir }).catch(onSaveError("设置"));
  },

  setRuntimeLoggingEnabled: (enabled: boolean) => {
    set({ runtimeLoggingEnabled: enabled });
    ipc
      .saveSettings({ runtimeLoggingEnabled: enabled })
      .catch(onSaveError("设置"));
  },

  setConfirmOnExit: (enabled: boolean) => {
    set({ confirmOnExit: enabled });
    ipc.saveSettings({ confirmOnExit: enabled }).catch(onSaveError("设置"));
  },

  setGlobalSearchOpen: (open: boolean) => set({ isGlobalSearchOpen: open }),
  toggleGlobalSearch: () =>
    set((s) => ({ isGlobalSearchOpen: !s.isGlobalSearchOpen })),

  backupRestoreDialogDoc: null,
  openBackupRestore: (docId, title) =>
    set({ backupRestoreDialogDoc: { id: docId, title } }),
  closeBackupRestore: () => set({ backupRestoreDialogDoc: null }),
});
