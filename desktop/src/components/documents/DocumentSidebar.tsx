import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { useSidebarHover } from '../hooks/useSidebarHover';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useDocDragDrop, ROOT_DROP_ID } from './hooks/useDocDragDrop';
import { useDocSidebarActions } from './hooks/useDocSidebarActions';
import { buildFolderTree } from '../../lib/documents/folderTree';
import { pinyinIncludes } from '../../lib/documents/pinyinMatch';
import { MoreHorizontal, X, Pin, ListFilter } from 'lucide-react';
import { CollapsedRail } from '../ui/CollapsedRail';
import DocumentContextMenu from './DocumentContextMenu';
import DocumentSidebarMoreMenu from './DocumentSidebarMoreMenu';
import { FolderContextMenu, BatchContextMenu, BatchMoveMenu } from './DocumentSidebarMenus';
import { DocumentTreeRenderer, SearchResultsList } from './DocumentTreeRenderer';
import TrashDialog from './TrashDialog';
import BackupRestoreDialog from './BackupRestoreDialog';

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

/** Width of the sidebar when collapsed (unpinned, not hovered). */
const COLLAPSED_WIDTH = 48;

interface ContextMenuState {
  x: number;
  y: number;
  docId: string;
}

interface FolderMenuState {
  x: number;
  y: number;
  folderId: string;
}

