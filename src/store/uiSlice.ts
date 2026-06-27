import { storage, type ThemeMode, type Language, type TerminalCursorStyle, type EditorCursorStyle, type ActivityBarItemConfig, DEFAULT_ACTIVITY_BAR_ITEMS } from '../lib/storage';
import type { ShortcutOverrides } from '../lib/shortcuts';
import type { GlobalShortcutConfig } from '../lib/globalShortcuts';
import { onSaveError, type SliceCreator } from './storeHelpers';
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
} from '../lib/fonts';
import { DEFAULT_TERMINAL_THEME_ID_DARK, DEFAULT_TERMINAL_THEME_ID_LIGHT } from '../lib/terminalThemes';

/** Sidebar width constraints (px). */
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 240;

/** Terminal font size constraints (px). Independent from editor font. */
const MIN_TERMINAL_FONT_SIZE = 10;
const MAX_TERMINAL_FONT_SIZE = 28;
const DEFAULT_TERMINAL_FONT_SIZE = 14;

/** Default terminal cursor shape — also drives the cursor trail shape. */
const DEFAULT_TERMINAL_CURSOR_STYLE: TerminalCursorStyle = 'underline';

/** Default editor cursor shape — also drives the editor cursor trail shape. */
const DEFAULT_EDITOR_CURSOR_STYLE: EditorCursorStyle = 'bar';

/**
 * Resolve a theme preference to the actual dark/light value.
 * When `mode` is `system`, queries the OS via `prefers-color-scheme`.
 */
export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Apply (or remove) the `dark` class on <html>. */
function applyDark(isDark: boolean) {
  if (isDark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
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
    '--jstudio-font-family',
    resolveFontFamily(fontId, cjkFontId),
  );
  root.style.setProperty('--jstudio-font-size', `${clamped}px`);
}

/**
 * Push the editor line-height setting into the DOM as a CSS custom
 * property.  vscode-theme.css reads --jstudio-line-height on
 * `.ProseMirror`.
 */
export function applyLineHeight(lineHeight: number) {
  const clamped = Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, lineHeight));
  document.documentElement.style.setProperty('--jstudio-line-height', `${clamped}`);
}

/** Which sidebar panel is currently active. */
export type SidebarView = 'documents' | 'terminal';

/** Which settings section is currently displayed. Driven by store so palette can navigate. */
export type SettingsSectionId = 'general' | 'agent' | 'editor' | 'terminal' | 'shortcuts' | 'help' | 'about';

