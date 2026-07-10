/**
 * Unified store selectors.
 *
 * Provides a centralized layer for accessing store state. Benefits:
 * - Single source of truth for state structure
 * - Easier to refactor when state shape changes
 * - Foundation for future memoization / performance optimization
 * - Encapsulates complex state aggregation logic
 *
 * Usage:
 * ```tsx
 * import { useStore } from '../store/useStore';
 * import { selectActiveDocBlocks, selectFilteredDocs } from '../store/selectors';
 *
 * const blocks = useStore(selectActiveDocBlocks);
 * const filteredDocs = useStore(selectFilteredDocs);
 * ```
 *
 * Note: Existing components can migrate incrementally. This file provides
 * a cleaner API for new code, but legacy `useStore((s) => s.xxx)` patterns
 * continue to work.
 */

import type { StoreState } from './storeHelpers';
import type { Document, Block } from '../types';
import type { DocumentMeta, FolderMeta } from '../lib/core/storage';

// ---------------------------------------------------------------------------
// Document selectors
// ---------------------------------------------------------------------------

/** Select the active document (may be null). */
export const selectActiveDoc = (state: StoreState): Document | null =>
  state.activeDoc;

/** Select the active document's blocks (empty array if no active doc). */
export const selectActiveDocBlocks = (state: StoreState): Block[] =>
  state.activeDoc?.blocks ?? [];

/** Select the active document ID. */
export const selectActiveDocId = (state: StoreState): string =>
  state.activeDocId;

/** Select the reload nonce (used to force editor content refresh). */
export const selectActiveDocReloadNonce = (state: StoreState): number =>
  state.activeDocReloadNonce;

/** Check if there is an active document. */
export const selectHasActiveDoc = (state: StoreState): boolean =>
  !!state.activeDoc;

/** Select all documents (full objects, not just meta). */
export const selectDocuments = (state: StoreState): Document[] =>
  state.documents;

/** Select document list (meta only, for sidebar). */
export const selectDocList = (state: StoreState): DocumentMeta[] =>
  state.docList;

/** Select trashed documents. */
export const selectTrashedDocList = (state: StoreState): DocumentMeta[] =>
  state.trashedDocList;

/**
 * Select documents filtered by search query.
 * Returns full documents if query is empty, otherwise filters by title match.
 */
export const selectFilteredDocs = (state: StoreState): DocumentMeta[] => {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) return state.docList;
  return state.docList.filter((d) => d.title.toLowerCase().includes(query));
};

/**
 * Select documents belonging to a specific folder.
 * Pass `null` for root-level documents (no folder).
 */
export const selectDocsByFolder = (
  state: StoreState,
  folderId: string | null,
): DocumentMeta[] =>
  state.docList.filter((d) =>
    folderId === null ? !d.folderId : d.folderId === folderId,
  );

// ---------------------------------------------------------------------------
// Folder selectors
// ---------------------------------------------------------------------------

/** Select all folders. */
export const selectFolders = (state: StoreState): FolderMeta[] =>
  state.folders;

/** Select trashed folders. */
export const selectTrashedFolders = (state: StoreState): FolderMeta[] =>
  state.trashedFolders;

/**
 * Select child folders of a given parent.
 * Pass `null` for root-level folders.
 */
export const selectFoldersByParent = (
  state: StoreState,
  parentId: string | null,
): FolderMeta[] =>
  state.folders.filter((f) =>
    parentId === null ? !f.parentId : f.parentId === parentId,
  );

// ---------------------------------------------------------------------------
// UI selectors
// ---------------------------------------------------------------------------

/** Check if sidebar is open. */
export const selectIsSidebarOpen = (state: StoreState): boolean =>
  state.isSidebarOpen;

/** Check if outline panel is open. */
export const selectIsOutlineOpen = (state: StoreState): boolean =>
  state.isOutlineOpen;

/** Check if settings panel is open. */
export const selectIsSettingsOpen = (state: StoreState): boolean =>
  state.isSettingsOpen;

/** Check if command palette is open. */
export const selectIsCommandPaletteOpen = (state: StoreState): boolean =>
  state.isCommandPaletteOpen;

/** Check if app is in loading state. */
export const selectIsLoading = (state: StoreState): boolean =>
  state.isLoading;

/** Select current theme mode. */
export const selectThemeMode = (state: StoreState) => state.themeMode;

/** Check if dark mode is active. */
export const selectIsDarkMode = (state: StoreState): boolean =>
  state.isDarkMode;

/** Select current search query. */
export const selectSearchQuery = (state: StoreState): string =>
  state.searchQuery;

/** Select active sidebar view. */
export const selectActiveSidebarView = (state: StoreState) =>
  state.activeSidebarView;

/** Select font configuration. */
export const selectFontConfig = (state: StoreState) => ({
  fontId: state.fontId,
  cjkFontId: state.cjkFontId,
  fontSize: state.fontSize,
  editorLineHeight: state.editorLineHeight,
  editorCursorStyle: state.editorCursorStyle,
});

/** Check if sectioned editor is enabled. */
export const selectUseSectionedEditor = (state: StoreState): boolean =>
  state.useSectionedEditor;

// ---------------------------------------------------------------------------
// Terminal selectors
// ---------------------------------------------------------------------------

/** Select all terminal sessions. */
export const selectTerminalSessions = (state: StoreState) => state.sessions;

/** Select active terminal session ID. */
export const selectActiveTerminalSessionId = (state: StoreState) =>
  state.activeSessionId;

/** Select active terminal group ID. */
export const selectActiveTerminalGroupId = (state: StoreState) =>
  state.activeGroupId;

/** Select terminal templates. */
export const selectTerminalTemplates = (state: StoreState) => state.templates;

/** Select recent directories. */
export const selectRecentDirs = (state: StoreState): string[] =>
  state.recentDirs;

/** Check if there is an active terminal tab (group). */
export const selectHasTerminalTab = (state: StoreState): boolean =>
  state.activeGroupId !== null;

// ---------------------------------------------------------------------------
// Workspace / tabs selectors
// ---------------------------------------------------------------------------

/** Select all tabs. */
export const selectTabs = (state: StoreState) => state.tabs;

/** Select active tab ID. */
export const selectActiveTabId = (state: StoreState) => state.activeTabId;

/**
 * Select tabs filtered by kind.
 * @param kind - 'document' or 'terminal'
 */
export const selectTabsByKind = (
  state: StoreState,
  kind: 'document' | 'terminal',
) => state.tabs.filter((t) => t.kind === kind);

// ---------------------------------------------------------------------------
// Toast selectors
// ---------------------------------------------------------------------------

/** Select all toasts. */
export const selectToasts = (state: StoreState) => state.toasts;

// ---------------------------------------------------------------------------
// Composite selectors (aggregate multiple state fields)
// ---------------------------------------------------------------------------

/**
 * Check if the editor is ready to render content.
 * Requires: active doc exists, has blocks, not loading.
 */
export const selectIsEditorReady = (state: StoreState): boolean =>
  !state.isLoading && !!state.activeDoc && state.activeDoc.blocks.length > 0;

/**
 * Select the active document's title (or empty string).
 */
export const selectActiveDocTitle = (state: StoreState): string =>
  state.activeDoc?.title ?? '';

/**
 * Select the active document's emoji (or empty string).
 */
export const selectActiveDocEmoji = (state: StoreState): string =>
  state.activeDoc?.emoji ?? '';

/**
 * Select studio root path.
 */
export const selectStudioRoot = (state: StoreState): string =>
  state.studioRoot;