export default function DocumentSidebar() {
  const { t } = useI18n();
  // Keep a ref to `t` so callbacks that use it don't need it in their deps
  // (useI18n returns a new `t` function on every render).
  const tRef = useRef(t);
  tRef.current = t;
  const docList = useStore((s) => s.docList);
  const activeDocId = useStore((s) => s.activeDocId);
  const openDocumentTab = useStore((s) => s.openDocumentTab);
  const createDocument = useStore((s) => s.createDocument);
  const trashDocument = useStore((s) => s.trashDocument);
  const trashDocuments = useStore((s) => s.trashDocuments);
  const importDocumentFromMarkdown = useStore((s) => s.importDocumentFromMarkdown);
  const importMarkdownDirectory = useStore((s) => s.importMarkdownDirectory);
  const exportDocumentBundle = useStore((s) => s.exportDocumentBundle);
  const importDocumentBundle = useStore((s) => s.importDocumentBundle);
  const addToast = useStore((s) => s.addToast);
  const renameDocument = useStore((s) => s.renameDocument);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const sidebarPinned = useStore((s) => s.sidebarPinned);
  const toggleSidebarPinned = useStore((s) => s.toggleSidebarPinned);
  const leftPanelHovered = useStore((s) => s.leftPanelHovered);

  // Folder store
  const folders = useStore((s) => s.folders);
  const createFolder = useStore((s) => s.createFolder);
  const renameFolder = useStore((s) => s.renameFolder);
  const trashFolder = useStore((s) => s.trashFolder);
  const toggleFolderCollapsed = useStore((s) => s.toggleFolderCollapsed);
  const moveDocumentToFolder = useStore((s) => s.moveDocumentToFolder);
  const moveDocumentsToFolder = useStore((s) => s.moveDocumentsToFolder);

  // Sort settings
  const docSortKey = useStore((s) => s.docSortKey);
  const docSortDirection = useStore((s) => s.docSortDirection);
  const setDocSortKey = useStore((s) => s.setDocSortKey);
  const setDocSortDirection = useStore((s) => s.setDocSortDirection);

  const { onResizeStart } = useSidebarResize();

  // ── UI state ──────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [moreMenuPos, setMoreMenuPos] = useState<{ x: number; y: number } | null>(null);
  /** Keeps the hover-expanded sidebar open while the search input is focused. */
  const [searchFocused, setSearchFocused] = useState(false);

  const [batchMenu, setBatchMenu] = useState<{ x: number; y: number } | null>(null);
  const [batchMoveMenu, setBatchMoveMenu] = useState<{ x: number; y: number } | null>(null);

  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const folderRenameRef = useRef<HTMLInputElement>(null);

  // ── Trash dialog state ────────────────────────────────────
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  // ── Backup & restore dialog state (lifted to uiSlice so the abnormal-shrink
  //     toast can open it from anywhere) ──
  const backupDialogDoc = useStore((s) => s.backupRestoreDialogDoc);

  // ── Suppress collapse while a floating menu / inline rename is active ──
  // Floating menus (context menu, folder menu, batch menus, the "more"
  // dropdown and its submenus) are `position: fixed` overlays.  Moving the
  // pointer onto one that extends past the sidebar's box can make the
  // browser fire `mouseleave` on the sidebar, which would otherwise start
  // the collapse timer and snap the sidebar shut while the user is still
  // interacting with the menu.  We therefore hold the sidebar open until
  // the menu closes, then re-evaluate on the next pointer move.
  const anyFloatingMenuOpen = !!(
    contextMenu || folderMenu || batchMenu || batchMoveMenu ||
    (moreMenuOpen && moreMenuPos)
  );
  // Modal dialogs (trash / backup-restore) are portaled to document.body and
  // cover the sidebar.  Without this, opening a dialog from a context menu
  // drops `suppressCollapse` the instant the menu closes, snapping the
  // hover-expanded sidebar shut while the dialog is still open.  Treating
  // dialogs like floating menus keeps the sidebar steady; when the dialog
  // closes, the useSidebarHover true->false re-evaluation kicks in and
  // collapses based on the current pointer position.
  const anyDialogOpen = trashDialogOpen || backupDialogDoc !== null;
  const suppressCollapse = anyFloatingMenuOpen || anyDialogOpen || renamingId !== null || renamingFolderId !== null || searchFocused;

  // ── Hover expand/collapse (extracted to useSidebarHover hook) ──
  const { hoverExpanded, handleHoverEnter, handleHoverLeave, handleTogglePin } = useSidebarHover({
    sidebarPinned,
    leftPanelHovered,
    toggleSidebarPinned,
    suppressCollapse,
  });

  const isCollapsed = !sidebarPinned && !hoverExpanded;
  const effectiveWidth = isCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  // ── Overlay mode (hover-expand without pinning) ────────────
  // When the sidebar expands on hover (unpinned), it overlays the content
  // area instead of pushing it.  A negative `margin-right` cancels out
  // the extra width so the flex layout still reserves only
  // `COLLAPSED_WIDTH` – the editor's width never changes and ProseMirror
  // never reflows.  This mirrors BrowserPanel's constant-width webview
  // approach.  When pinned, `margin-right` is 0 and the sidebar takes its
  // full width in the flex layout as before.
  const isOverlay = !sidebarPinned && !isCollapsed;
  const overlayShift = isOverlay ? effectiveWidth - COLLAPSED_WIDTH : 0;

  // ── Derived: folder expand state ──────────────────────────
  const isFolderExpanded = useCallback(
    (folderId: string) => {
      const f = folders.find((x) => x.id === folderId);
      return f ? !f.collapsed : true;
    },
    [folders],
  );

  // ── Derived: tree + search ────────────────────────────────
  const isSearching = searchQuery.trim().length > 0;
  const filteredDocs = useMemo(
    () =>
      isSearching
        ? docList.filter((d) => pinyinIncludes(d.title || '', searchQuery))
        : docList,
    [docList, searchQuery, isSearching],
  );
  const tree = useMemo(
    () => buildFolderTree(folders, filteredDocs, { sortKey: docSortKey, direction: docSortDirection }),
    [folders, filteredDocs, docSortKey, docSortDirection],
  );

  // ── Derived: mini-rail items for the collapsed strip (top-level entries,
  //    folders first then root docs — same order as the expanded tree) ──
  const railItems = useMemo(() => {
    const items: { id: string; kind: 'folder' | 'doc'; title: string }[] = [];
    for (const n of tree.subFolders) {
      if (n.folder) items.push({ id: n.folder.id, kind: 'folder', title: n.folder.name });
    }
    for (const d of tree.documents) {
      items.push({ id: d.id, kind: 'doc', title: d.title || t('doclist.untitled') });
    }
    return items;
  }, [tree, t]);

  // ── Effects: auto-close menus ─────────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!folderMenu) return;
    const close = () => setFolderMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [folderMenu]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (renamingFolderId && folderRenameRef.current) {
      folderRenameRef.current.focus();
      folderRenameRef.current.select();
    }
  }, [renamingFolderId]);

  // ── Effect: auto-close batch menus ────────────────────────
  useEffect(() => {
    if (!batchMenu) return;
    const close = () => setBatchMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [batchMenu]);

  useEffect(() => {
    if (!batchMoveMenu) return;
    const close = () => setBatchMoveMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [batchMoveMenu]);

  // ── Handlers: more menu / rename ──────────────────────────
  const captureMoreMenuPos = useCallback(() => {
    if (moreMenuRef.current) {
      const rect = moreMenuRef.current.getBoundingClientRect();
      setMoreMenuPos({ x: rect.left, y: rect.bottom + 4 });
    }
  }, []);

  const openMoreMenu = useCallback(() => {
    if (moreMenuCloseTimer.current) {
      clearTimeout(moreMenuCloseTimer.current);
      moreMenuCloseTimer.current = null;
    }
    captureMoreMenuPos();
    setMoreMenuOpen(true);
  }, [captureMoreMenuPos]);

  const scheduleCloseMoreMenu = useCallback(() => {
    if (moreMenuCloseTimer.current) clearTimeout(moreMenuCloseTimer.current);
    moreMenuCloseTimer.current = setTimeout(() => setMoreMenuOpen(false), 150);
  }, []);

  const startRename = useCallback((docId: string, currentTitle: string) => {
    setRenamingId(docId);
    setRenameValue(currentTitle);
    setContextMenu(null);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId) {
      renameDocument(renamingId, renameValue.trim());
      setRenamingId(null);
    }
  }, [renamingId, renameValue, renameDocument]);

  // ── Handlers: folder actions ──────────────────────────────
  const handleToggleFolder = useCallback(
    (folderId: string) => {
      toggleFolderCollapsed(folderId);
    },
    [toggleFolderCollapsed],
  );

  const handleCreateFolder = useCallback(() => {
    createFolder(tRef.current('doclist.untitledFolder'), null);
  }, [createFolder]);

  const handleCreateSubfolder = useCallback(
    (parentId: string) => {
      createFolder(tRef.current('doclist.untitledFolder'), parentId);
      setFolderMenu(null);
    },
    [createFolder],
  );

  const startFolderRename = useCallback((folderId: string, name: string) => {
    setRenamingFolderId(folderId);
    setFolderRenameValue(name);
    setFolderMenu(null);
  }, []);

  const commitFolderRename = useCallback(() => {
    if (renamingFolderId) {
      renameFolder(renamingFolderId, folderRenameValue.trim());
      setRenamingFolderId(null);
    }
  }, [renamingFolderId, folderRenameValue, renameFolder]);

  const handleDeleteFolder = useCallback(
    (folderId: string) => {
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;
      const msg = tRef.current('doclist.deleteFolderToTrashConfirm').replace('{name}', folder.name);
      if (window.confirm(msg)) {
        trashFolder(folderId);
      }
      setFolderMenu(null);
    },
    [folders, trashFolder],
  );

  // ── Handlers: path / import / export (extracted to useDocSidebarActions) ──
  const {
    handleOpenInFinder,
    handleCopyPath,
    handleCopyRelativePath,
    handleImportMarkdown,
    handleImportMarkdownDirectory,
    handleExportBundle,
    handleImportBundle,
    handleCopyAsMarkdown,
  } = useDocSidebarActions({
    importDocumentFromMarkdown,
    importMarkdownDirectory,
    exportDocumentBundle,
    importDocumentBundle,
    addToast,
    setContextMenu,
    t,
  });

  /**
   * After a successful drag the browser fires a synthetic `click` on the
   * source row.  This ref lets us swallow that single click.
   */
  const suppressClick = useRef(false);

  // ── Batch selection (extracted to useBatchSelection hook) ──
  const {
    selectedIds,
    setSelectedIds,
    lastClickedId,
    setLastClickedId,
    visibleItemIds,
    splitSelection,
    batchDelete,
    batchMove,
    handleDocClick,
    handleContextMenu,
  } = useBatchSelection({
    folders,
    tree,
    filteredDocs,
    isSearching,
    trashDocuments,
    trashFolder,
    moveDocumentsToFolder,
    openDocumentTab,
    setContextMenu,
    setFolderMenu,
    setBatchMenu,
    setBatchMoveMenu,
    suppressClick,
    t,
  });

  // ── Drag-and-drop (extracted to useDocDragDrop hook) ──
  const {
    draggingDocId,
    dragOverTarget,
    flashFolderId,
    dragArmed,
    onDocPointerDown,
  } = useDocDragDrop({
    docList,
    selectedIds,
    setSelectedIds,
    moveDocumentToFolder,
    moveDocumentsToFolder,
    renamingId,
    suppressClick,
  });

  // ── Main render ───────────────────────────────────────────
  const isRootDropTarget = dragOverTarget === ROOT_DROP_ID;

  // The sidebar header row (search / pin / more). Lives back in the sidebar
  // after the title-bar experiments (left = traffic-light conflict, right =
  // outline crowding); it sits at y=36, flush under the transparent title
  // bar, because the sidebar root punches up to the window top (-mt-9).
  const sidebarHeader = (
    <div className="h-9 shrink-0 flex items-center gap-1.5 px-3 mt-9">
      {/* Search — Aliyun "在目录中筛选" style: list-filter icon, slightly
          taller soft-fill box with a faint input-border edge, no visible
          border until focus (accent ring) */}
      <div
        className="flex-1 min-w-0 flex items-center gap-1.5 h-7 px-2 rounded-sm transition-colors duration-150 border border-[var(--vscode-input-border)] bg-[color-mix(in_srgb,var(--vscode-foreground)_5%,transparent)] focus-within:ring-1 focus-within:ring-[var(--vscode-focusBorder)]"
      >
        <ListFilter className="w-3.5 h-3.5 opacity-50 shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(e) => {
            if (handleNativeSelectAll(e)) return;
            if (e.key === 'Escape') {
              if (searchQuery) setSearchQuery('');
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={t('search.placeholder')}
          className="w-full min-w-0 bg-transparent text-body text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)] focus:outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="shrink-0 p-0.5 rounded text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] transition-colors duration-150 cursor-pointer"
            title={t('doclist.clearSearch')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Pin toggle */}
        <button
          onClick={handleTogglePin}
          // Pinned = accent icon, no background pill (ActivityBar color
          // story: accent = "this is where you are / this is on").
          className={`p-1 rounded-md transition-colors duration-150 cursor-pointer ${
            sidebarPinned
              ? 'text-[var(--vscode-focusBorder)] hover:bg-[var(--vscode-list-hoverBackground)]'
              : 'text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
          }`}
          title={sidebarPinned ? t('doclist.unpin') : t('doclist.pin')}
        >
          <Pin className="w-4 h-4" />
        </button>

        <div
          ref={moreMenuRef}
          onMouseEnter={openMoreMenu}
          onMouseLeave={scheduleCloseMoreMenu}
        >
          <button
            onClick={() => {
              captureMoreMenuPos();
              setMoreMenuOpen((v) => !v);
            }}
            className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] p-1 rounded-md transition-colors duration-150"
            title={t('doclist.moreActions')}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {moreMenuOpen && moreMenuPos && (
            <DocumentSidebarMoreMenu
              x={moreMenuPos.x}
              y={moreMenuPos.y}
              docSortKey={docSortKey}
              docSortDirection={docSortDirection}
              onClose={() => setMoreMenuOpen(false)}
              onNewDocument={() => createDocument()}
              onNewFolder={() => handleCreateFolder()}
              onImportMarkdown={() => handleImportMarkdown()}
              onImportMarkdownDirectory={() => handleImportMarkdownDirectory()}
              onImportBundle={() => handleImportBundle()}
              onSetSortKey={(key) => setDocSortKey(key)}
              onSetSortDirection={(dir) => setDocSortDirection(dir)}
              onOpenTrash={() => setTrashDialogOpen(true)}
            />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      data-sidebar-root
      // -mt-9 + height compensation: the sidebar surface punches up to the
      // window top (filling the former dead strip under the transparent
      // title bar); the header row / pin row carry mt-9 to stay BELOW it.
      className="shrink-0 flex flex-col select-none z-30 relative overflow-hidden -mt-9 h-[calc(100%+2.25rem)] bg-[var(--vscode-sideBar-background)]"
      style={{
        width: effectiveWidth,
        marginRight: -overlayShift,
        transition: 'width 180ms ease-out, margin-right 180ms ease-out',
      }}
      onMouseEnter={handleHoverEnter}
      onMouseLeave={handleHoverLeave}
    >
      {/* ── Collapsed mode: pin button + mini rail instrument ── */}
      {isCollapsed ? (
        <>
          <div className="h-9 shrink-0 flex items-center justify-center mt-9">
            <button
              onClick={handleTogglePin}
              className="p-1.5 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
              title={t('doclist.pin')}
            >
              <Pin className="w-4 h-4" />
            </button>
          </div>
          <CollapsedRail
            items={railItems}
            activeDocId={activeDocId}
            onOpenDoc={(id) => openDocumentTab(id)}
          />
        </>
      ) : (
        <>
      {sidebarHeader}
      {/* Documents + folders list (root drop zone). pl-2 insets rows so the
          rail (each root row's / folder wrapper's left border) forms one
          continuous vertical line; rows are gapless (no space-y) so the rail
          never breaks. The ACTIVE document is marked by a rail-tint + "->"
          cursor instead of a background highlight (SectionOutline language).
          border-transparent reserved: avoids WKWebView inset box-shadow
          paint glitches that ring-inset exhibits (see bug-graveyard #003). */}
      <div
        data-drop-target={ROOT_DROP_ID}
        className={`flex-1 overflow-y-auto rounded-md border pl-2 transition-colors duration-150 ${
          isRootDropTarget ? 'border-[var(--vscode-focusBorder)]' : 'border-transparent'
        }`}
      >
        {isSearching ? (
          <SearchResultsList
            filteredDocs={filteredDocs}
            activeDocId={activeDocId}
            selectedIds={selectedIds}
            draggingDocId={draggingDocId}
            onDocPointerDown={onDocPointerDown}
            handleDocClick={handleDocClick}
            handleContextMenu={handleContextMenu}
            startRename={startRename}
          />
        ) : (
          <DocumentTreeRenderer
            tree={tree}
            folders={folders}
            isFolderExpanded={isFolderExpanded}
            handleToggleFolder={handleToggleFolder}
            dragOverTarget={dragOverTarget}
            flashFolderId={flashFolderId}
            draggingDocId={draggingDocId}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            lastClickedId={lastClickedId}
            setLastClickedId={setLastClickedId}
            visibleItemIds={visibleItemIds}
            activeDocId={activeDocId}
            onDocPointerDown={onDocPointerDown}
            handleDocClick={handleDocClick}
            handleContextMenu={handleContextMenu}
            renamingId={renamingId}
            renameInputRef={renameInputRef}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            commitRename={commitRename}
            setRenamingId={setRenamingId}
            startRename={startRename}
            renamingFolderId={renamingFolderId}
            folderRenameRef={folderRenameRef}
            folderRenameValue={folderRenameValue}
            setFolderRenameValue={setFolderRenameValue}
            commitFolderRename={commitFolderRename}
            setRenamingFolderId={setRenamingFolderId}
            startFolderRename={startFolderRename}
          />
        )}
      </div>

      <TrashDialog open={trashDialogOpen} onClose={() => setTrashDialogOpen(false)} />

      {backupDialogDoc && (
        <BackupRestoreDialog
          docId={backupDialogDoc.id}
          docTitle={backupDialogDoc.title}
          onClose={() => useStore.getState().closeBackupRestore()}
        />
      )}

      {/* Folder context menu */}
      {folderMenu && (
        <FolderContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          folderId={folderMenu.folderId}
          onNewDocument={(folderId) => createDocument(folderId)}
          onCreateSubfolder={handleCreateSubfolder}
          onRenameFolder={(folderId) => {
            const f = folders.find((x) => x.id === folderId);
            if (f) startFolderRename(f.id, f.name);
          }}
          onImportMarkdown={(folderId) => handleImportMarkdown(folderId)}
          onImportMarkdownDirectory={(folderId) => handleImportMarkdownDirectory(folderId)}
          onDeleteFolder={handleDeleteFolder}
          onClose={() => setFolderMenu(null)}
        />
      )}

      {/* Document context menu */}
      {contextMenu && (
        <DocumentContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={() => {
            const doc = useStore.getState().documents.find((d) => d.id === contextMenu.docId);
            if (doc) startRename(doc.id, doc.title || '');
          }}
          onDelete={() => {
            trashDocument(contextMenu.docId);
            setContextMenu(null);
          }}
          onOpenInFinder={() => handleOpenInFinder(contextMenu.docId)}
          onCopyPath={() => handleCopyPath(contextMenu.docId)}
          onCopyRelativePath={() => handleCopyRelativePath(contextMenu.docId)}
          onExportBundle={() => handleExportBundle(contextMenu.docId)}
          onCopyAsMarkdown={() => handleCopyAsMarkdown(contextMenu.docId)}
          onBackupRestore={() => {
            const doc = useStore.getState().documents.find((d) => d.id === contextMenu.docId);
            useStore.getState().openBackupRestore(contextMenu.docId, doc?.title || '');
            setContextMenu(null);
          }}
        />
      )}

      {/* Batch context menu (right-click on multi-selection) */}
      {batchMenu && (
        <BatchContextMenu
          x={batchMenu.x}
          y={batchMenu.y}
          onMoveTo={() => setBatchMoveMenu({ x: batchMenu.x, y: batchMenu.y })}
          onDelete={batchDelete}
          onClose={() => setBatchMenu(null)}
        />
      )}

      {/* Batch move-to-folder menu (drops down from the action bar) */}
      {batchMoveMenu && (
        <BatchMoveMenu
          x={batchMoveMenu.x}
          y={batchMoveMenu.y}
          folders={folders}
          onMove={(folderId) => batchMove(folderId)}
          onClose={() => setBatchMoveMenu(null)}
        />
      )}

      {/* Resize handle - only when pinned */}
      {sidebarPinned && (
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-20 hover:bg-[var(--vscode-focusBorder)] active:bg-[var(--vscode-focusBorder)] transition-colors"
          style={{ marginRight: '-1px' }}
        />
      )}
        </>
      )}
    </div>
  );
}
