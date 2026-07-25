import { create } from 'zustand';
import type { StoreState } from './storeHelpers';
import { createDocumentsSlice } from './documentsSlice';
import { createEditorSlice } from './editorSlice';
import { createUiSlice } from './uiSlice';
import { createTerminalSlice } from './terminalSlice';
import { createToastSlice } from './toastSlice';
import { createFoldersSlice } from './foldersSlice';
import { createWorkspaceSlice } from './workspaceSlice';
import { createAgentSlice } from './agentSlice';
import { createBrowserSlice } from './browserSlice';

/**
 * Composed store — merges all slices into a single Zustand store.
 *
 * - documentsSlice:  document CRUD, init, favorites
 * - editorSlice:     block operations, asset insertion
 * - uiSlice:         panel visibility, theme, loading state
 * - terminalSlice:   PTY session lifecycle
 * - toastSlice:      transient notification queue
 * - foldersSlice:    folder tree CRUD
 * - workspaceSlice:  unified tab management (document + terminal tabs)
 * - agentSlice:      agent session lifecycle (j-agent integration)
 * - browserSlice:    inline browser panel state (tabs, address bar, search engine)
 */
export const useStore = create<StoreState>((set, get) => ({
  ...(createDocumentsSlice(set, get) as StoreState),
  ...(createEditorSlice(set, get) as StoreState),
  ...(createUiSlice(set, get) as StoreState),
  ...(createTerminalSlice(set, get) as StoreState),
  ...(createToastSlice(set, get) as StoreState),
  ...(createFoldersSlice(set, get) as StoreState),
  ...(createWorkspaceSlice(set, get) as StoreState),
  ...(createAgentSlice(set, get) as StoreState),
  ...(createBrowserSlice(set, get) as StoreState),
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
