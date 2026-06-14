import { storage } from '../lib/storage';
import type { SliceCreator } from './storeHelpers';

/** UI slice — panel visibility, theme, and loading state. */
export const createUiSlice: SliceCreator = (set, get) => ({
  isDarkMode: true,
  isSidebarOpen: true,
  isSettingsOpen: false,
  isLoading: true,

  toggleDarkMode: () => {
    const next = !get().isDarkMode;
    if (next) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    set({ isDarkMode: next });
    storage.saveSettings({ theme: next ? 'dark' : 'light' }).catch(console.error);
  },

  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
});
