import { create } from 'zustand';
import type { StoreState } from './storeHelpers';
import { createDocumentsSlice } from './documentsSlice';
import { createEditorSlice } from './editorSlice';
import { createUiSlice } from './uiSlice';

/**
 * Composed store — merges three slices into a single Zustand store.
 *
 * - documentsSlice: document CRUD, init, favorites
 * - editorSlice:    block operations, asset insertion
 * - uiSlice:        panel visibility, theme, loading state
 */
export const useStore = create<StoreState>((set, get) => ({
  ...(createDocumentsSlice(set, get) as StoreState),
  ...(createEditorSlice(set, get) as StoreState),
  ...(createUiSlice(set, get) as StoreState),
}));
