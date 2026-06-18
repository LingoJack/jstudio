import type { Document, Block, BlockType, RichText } from '../types';
import type { DocumentMeta, ThemeMode } from '../lib/storage';
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
  themeMode: ThemeMode;
  isDarkMode: boolean;
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
  isLoading: boolean;
  searchQuery: string;
  fontId: string;
  cjkFontId: string;
  fontSize: number;
  sidebarWidth: number;

  // — init (documents slice) —
  init: () => Promise<void>;

  // — document ops (documents slice) —
  createDocument: () => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  renameDocument: (id: string, title: string) => void;
  openDocument: (id: string) => Promise<void>;
  updateDocumentMeta: (fields: Partial<Document>) => void;

  // — block ops (editor slice) —
  updateBlock: (blockId: string, fields: Partial<Block>) => void;
  deleteBlock: (blockId: string, mergeContent?: RichText[]) => void;
  insertBlockBelow: (blockId: string, type: BlockType) => void;
  appendBlockAtEnd: (type: BlockType) => void;
  duplicateBlock: (blockId: string) => void;

  // — batch ops (editor slice) —
  // Replaces all blocks of the active document in one shot. Used by the
  // TipTap editor to sync content changes without per-block dispatch.
  setActiveDocBlocks: (blocks: Block[]) => void;

  // — asset ops (editor slice) —
  saveImageToDoc: (blob: Blob, afterBlockId?: string) => Promise<string | null>;

  // — ui toggles (ui slice) —
  setThemeMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
  setSearchQuery: (q: string) => void;
  setFontId: (id: string) => void;
  setCjkFontId: (id: string) => void;
  setFontSize: (size: number) => void;
  setSidebarWidth: (width: number) => void;
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