/** UI slice — panel visibility, theme, font, and loading state. */
export const createUiSlice: SliceCreator = (set, get) => ({
  themeMode: 'dark',
  isDarkMode: true,
  language: 'zh',
  activityBarBorder: false,
  activityBarItems: DEFAULT_ACTIVITY_BAR_ITEMS,
  isSidebarOpen: true,
  isOutlineOpen: false,
  isSettingsOpen: false,
  isCommandPaletteOpen: false,
  isLoading: true,
  searchQuery: '',
  fontId: DEFAULT_LATIN_FONT_ID,
  cjkFontId: DEFAULT_CJK_FONT_ID,
  fontSize: DEFAULT_FONT_SIZE,
  editorLineHeight: DEFAULT_LINE_HEIGHT,
  editorCursorStyle: DEFAULT_EDITOR_CURSOR_STYLE,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  activeSidebarView: 'documents',
  settingsActiveSection: 'general',
  terminalThemeIdDark: DEFAULT_TERMINAL_THEME_ID_DARK,
  terminalThemeIdLight: DEFAULT_TERMINAL_THEME_ID_LIGHT,
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalFontId: DEFAULT_MONOSPACE_FONT_ID,
  terminalCursorStyle: DEFAULT_TERMINAL_CURSOR_STYLE,
  keyboardShortcuts: {} as ShortcutOverrides,
  globalShortcuts: [] as GlobalShortcutConfig[],

  setThemeMode: (mode) => {
    const isDark = resolveDark(mode);
    applyDark(isDark);
    set({ themeMode: mode, isDarkMode: isDark });
    storage.saveSettings({ theme: mode }).catch(onSaveError('设置'));
  },

  toggleDarkMode: () => {
    // Convenience toggle — cycles between explicit dark/light only.
    const next = !get().isDarkMode;
    const mode: ThemeMode = next ? 'dark' : 'light';
    applyDark(next);
    set({ themeMode: mode, isDarkMode: next });
    storage.saveSettings({ theme: mode }).catch(onSaveError('设置'));
  },

  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleOutline: () => set((s) => ({ isOutlineOpen: !s.isOutlineOpen })),
  setOutlineOpen: (open) => set({ isOutlineOpen: open }),
  toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  toggleCommandPalette: () => set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveSidebarView: (view) => set({ activeSidebarView: view }),
  setSettingsActiveSection: (section) => set({ settingsActiveSection: section }),

  setLanguage: (lang: Language) => {
    set({ language: lang });
    storage.saveSettings({ language: lang }).catch(onSaveError('设置'));
  },

  setActivityBarBorder: (enabled: boolean) => {
    set({ activityBarBorder: enabled });
    storage.saveSettings({ activityBarBorder: enabled }).catch(onSaveError('设置'));
  },

  setActivityBarItems: (items: ActivityBarItemConfig[]) => {
    set({ activityBarItems: items });
    storage.saveSettings({ activityBarItems: items }).catch(onSaveError('设置'));
  },

  setFontId: (id) => {
    const s = get();
    applyFont(id, s.cjkFontId, s.fontSize);
    set({ fontId: id });
    storage.saveSettings({ fontId: id }).catch(onSaveError('设置'));
  },

  setCjkFontId: (id) => {
    const s = get();
    applyFont(s.fontId, id, s.fontSize);
    set({ cjkFontId: id });
    storage.saveSettings({ cjkFontId: id }).catch(onSaveError('设置'));
  },

  setFontSize: (size) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
    const s = get();
    applyFont(s.fontId, s.cjkFontId, clamped);
    set({ fontSize: clamped });
    storage.saveSettings({ fontSize: clamped }).catch(onSaveError('设置'));
  },

  setEditorLineHeight: (lh) => {
    const clamped = Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, lh));
    applyLineHeight(clamped);
    set({ editorLineHeight: clamped });
    storage.saveSettings({ editorLineHeight: clamped }).catch(onSaveError('设置'));
  },

  setEditorCursorStyle: (style) => {
    set({ editorCursorStyle: style });
    storage.saveSettings({ editorCursorStyle: style }).catch(onSaveError('设置'));
  },

  setSidebarWidth: (width) => {
    const clamped = Math.min(
      MAX_SIDEBAR_WIDTH,
      Math.max(MIN_SIDEBAR_WIDTH, width),
    );
    set({ sidebarWidth: clamped });
    storage.saveSettings({ sidebarWidth: clamped }).catch(onSaveError('设置'));
  },

  setTerminalThemeIdDark: (id) => {
    set({ terminalThemeIdDark: id });
    storage.saveSettings({ terminalThemeIdDark: id }).catch(onSaveError('设置'));
  },

  setTerminalThemeIdLight: (id) => {
    set({ terminalThemeIdLight: id });
    storage.saveSettings({ terminalThemeIdLight: id }).catch(onSaveError('设置'));
  },

  setTerminalFontSize: (size) => {
    const clamped = Math.min(
      MAX_TERMINAL_FONT_SIZE,
      Math.max(MIN_TERMINAL_FONT_SIZE, size),
    );
    set({ terminalFontSize: clamped });
    storage.saveSettings({ terminalFontSize: clamped }).catch(onSaveError('设置'));
  },

  setTerminalFontId: (id) => {
    set({ terminalFontId: id });
    storage.saveSettings({ terminalFontId: id }).catch(onSaveError('设置'));
  },

  setTerminalCursorStyle: (style) => {
    set({ terminalCursorStyle: style });
    storage.saveSettings({ terminalCursorStyle: style }).catch(onSaveError('设置'));
  },

  setKeyboardShortcut: (id: string, binding: string) => {
    const next = { ...get().keyboardShortcuts, [id]: binding };
    set({ keyboardShortcuts: next });
    storage.saveSettings({ keyboardShortcuts: next }).catch(onSaveError('设置'));
  },

  resetKeyboardShortcut: (id: string) => {
    const next = { ...get().keyboardShortcuts };
    delete next[id];
    set({ keyboardShortcuts: next });
    storage.saveSettings({ keyboardShortcuts: next }).catch(onSaveError('设置'));
  },

  resetAllKeyboardShortcuts: () => {
    set({ keyboardShortcuts: {} });
    storage.saveSettings({ keyboardShortcuts: {} }).catch(onSaveError('设置'));
  },

  setGlobalShortcuts: (configs) => {
    set({ globalShortcuts: configs });
    storage.saveSettings({ globalShortcuts: configs }).catch(onSaveError('设置'));
  },
});
