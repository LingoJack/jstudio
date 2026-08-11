/** Storage-layer types - document metadata, assets, backups, and agent config IPC types. */

import type { Document } from './document';

/**
 * Lightweight document metadata - used for the sidebar list.
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
  /** Folder this document belongs to; `null`/`undefined` = root level */
  folderId?: string | null;
  /** ISO timestamp when moved to trash; `null`/`undefined` = active document */
  trashedAt?: string | null;
}

/**
 * Folder metadata for the document sidebar tree.
 * Folders can nest arbitrarily deep via `parentId`.
 */
export interface FolderMeta {
  /** `"folder-{timestamp}"` */
  id: string;
  name: string;
  /** Parent folder id; `null` = top-level */
  parentId: string | null;
  /** Sort order among siblings (ascending) */
  sortOrder: number;
  /** Whether the folder is collapsed in the sidebar UI */
  collapsed: boolean;
  /** ISO timestamp when moved to trash; `null`/`undefined` = active folder */
  trashedAt?: string | null;
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
 * A document-private asset that has been moved to the recycle bin.
 * Mirrors the row shape returned by `list_trashed_assets`.
 */
export interface TrashedAsset {
  /** Auto-increment primary key - used to restore / delete the entry. */
  id: number;
  /** The document this asset belonged to. */
  docId: string;
  /** File name inside the document's `.trash/` folder. */
  trashName: string;
  /** Name to restore the file back into `assets/` as. */
  originalName: string;
  /** Guessed MIME type. */
  type: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** ISO timestamp when the asset was trashed. */
  trashedAt: string;
}

/**
 * Metadata for a document body backup snapshot (no body - keeps the list
 * payload small). Mirrors the Rust `BackupMeta` struct.
 */
export interface DocBackup {
  /** File name without extension, e.g. "1720472340000". Used as the id. */
  id: string;
  /** Epoch milliseconds when the backup was taken. */
  timestampMs: number;
  /** Block count of the snapshot. */
  blockCount: number;
  /** File size in bytes. */
  size: number;
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
    folderId: doc.folderId ?? null,
  };
}

// ────────────────────────────────────────────────
// Agent config (jcli agent model providers) - Rust-facing IPC types
// These mirror the Rust structs with snake_case field names.
// Note: distinct from the frontend ModelProvider in types/agent.ts.
// ────────────────────────────────────────────────

/**
 * Tool-call protocol mode - mirrors the Rust `ToolCallMode` enum
 * (`snake_case` serialisation).
 * - `native`   -> OpenAI-style function calling (default)
 * - `disabled` -> tool calls turned off entirely
 */
export type ToolCallMode = 'native' | 'disabled';

/**
 * A single model provider entry - mirrors the Rust `ModelProvider` struct.
 * Any OpenAI-compatible endpoint can be added here.
 */
export interface ModelProvider {
  /** Display name (user-defined, e.g. "deepseek", "openrouter") */
  name: string;
  /** OpenAI-compatible API base URL (e.g. "https://api.openai.com/v1") */
  api_base: string;
  /** API key (stored in plaintext, same as jcli agent) */
  api_key: string;
  /** Model identifier sent to the API (e.g. "gpt-4o") */
  model: string;
  /** Whether the model supports vision / multimodal input */
  supports_vision: boolean;
  /** Tool-call protocol mode */
  tool_call_mode: ToolCallMode;
  /**
   * Max output tokens per request (`None`/`undefined` = API default).
   * Reasoning models (deepseek-r1, ark-code-latest) often burn tokens
   * on reasoning and produce empty visible output, so bump this
   * (e.g. 8192, 16384) when needed.
   */
  max_tokens?: number | null;
  /**
   * Thinking effort / `reasoning_effort`. Empty string = don't send
   * the thinking parameter (use API default behavior).
   * Common values: `low` / `high` / `max` / `xhigh`.
   * When non-empty, both `reasoning_effort` and
   * `thinking: {"type":"enabled"}` are sent, compatible with
   * DeepSeek official API and Volcengine Ark API.
   */
  thinking_effort?: string;
}

/**
 * The on-disk agent config file (`~/.jdata/agent/data/agent_config.json`).
 *
 * JStudio only manages `providers` + `active_index`; all other fields
 * (system_prompt, compact, theme, …) are carried through untouched via
 * the index signature so they are never lost on write-back.
 */
export interface AgentConfigFile {
  providers: ModelProvider[];
  active_index: number;
  [key: string]: unknown;
}
