import { create } from 'zustand';
import type { StoreState } from './storeHelpers';
import { createDocumentsSlice } from './documentsSlice';
import { createEditorSlice } from './editorSlice';
import { createUiSlice } from './uiSlice';
import { createTerminalSlice } from './terminalSlice';

/**
 * Composed store — merges four slices into a single Zustand store.
 *
 * - documentsSlice:  document CRUD, init, favorites
 * - editorSlice:     block operations, asset insertion
 * - uiSlice:         panel visibility, theme, loading state
 * - terminalSlice:   PTY session lifecycle
 */
export const useStore = create<StoreState>((set, get) => ({
  ...(createDocumentsSlice(set, get) as StoreState),
  ...(createEditorSlice(set, get) as StoreState),
  ...(createUiSlice(set, get) as StoreState),
  ...(createTerminalSlice(set, get) as StoreState),
}));

/**
 * When themeMode === 'system', react to OS dark/light changes in real time.
 */
if (typeof window !== 'undefined' && window.matchMedia) {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', (e) => {
    if (useStore.getState().themeMode !== 'system') return;
    const isDark = e.matches;
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    useStore.setState({ isDarkMode: isDark });
  });
}
