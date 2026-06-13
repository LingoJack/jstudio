import { invoke } from '@tauri-apps/api/core';
import type { Document } from '../types';

/**
 * Lightweight document metadata — used for the sidebar list.
 * Excludes `blocks` so the sidebar can render instantly without
 * loading every document's full content.
 */
export interface DocumentMeta {
  id: string;
  title: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
}

export interface AppSettings {
  theme?: 'dark' | 'light';
  [key: string]: unknown;
}

export interface AssetInfo {
  fileName: string;
  name: string;
  type: string;
  size: string;
  sizeBytes?: number;
  createdAt: number;
}

/**
 * Convert a full Document to its lightweight metadata form.
 */
export function toMeta(doc: Document): DocumentMeta {
  return {
    id: doc.id,
    title: doc.title,
    emoji: doc.emoji,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    isFavorite: doc.isFavorite,
  };
}

/**
 * Storage abstraction layer.
 *
 * Every method maps 1-to-1 to a `#[tauri::command]` on the Rust side.
 * Components should **never** call `invoke` directly — always go
 * through this module so the API surface is centralized and typed.
 */
export const storage = {
  // ---- lifecycle ----

  /** Create the `~/.jdata/studio/{documents,assets}` directory tree. */
  init: () => invoke<string>('ensure_studio_dir'),

  // ---- index (sidebar metadata) ----

  loadIndex: () => invoke<DocumentMeta[]>('read_index'),
  saveIndex: (entries: DocumentMeta[]) =>
    invoke<void>('write_index', { entries }),

  // ---- documents ----

  loadDocument: (docId: string) =>
    invoke<Document>('read_document', { docId }),
  saveDocument: (doc: Document) =>
    invoke<void>('write_document', { docId: doc.id, doc }),
  deleteDocument: (docId: string) =>
    invoke<void>('delete_document', { docId }),

  // ---- assets ----

  saveAsset: (id: string, data: number[], ext: string) =>
    invoke<string>('save_asset', { assetId: id, data, ext }),
  deleteAsset: (fileName: string) =>
    invoke<void>('delete_asset', { fileName }),
  readAssetBase64: (fileName: string) =>
    invoke<string>('read_asset_base64', { fileName }),
  listAssets: () => invoke<AssetInfo[]>('list_assets'),

  // ---- settings ----

  loadSettings: () => invoke<AppSettings>('read_settings'),
  saveSettings: (settings: AppSettings) =>
    invoke<void>('write_settings', { settings }),
};
