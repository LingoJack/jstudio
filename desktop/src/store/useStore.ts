import { create } from 'zustand';
import type { StoreState } from './storeHelpers';
import { createDocumentsSlice } from './documentsSlice';
import { createInitSlice } from './initSlice';
import { createTrashSlice } from './trashSlice';
import { createImportExportSlice } from './importExportSlice';
import { createEditorSlice } from './editorSlice';
import { createUiSlice } from './uiSlice';
import { createTerminalSlice } from './terminalSlice';
import { createToastSlice } from './toastSlice';
import { createFoldersSlice } from './foldersSlice';
import { createWorkspaceSlice } from './workspaceSlice';
import { createAgentSlice } from './agentSlice';
import { createBrowserSlice } from './browserSlice';
import { createAuthSlice } from './authSlice';

/**
 * Composed store - merges all slices into a single Zustand store.
 *
 * - documentsSlice:     document CRUD (create/delete/open/rename)
 * - initSlice:          app bootstrap (settings load, index load, CLI auto-install)
 * - trashSlice:         soft-delete (trash/restore/empty) + asset recycle bin
 * - importExportSlice:  Markdown import + .jnote backup bundles
 * - editorSlice:        block operations, asset insertion
 * - uiSlice:            panel visibility, theme, loading state
 * - terminalSlice:      PTY session lifecycle
 * - toastSlice:         transient notification queue
 * - foldersSlice:       folder tree CRUD
 * - workspaceSlice:     unified tab management (document + terminal tabs)
 * - agentSlice:         agent session lifecycle (j-agent integration)
 * - browserSlice:       inline browser panel state (tabs, address bar, search engine)
 * - authSlice:          remote account session (login/logout/verify)
 */
export const useStore = create<StoreState>((set, get) => ({
  ...(createDocumentsSlice(set, get) as StoreState),
  ...(createInitSlice(set, get) as StoreState),
  ...(createTrashSlice(set, get) as StoreState),
  ...(createImportExportSlice(set, get) as StoreState),
  ...(createEditorSlice(set, get) as StoreState),
  ...(createUiSlice(set, get) as StoreState),
  ...(createTerminalSlice(set, get) as StoreState),
  ...(createToastSlice(set, get) as StoreState),
  ...(createFoldersSlice(set, get) as StoreState),
  ...(createWorkspaceSlice(set, get) as StoreState),
  ...(createAgentSlice(set, get) as StoreState),
  ...(createBrowserSlice(set, get) as StoreState),
  ...(createAuthSlice(set, get) as StoreState),
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
