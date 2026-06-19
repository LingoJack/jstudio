import { storage, type ThemeMode, type Language, type TerminalCursorStyle } from '../lib/storage';
import type { SliceCreator } from './storeHelpers';
import {
  DEFAULT_LATIN_FONT_ID,
  DEFAULT_CJK_FONT_ID,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
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

/** Which sidebar panel is currently active. */
export type SidebarView = 'documents' | 'terminal';

/** UI slice — panel visibility, theme, font, and loading state. */
export const createUiSlice: SliceCreator = (set, get) => ({
  themeMode: 'dark',
  isDarkMode: true,
  language: 'zh',
  activityBarBorder: false,
  isSidebarOpen: true,
  isOutlineOpen: false,
  isSettingsOpen: false,
  isLoading: true,
  searchQuery: '',
  fontId: DEFAULT_LATIN_FONT_ID,
  cjkFontId: DEFAULT_CJK_FONT_ID,
  fontSize: DEFAULT_FONT_SIZE,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  activeSidebarView: 'documents',
  terminalThemeIdDark: DEFAULT_TERMINAL_THEME_ID_DARK,
  terminalThemeIdLight: DEFAULT_TERMINAL_THEME_ID_LIGHT,
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalFontId: DEFAULT_MONOSPACE_FONT_ID,
  terminalCursorStyle: DEFAULT_TERMINAL_CURSOR_STYLE,

  setThemeMode: (mode) => {
    const isDark = resolveDark(mode);
    applyDark(isDark);
    set({ themeMode: mode, isDarkMode: isDark });
    storage.saveSettings({ theme: mode }).catch(console.error);
  },

  toggleDarkMode: () => {
    // Convenience toggle — cycles between explicit dark/light only.
    const next = !get().isDarkMode;
    const mode: ThemeMode = next ? 'dark' : 'light';
    applyDark(next);
    set({ themeMode: mode, isDarkMode: next });
    storage.saveSettings({ theme: mode }).catch(console.error);
  },

  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleOutline: () => set((s) => ({ isOutlineOpen: !s.isOutlineOpen })),
  setOutlineOpen: (open) => set({ isOutlineOpen: open }),
  toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveSidebarView: (view) => set({ activeSidebarView: view }),

  setLanguage: (lang: Language) => {
    set({ language: lang });
    storage.saveSettings({ language: lang }).catch(console.error);
  },

  setActivityBarBorder: (enabled: boolean) => {
    set({ activityBarBorder: enabled });
    storage.saveSettings({ activityBarBorder: enabled }).catch(console.error);
  },

  setFontId: (id) => {
    const s = get();
    applyFont(id, s.cjkFontId, s.fontSize);
    set({ fontId: id });
    storage.saveSettings({ fontId: id }).catch(console.error);
  },

  setCjkFontId: (id) => {
    const s = get();
    applyFont(s.fontId, id, s.fontSize);
    set({ cjkFontId: id });
    storage.saveSettings({ cjkFontId: id }).catch(console.error);
  },

  setFontSize: (size) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
    const s = get();
    applyFont(s.fontId, s.cjkFontId, clamped);
    set({ fontSize: clamped });
    storage.saveSettings({ fontSize: clamped }).catch(console.error);
  },

  setSidebarWidth: (width) => {
    const clamped = Math.min(
      MAX_SIDEBAR_WIDTH,
      Math.max(MIN_SIDEBAR_WIDTH, width),
    );
    set({ sidebarWidth: clamped });
    storage.saveSettings({ sidebarWidth: clamped }).catch(console.error);
  },

  setTerminalThemeIdDark: (id) => {
    set({ terminalThemeIdDark: id });
    storage.saveSettings({ terminalThemeIdDark: id }).catch(console.error);
  },

  setTerminalThemeIdLight: (id) => {
    set({ terminalThemeIdLight: id });
    storage.saveSettings({ terminalThemeIdLight: id }).catch(console.error);
  },

  setTerminalFontSize: (size) => {
    const clamped = Math.min(
      MAX_TERMINAL_FONT_SIZE,
      Math.max(MIN_TERMINAL_FONT_SIZE, size),
    );
    set({ terminalFontSize: clamped });
    storage.saveSettings({ terminalFontSize: clamped }).catch(console.error);
  },

  setTerminalFontId: (id) => {
    set({ terminalFontId: id });
    storage.saveSettings({ terminalFontId: id }).catch(console.error);
  },

  setTerminalCursorStyle: (style) => {
    set({ terminalCursorStyle: style });
    storage.saveSettings({ terminalCursorStyle: style }).catch(console.error);
  },
});
