import { storage, type ThemeMode } from '../lib/storage';
import type { SliceCreator } from './storeHelpers';
import {
  DEFAULT_LATIN_FONT_ID,
  DEFAULT_CJK_FONT_ID,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  resolveFontFamily,
} from '../lib/fonts';

/** Sidebar width constraints (px). */
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 240;

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

/** UI slice — panel visibility, theme, font, and loading state. */
export const createUiSlice: SliceCreator = (set, get) => ({
  themeMode: 'dark',
  isDarkMode: true,
  isSidebarOpen: true,
  isOutlineOpen: false,
  isSettingsOpen: false,
  isLoading: true,
  searchQuery: '',
  fontId: DEFAULT_LATIN_FONT_ID,
  cjkFontId: DEFAULT_CJK_FONT_ID,
  fontSize: DEFAULT_FONT_SIZE,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,

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
  toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),

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
});
