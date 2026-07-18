/** Store barrel export */
export { useStore } from './useStore';
export {
  // Document selectors
  selectActiveDoc,
  selectActiveDocBlocks,
  selectActiveDocId,
  selectActiveDocReloadNonce,
  selectHasActiveDoc,
  selectDocuments,
  selectDocList,
  selectTrashedDocList,
  selectFilteredDocs,
  selectDocsByFolder,
  // Folder selectors
  selectFolders,
  selectTrashedFolders,
  selectFoldersByParent,
  // UI selectors
  selectIsSidebarOpen,
  selectIsOutlineOpen,
  selectIsSettingsOpen,
  selectIsCommandPaletteOpen,
  selectIsLoading,
  selectThemeMode,
  selectIsDarkMode,
  selectSearchQuery,
  selectActiveSidebarView,
  selectFontConfig,
  // Terminal selectors
  selectTerminalSessions,
  selectActiveTerminalSessionId,
  selectActiveTerminalGroupId,
  selectTerminalTemplates,
  selectRecentDirs,
  selectHasTerminalTab,
  // Workspace / tabs selectors
  selectTabs,
  selectActiveTabId,
  selectTabsByKind,
  // Toast selectors
  selectToasts,
  // Composite selectors
  selectIsEditorReady,
  selectActiveDocTitle,
  selectActiveDocEmoji,
  selectStudioRoot,
} from './selectors';
export {
  scheduleDocumentSave,
  flushDocumentSaves,
  scheduleIndexSave,
  scheduleFoldersSave,
} from './storeHelpers';
export type { StoreState, SetState, GetState, SliceCreator } from './storeHelpers';
