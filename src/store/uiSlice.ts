import { storage, type ThemeMode } from '../lib/storage';
import type { SliceCreator } from './storeHelpers';

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

/** UI slice — panel visibility, theme, and loading state. */
export const createUiSlice: SliceCreator = (set, get) => ({
  themeMode: 'dark',
  isDarkMode: true,
  isSidebarOpen: true,
  isSettingsOpen: false,
  isLoading: true,
  searchQuery: '',

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
});
