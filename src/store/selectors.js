const selectActiveDoc = (state) => state.activeDoc;
const selectActiveDocBlocks = (state) => state.activeDoc?.blocks ?? [];
const selectActiveDocId = (state) => state.activeDocId;
const selectActiveDocReloadNonce = (state) => state.activeDocReloadNonce;
const selectHasActiveDoc = (state) => !!state.activeDoc;
const selectDocuments = (state) => state.documents;
const selectDocList = (state) => state.docList;
const selectTrashedDocList = (state) => state.trashedDocList;
const selectFilteredDocs = (state) => {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) return state.docList;
  return state.docList.filter((d) => d.title.toLowerCase().includes(query));
};
const selectDocsByFolder = (state, folderId) => state.docList.filter(
  (d) => folderId === null ? !d.folderId : d.folderId === folderId
);
const selectFolders = (state) => state.folders;
const selectTrashedFolders = (state) => state.trashedFolders;
const selectFoldersByParent = (state, parentId) => state.folders.filter(
  (f) => parentId === null ? !f.parentId : f.parentId === parentId
);
const selectIsSidebarOpen = (state) => state.isSidebarOpen;
const selectIsOutlineOpen = (state) => state.isOutlineOpen;
const selectIsSettingsOpen = (state) => state.isSettingsOpen;
const selectIsCommandPaletteOpen = (state) => state.isCommandPaletteOpen;
const selectIsLoading = (state) => state.isLoading;
const selectThemeMode = (state) => state.themeMode;
const selectIsDarkMode = (state) => state.isDarkMode;
const selectSearchQuery = (state) => state.searchQuery;
const selectActiveSidebarView = (state) => state.activeSidebarView;
const selectFontConfig = (state) => ({
  fontId: state.fontId,
  cjkFontId: state.cjkFontId,
  fontSize: state.fontSize,
  editorLineHeight: state.editorLineHeight,
  editorCursorStyle: state.editorCursorStyle,
  editorCursorAnimationEnabled: state.editorCursorAnimationEnabled
});
const selectTerminalSessions = (state) => state.sessions;
const selectActiveTerminalSessionId = (state) => state.activeSessionId;
const selectActiveTerminalGroupId = (state) => state.activeGroupId;
const selectTerminalTemplates = (state) => state.templates;
const selectRecentDirs = (state) => state.recentDirs;
const selectHasTerminalTab = (state) => state.activeGroupId !== null;
const selectTabs = (state) => state.tabs;
const selectActiveTabId = (state) => state.activeTabId;
const selectTabsByKind = (state, kind) => state.tabs.filter((t) => t.kind === kind);
const selectToasts = (state) => state.toasts;
const selectIsEditorReady = (state) => !state.isLoading && !!state.activeDoc && state.activeDoc.blocks.length > 0;
const selectActiveDocTitle = (state) => state.activeDoc?.title ?? "";
const selectActiveDocEmoji = (state) => state.activeDoc?.emoji ?? "";
const selectStudioRoot = (state) => state.studioRoot;
export {
  selectActiveDoc,
  selectActiveDocBlocks,
  selectActiveDocEmoji,
  selectActiveDocId,
  selectActiveDocReloadNonce,
  selectActiveDocTitle,
  selectActiveSidebarView,
  selectActiveTabId,
  selectActiveTerminalGroupId,
  selectActiveTerminalSessionId,
  selectDocList,
  selectDocsByFolder,
  selectDocuments,
  selectFilteredDocs,
  selectFolders,
  selectFoldersByParent,
  selectFontConfig,
  selectHasActiveDoc,
  selectHasTerminalTab,
  selectIsCommandPaletteOpen,
  selectIsDarkMode,
  selectIsEditorReady,
  selectIsLoading,
  selectIsOutlineOpen,
  selectIsSettingsOpen,
  selectIsSidebarOpen,
  selectRecentDirs,
  selectSearchQuery,
  selectStudioRoot,
  selectTabs,
  selectTabsByKind,
  selectTerminalSessions,
  selectTerminalTemplates,
  selectThemeMode,
  selectToasts,
  selectTrashedDocList,
  selectTrashedFolders
};
