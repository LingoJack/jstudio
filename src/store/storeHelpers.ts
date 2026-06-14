import type { Document, Block, BlockType } from '../types';
import type { DocumentMeta } from '../lib/storage';
import { storage } from '../lib/storage';

/**
 * Shared debounce helpers for persisting documents and the document index.
 * Used across multiple store slices.
 */

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let indexTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleDocumentSave(doc: Document) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    storage.saveDocument(doc).catch(console.error);
  }, 500);
}

export function scheduleIndexSave(metas: DocumentMeta[]) {
  if (indexTimer) clearTimeout(indexTimer);
  indexTimer = setTimeout(() => {
    storage.saveIndex(metas).catch(console.error);
  }, 500);
}

/**
 * The full store state — composed from individual slice interfaces.
 * Each slice creator adds its own piece to this interface.
 */
export interface StoreState {
  // — data (documents slice) —
  docList: DocumentMeta[];
  activeDoc: Document | null;
  activeDocId: string;
  documents: Document[];

  // — ui state (ui slice) —
  isDarkMode: boolean;
  isSidebarOpen: boolean;
  isFolderOpen: boolean;
  isSettingsOpen: boolean;
  isLoading: boolean;

  // — init (documents slice) —
  init: () => Promise<void>;

  // — document ops (documents slice) —
  createDocument: () => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  updateDocumentMeta: (fields: Partial<Document>) => void;

  // — block ops (editor slice) —
  updateBlock: (blockId: string, fields: Partial<Block>) => void;
  deleteBlock: (blockId: string, mergeContent?: string) => void;
  insertBlockBelow: (blockId: string, type: BlockType) => void;
  appendBlockAtEnd: (type: BlockType) => void;
  duplicateBlock: (blockId: string) => void;

  // — asset insertion (editor slice) —
  insertAssetAsBlock: (asset: {
    name: string;
    type: string;
    size: string;
    content: string;
  }) => void;
  saveImageToDoc: (blob: Blob, afterBlockId?: string) => Promise<string | null>;

  // — ui toggles (ui slice) —
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
  toggleFolder: () => void;
  setFolderOpen: (open: boolean) => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
}

/**
 * Zustand's `create` calls each slice creator with `(set, get, store)`.
 * Each slice returns its own piece of state; the pieces are then spread
 * together to form the complete store.
 */
export type SetState = (
  partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>),
) => void;
export type GetState = () => StoreState;

export type SliceCreator = (set: SetState, get: GetState) => Partial<StoreState>;
