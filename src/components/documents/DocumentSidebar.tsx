import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { storage } from '../../lib/core/storage';
import { blocksToMarkdown } from '../../lib/editor/markdownExport';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useSidebarHover } from './hooks/useSidebarHover';
import { useBatchSelection } from './hooks/useBatchSelection';
import { buildFolderTree, type FolderTreeNode } from '../../lib/documents/folderTree';
import {
  FileText, Plus, MoreHorizontal, FileDown,
  FolderPlus, Folder, FolderOpen, ChevronRight, Trash2, FolderInput, FolderDown,
  X, PackageOpen, Check, ArrowUpNarrowWide, ArrowDownWideNarrow, ArrowDownUp,
  Pin, Search,
} from 'lucide-react';
import DocumentContextMenu from './DocumentContextMenu';
import TrashDialog from './TrashDialog';
import BackupRestoreDialog from './BackupRestoreDialog';
import { MenuList, MenuItem, MenuDivider, SubMenu } from '../ui/MenuList';
import { NavBranch, NavRow } from '../ui/NavTree';

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

/** Sentinel id for the root-level drop zone (no folder). */
const ROOT_DROP_ID = '__root__';

/** Minimum pointer movement (px) before a click becomes a drag. */
const DRAG_THRESHOLD = 5;

/** Width of the sidebar when collapsed (unpinned, not hovered). */
const COLLAPSED_WIDTH = 48;
/** Grace period before collapsing after the pointer leaves (ms). */

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
  const documents = useStore((s) => s.documents);
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
  // ── Backup & restore dialog state ──
  const [backupDialogDoc, setBackupDialogDoc] = useState<{ id: string; title: string } | null>(null);

  // ── Hover-expand state (only active when sidebarPinned is false) ──

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
  const suppressCollapse = anyFloatingMenuOpen || renamingId !== null || renamingFolderId !== null || searchFocused;





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


  // ── Pointer-drag state ────────────────────────────────────
  /**
   * Drag state lives entirely in a ref so pointermove never triggers
   * a React re-render on its own.  We promote to visual state only
   * when something the user can *see* changes (dragging on/off,
   * highlight target switch).
   */
  const drag = useRef({
    docId: '',
    startX: 0,
    startY: 0,
    active: false,   // true once the threshold is exceeded
    pointerId: -1,
  });

  /** Visual: which doc row is currently being dragged (dim it). */
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  /** Visual: which drop target is currently highlighted. */
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  /** Brief flash when a move succeeds. */
  const [flashFolderId, setFlashFolderId] = useState<string | null>(null);

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
        ? docList.filter((d) =>
            (d.title || '').toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : docList,
    [docList, searchQuery, isSearching],
  );
  const tree = useMemo(
    () => buildFolderTree(folders, filteredDocs, { sortKey: docSortKey, direction: docSortDirection }),
    [folders, filteredDocs, docSortKey, docSortDirection],
  );
  const rootDocCount = tree.documents.length;


  // ── Batch operations ──────────────────────────────────────

  /** Split the unified selection into document ids and folder ids. */



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
    createFolder(t('doclist.untitledFolder'), null);
  }, [createFolder, t]);

  const handleCreateSubfolder = useCallback(
    (parentId: string) => {
      createFolder(t('doclist.untitledFolder'), parentId);
      setFolderMenu(null);
    },
    [createFolder, t],
  );

  const handleFolderContextMenu = (e: React.MouseEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderMenu({ x: e.clientX, y: e.clientY, folderId });
  };

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
      const msg = t('doclist.deleteFolderToTrashConfirm').replace('{name}', folder.name);
      if (window.confirm(msg)) {
        trashFolder(folderId);
      }
      setFolderMenu(null);
    },
    [folders, trashFolder, t],
  );

  // ── Handlers: path / import ───────────────────────────────
  const handleOpenInFinder = useCallback(async (docId: string) => {
    try {
      await storage.openDocDir(docId);
    } catch (e) {
      console.error('Failed to open document folder:', e);
    }
    setContextMenu(null);
  }, []);

  const handleCopyPath = useCallback(async (docId: string) => {
    try {
      const path = await storage.getDocPath(docId);
      await navigator.clipboard.writeText(path);
    } catch (e) {
      console.error('Failed to copy path:', e);
    }
    setContextMenu(null);
  }, []);

  const handleCopyRelativePath = useCallback(async (docId: string) => {
    try {
      const path = await storage.getDocPath(docId);
      const home = await storage.init();
      let rel = path;
      if (path.startsWith(home)) {
        rel = path.slice(home.length).replace(/^[/\\]+/, '');
      }
      await navigator.clipboard.writeText(rel);
    } catch (e) {
      console.error('Failed to copy relative path:', e);
    }
    setContextMenu(null);
  }, []);

  const handleImportMarkdown = useCallback(async (folderId?: string) => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] }],
      });
      if (!filePath || typeof filePath !== 'string') return;
      const bytes = await storage.readFileBytes(filePath);
      const md = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
      const filename = filePath.split(/[/\\]/).pop() ?? 'Untitled.md';
      await importDocumentFromMarkdown(filename, md, folderId);
    } catch (e) {
      console.error('Failed to import Markdown:', e);
    }
  }, [importDocumentFromMarkdown]);

  const handleImportMarkdownDirectory = useCallback(async (folderId?: string) => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const dirPath = await open({ directory: true, multiple: false });
      if (!dirPath || typeof dirPath !== 'string') return;
      const count = await importMarkdownDirectory(dirPath, folderId);
      if (count === 0) {
        addToast('info', t('doclist.importDirEmpty'));
      } else {
        addToast('success', t('doclist.importDirSuccess', { count }));
      }
    } catch (e) {
      console.error('Failed to import Markdown directory:', e);
      addToast('error', t('doclist.importDirFailed'));
    }
  }, [importMarkdownDirectory, addToast, t]);

  // ── Handlers: lossless backup bundle (.jnote) ─────────────
  const handleExportBundle = useCallback(async (docId: string) => {
    setContextMenu(null);
    try {
      const ok = await exportDocumentBundle(docId);
      if (ok) addToast('success', t('doclist.exportBundleSuccess'));
    } catch (e) {
      console.error('Failed to export bundle:', e);
      addToast('error', t('doclist.exportBundleFailed'));
    }
  }, [exportDocumentBundle, addToast, t]);

  const handleImportBundle = useCallback(async (folderId?: string) => {
    try {
      const id = await importDocumentBundle(folderId);
      if (id) addToast('success', t('doclist.importBundleSuccess'));
    } catch (e) {
      console.error('Failed to import bundle:', e);
      addToast('error', t('doclist.importBundleFailed'));
    }
  }, [importDocumentBundle, addToast, t]);

  // ── Handler: copy document body as Markdown ────────────────
  const handleCopyAsMarkdown = useCallback(async (docId: string) => {
    setContextMenu(null);
    try {
      const doc = documents.find((d) => d.id === docId);
      if (!doc) return;
      const md = blocksToMarkdown(doc.blocks, {
        file: (name) => (name
          ? t('doclist.mdPlaceholderFile', { name })
          : t('doclist.mdPlaceholderFileEmpty')),
        diagram: t('doclist.mdPlaceholderDiagram'),
      });
      await navigator.clipboard.writeText(md);
      addToast('success', t('doclist.copyAsMarkdownSuccess'));
    } catch (e) {
      console.error('Failed to copy as Markdown:', e);
      addToast('error', t('doclist.copyAsMarkdownFailed'));
    }
  }, [documents, addToast, t]);

  // ── Pointer-based drag-and-drop ───────────────────────────
  //
  // The drag is split into three phases:
  //
  // 1. pointerdown on a doc row  →  record start position + docId.
  //    We do NOT enter "dragging" yet — a simple click should still
  //    open the document.
  //
  // 2. pointermove (global)      →  once movement exceeds DRAG_THRESHOLD,
  //    enter dragging mode.  From then on every move uses
  //    elementFromPoint() to find the `[data-drop-target]` under the
  //    cursor and highlights it.
  //
  // 3. pointerup (global)        →  if dragging, look up the drop target
  //    one final time and commit the move.  If not dragging (i.e. it
  //    was a click), do nothing — the row's onClick will fire next.

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

  /**
   * `true` between pointerdown and pointerup/cancel.
   * This *state* triggers the effect that attaches global listeners.
   */
  const [dragArmed, setDragArmed] = useState(false);

  const onDocPointerDown = (e: React.PointerEvent, docId: string) => {
    // Only left button
    if (e.button !== 0) return;
    // Don't interfere with text selection inside rename input
    if (renamingId === docId) return;

    drag.current = {
      docId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
    };
    setDragArmed(true);
  };

  // Global pointermove / pointerup — attached whenever a potential
  // drag is in progress (pointerdown happened but pointerup hasn't yet).
  useEffect(() => {
    if (!dragArmed) return;

    /** Find the drop-target id under a screen point, or null. */
    const findDropTarget = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const target = (el as HTMLElement).closest('[data-drop-target]') as HTMLElement | null;
      return target?.dataset.dropTarget ?? null;
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (d.pointerId === -1) return;

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      // Activate drag once threshold is crossed
      if (!d.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        d.active = true;
        setDraggingDocId(d.docId);
      }

      e.preventDefault();

      // Highlight the folder under the cursor
      const target = findDropTarget(e.clientX, e.clientY);
      setDragOverTarget(target);
    };

    const onUp = (e: PointerEvent) => {
      const d = drag.current;

      if (d.active) {
        // Commit the drop
        const target = findDropTarget(e.clientX, e.clientY);
        if (target) {
          const folderId = target === ROOT_DROP_ID ? null : target;

          // If the dragged doc is part of a multi-selection, move all
          // selected docs. Otherwise move just the one (and clear selection).
          if (selectedIds.size > 1 && selectedIds.has(d.docId)) {
            moveDocumentsToFolder([...selectedIds], folderId);
            setSelectedIds(new Set());
          } else {
            const doc = docList.find((x) => x.id === d.docId);
            const currentFolder = doc?.folderId ?? null;
            if (currentFolder !== folderId) {
              moveDocumentToFolder(d.docId, folderId);
            }
            setSelectedIds(new Set());
          }
          if (folderId) {
            setFlashFolderId(folderId);
            setTimeout(() => setFlashFolderId(null), 600);
          }
        }
        // Suppress the click that follows pointerup so we don't
        // accidentally open the document.
        suppressClick.current = true;
      }

      // Reset
      drag.current = { docId: '', startX: 0, startY: 0, active: false, pointerId: -1 };
      setDraggingDocId(null);
      setDragOverTarget(null);
      setDragArmed(false);
    };

    const onCancel = () => {
      drag.current = { docId: '', startX: 0, startY: 0, active: false, pointerId: -1 };
      setDraggingDocId(null);
      setDragOverTarget(null);
      setDragArmed(false);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [dragArmed, docList, moveDocumentToFolder, selectedIds, moveDocumentsToFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render helpers ────────────────────────────────────────

  /**
   * Render a single document row inside the folder tree.
   * Uses NavRow (secondary level) so it matches Settings sub-items.
   */
  const renderDoc = (doc: (typeof docList)[number]) => {
    const isActive = doc.id === activeDocId;
    const isDragging = draggingDocId === doc.id;
    const isRenaming = renamingId === doc.id;
    const isSelected = selectedIds.has(doc.id);

    return (
      <NavRow
        key={doc.id}
        level="secondary"
        active={isActive}
        selected={isSelected}
        noHover
        icon={<FileText className="w-4 h-4 opacity-50 shrink-0" />}
        onPointerDown={(e) => onDocPointerDown(e, doc.id)}
        onClick={(e) => handleDocClick(e, doc.id)}
        onContextMenu={(e) => handleContextMenu(e, doc.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename(doc.id, doc.title || '');
        }}
        style={{ opacity: isDragging ? 0.4 : undefined }}
        className={isDragging ? 'cursor-grabbing' : ''}
      >
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (handleNativeSelectAll(e)) return;
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            className="w-full h-6 text-body bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded px-1.5 focus:outline-none"
            placeholder={t('doclist.renamePlaceholder')}
          />
        ) : (
          doc.title || t('doclist.untitled')
        )}
      </NavRow>
    );
  };

  /**
   * Recursively render a folder node and its children.
   *
   * The folder row itself is a NavRow (can show drop highlight).
   * Its children are wrapped in a plain NavBranch (indentation only).
   */
  const renderNode = (node: FolderTreeNode, depth: number): React.ReactNode => {
    if (!node.folder) return null;
    const f = node.folder;
    const open = isFolderExpanded(f.id);
    const isDropTarget = dragOverTarget === f.id;
    const isFlashing = flashFolderId === f.id;
    const isRenaming = renamingFolderId === f.id;

    return (
      <div
        key={f.id}
        data-drop-target={f.id}
        className={`rounded-md transition-colors duration-150 ${
          isDropTarget || isFlashing
            ? 'ring-1 ring-inset ring-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
            : ''
        }`}
      >
        {/* Folder row */}
        <NavRow
          level="primary"
          highlighted={false}
          selected={selectedIds.has(f.id)}
          noHover
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) {
              // Toggle selection
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(f.id)) next.delete(f.id);
                else next.add(f.id);
                return next;
              });
              setLastClickedId(f.id);
            } else if (e.shiftKey && lastClickedId) {
              const start = visibleItemIds.indexOf(lastClickedId);
              const end = visibleItemIds.indexOf(f.id);
              if (start !== -1 && end !== -1) {
                const lo = Math.min(start, end);
                const hi = Math.max(start, end);
                setSelectedIds(new Set(visibleItemIds.slice(lo, hi + 1)));
              }
              setLastClickedId(f.id);
            } else {
              // Plain click: if there's a selection, clear it (don't toggle)
              if (selectedIds.size > 0) {
                setSelectedIds(new Set());
              } else {
                handleToggleFolder(f.id);
              }
              setLastClickedId(f.id);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, f.id, 'folder')}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startFolderRename(f.id, f.name);
          }}
          icon={open
            ? <FolderOpen className="w-5 h-5 opacity-70 shrink-0" />
            : <Folder className="w-5 h-5 opacity-70 shrink-0" />
          }
          expandable={!isRenaming}
          expanded={open}
        >
          {isRenaming ? (
            <input
              ref={folderRenameRef}
              type="text"
              value={folderRenameValue}
              onChange={(e) => setFolderRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitFolderRename}
              onKeyDown={(e) => {
                if (handleNativeSelectAll(e)) return;
                if (e.key === 'Enter') commitFolderRename();
                if (e.key === 'Escape') setRenamingFolderId(null);
              }}
              className="w-full h-6 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded px-1.5 focus:outline-none"
              placeholder={t('doclist.folderNamePlaceholder')}
            />
          ) : (
            f.name
          )}
        </NavRow>

        {/* Children – indentation only, no guide line */}
        {open && (
          <NavBranch plain className="mt-0.5 mb-1 ml-[18px]">
            {node.subFolders.map((sub) => renderNode(sub, depth + 1))}
            {node.documents.map((doc) => renderDoc(doc))}
          </NavBranch>
        )}
      </div>
    );
  };

  // ── Search mode: flat list (no indentation guides) ────────
  const renderSearchResults = () => {
    if (filteredDocs.length === 0) {
      return (
        <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
          {t('doclist.noMatch')}
        </p>
      );
    }
    return filteredDocs.map((doc) => (
      <NavRow
        key={doc.id}
        level="primary"
        plainActive
        active={doc.id === activeDocId}
        selected={selectedIds.has(doc.id)}
        noHover
        icon={<FileText className="w-5 h-5 opacity-70 shrink-0" />}
        onPointerDown={(e) => onDocPointerDown(e, doc.id)}
        onClick={(e) => handleDocClick(e, doc.id)}
        onContextMenu={(e) => handleContextMenu(e, doc.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename(doc.id, doc.title || '');
        }}
        className={draggingDocId === doc.id ? 'opacity-40 cursor-grabbing' : ''}
      >
        {doc.title || t('doclist.untitled')}
      </NavRow>
    ));
  };

  // ── Main render ───────────────────────────────────────────
  const isRootDropTarget = dragOverTarget === ROOT_DROP_ID;

  return (
    <div
      data-sidebar-root
      className="shrink-0 h-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col select-none z-30 relative overflow-hidden"
      style={{
        width: effectiveWidth,
        marginRight: -overlayShift,
        transition: 'width 180ms ease-out, margin-right 180ms ease-out, box-shadow 180ms ease-out',
        boxShadow: isOverlay ? '4px 0 12px rgba(0,0,0,0.3)' : '4px 0 12px rgba(0,0,0,0)',
      }}
      onMouseEnter={handleHoverEnter}
      onMouseLeave={handleHoverLeave}
    >
      {/* ── Collapsed mode: just a pin button ── */}
      {isCollapsed ? (
        <div className="h-9 shrink-0 flex items-center justify-center">
          <button
            onClick={handleTogglePin}
            className="p-1.5 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
            title={t('doclist.pin')}
          >
            <Pin className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
      {/* Header - aligned with the tab bar height (h-9); search is inline here */}
      <div className="h-9 shrink-0 flex items-center gap-1.5 px-3">
        <div
          className={`flex-1 min-w-0 flex items-center gap-1.5 h-6 px-1.5 rounded-md transition-colors duration-150 ${
            searchQuery || searchFocused
              ? 'bg-[var(--vscode-input-background)] ring-1 ring-[var(--vscode-input-border)]'
              : 'hover:bg-[var(--vscode-list-hoverBackground)]'
          } focus-within:bg-[var(--vscode-input-background)] focus-within:ring-1 focus-within:ring-[var(--vscode-focusBorder)]`}
        >
          <Search className="w-3.5 h-3.5 opacity-50 shrink-0" />
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
            className={`p-1 rounded-md transition-colors duration-150 cursor-pointer ${
              sidebarPinned
                ? 'text-[var(--vscode-foreground)] bg-[var(--vscode-list-activeSelectionBackground)] hover:bg-[var(--vscode-list-hoverBackground)]'
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
              <MenuList
                x={moreMenuPos.x}
                y={moreMenuPos.y}
                onClick={(e) => e.stopPropagation()}
              >
                <SubMenu label={t('doclist.new')} icon={<Plus />}>
                  <MenuItem
                    icon={<Plus />}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      createDocument();
                    }}
                  >
                    {t('doclist.newDocument')}
                  </MenuItem>
                  <MenuItem
                    icon={<FolderPlus />}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      handleCreateFolder();
                    }}
                  >
                    {t('doclist.newFolder')}
                  </MenuItem>
                </SubMenu>
                <SubMenu label={t('doclist.import')} icon={<FileDown />}>
                  <MenuItem
                    icon={<FileDown />}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      handleImportMarkdown();
                    }}
                  >
                    {t('doclist.importMarkdown')}
                  </MenuItem>
                  <MenuItem
                    icon={<FolderDown />}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      handleImportMarkdownDirectory();
                    }}
                  >
                    {t('doclist.importDirectory')}
                  </MenuItem>
                  <MenuItem
                    icon={<PackageOpen />}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      handleImportBundle();
                    }}
                  >
                    {t('doclist.importBundle')}
                  </MenuItem>
                </SubMenu>
                <MenuDivider />
                {/* ── Sort settings (nested submenu) ── */}
                <SubMenu
                  label={t('doclist.sortBy')}
                  icon={<ArrowDownUp />}
                >
                  <MenuItem
                    icon={docSortKey === 'created' ? <Check /> : <span className="w-4 h-4" />}
                    onClick={() => {
                      setDocSortKey('created');
                    }}
                  >
                    {t('doclist.sortByCreated')}
                  </MenuItem>
                  <MenuItem
                    icon={docSortKey === 'title' ? <Check /> : <span className="w-4 h-4" />}
                    onClick={() => {
                      setDocSortKey('title');
                    }}
                  >
                    {t('doclist.sortByTitle')}
                  </MenuItem>
                  <MenuDivider />
                  <MenuItem
                    icon={docSortDirection === 'asc' ? <ArrowUpNarrowWide /> : <span className="w-4 h-4" />}
                    onClick={() => {
                      setDocSortDirection('asc');
                    }}
                  >
                    {t('doclist.sortAscending')}
                  </MenuItem>
                  <MenuItem
                    icon={docSortDirection === 'desc' ? <ArrowDownWideNarrow /> : <span className="w-4 h-4" />}
                    onClick={() => {
                      setDocSortDirection('desc');
                    }}
                  >
                    {t('doclist.sortDescending')}
                  </MenuItem>
                </SubMenu>
                <MenuDivider />
                <MenuItem
                  icon={<Trash2 />}
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setTrashDialogOpen(true);
                  }}
                >
                  {t('doclist.trash')}
                </MenuItem>
              </MenuList>
            )}
          </div>
        </div>
      </div>

      {/* Documents + folders list (root drop zone) */}
      <div
        data-drop-target={ROOT_DROP_ID}
        className={`flex-1 overflow-y-auto rounded-md px-3 space-y-0.5 transition-colors duration-150 ${
          isRootDropTarget ? 'ring-1 ring-inset ring-[var(--vscode-focusBorder)]' : ''
        }`}
      >
        {isSearching ? (
          renderSearchResults()
        ) : (
          <>
            {tree.subFolders.map((node) => renderNode(node, 0))}
            {rootDocCount === 0 && folders.length === 0 ? (
              <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
                {t('doclist.noMatch')}
              </p>
            ) : (
              tree.documents.map((doc) => (
                <NavRow
                  key={doc.id}
                  level="primary"
                  plainActive
                  active={doc.id === activeDocId}
                  selected={selectedIds.has(doc.id)}
                  noHover
                  icon={<FileText className="w-5 h-5 opacity-70 shrink-0" />}
                  onPointerDown={(e) => onDocPointerDown(e, doc.id)}
                  onClick={(e) => handleDocClick(e, doc.id)}
                  onContextMenu={(e) => handleContextMenu(e, doc.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(doc.id, doc.title || '');
                  }}
                  className={draggingDocId === doc.id ? 'opacity-40 cursor-grabbing' : ''}
                >
                  {doc.title || t('doclist.untitled')}
                </NavRow>
              ))
            )}
          </>
        )}
      </div>

      <TrashDialog open={trashDialogOpen} onClose={() => setTrashDialogOpen(false)} />

      {backupDialogDoc && (
        <BackupRestoreDialog
          docId={backupDialogDoc.id}
          docTitle={backupDialogDoc.title}
          onClose={() => setBackupDialogDoc(null)}
        />
      )}

      {/* Folder context menu */}
      {folderMenu && (
        <MenuList
          x={folderMenu.x}
          y={folderMenu.y}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            icon={<FileText />}
            onClick={() => {
              createDocument(folderMenu.folderId);
              setFolderMenu(null);
            }}
          >
            {t('doclist.newDocument')}
          </MenuItem>
          <MenuDivider />
          <MenuItem
            icon={<FolderPlus />}
            onClick={() => handleCreateSubfolder(folderMenu.folderId)}
          >
            {t('doclist.newSubfolder')}
          </MenuItem>
          <MenuItem
            icon={<FolderInput />}
            onClick={() => {
              const f = folders.find((x) => x.id === folderMenu.folderId);
              if (f) startFolderRename(f.id, f.name);
            }}
          >
            {t('doclist.renameFolder')}
          </MenuItem>
          <MenuDivider />
          <MenuItem
            icon={<FileDown />}
            onClick={() => {
              handleImportMarkdown(folderMenu.folderId);
              setFolderMenu(null);
            }}
          >
            {t('doclist.importMarkdown')}
          </MenuItem>
          <MenuItem
            icon={<FolderDown />}
            onClick={() => {
              handleImportMarkdownDirectory(folderMenu.folderId);
              setFolderMenu(null);
            }}
          >
            {t('doclist.importDirectory')}
          </MenuItem>
          <MenuDivider />
          <MenuItem
            variant="danger"
            icon={<Trash2 />}
            onClick={() => handleDeleteFolder(folderMenu.folderId)}
          >
            {t('doclist.moveToTrash')}
          </MenuItem>
        </MenuList>
      )}

      {/* Document context menu */}
      {contextMenu && (
        <DocumentContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={() => {
            const doc = documents.find((d) => d.id === contextMenu.docId);
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
            const doc = documents.find((d) => d.id === contextMenu.docId);
            setBackupDialogDoc({ id: contextMenu.docId, title: doc?.title || '' });
            setContextMenu(null);
          }}
        />
      )}

      {/* Batch context menu (right-click on multi-selection) */}
      {batchMenu && (
        <MenuList
          x={batchMenu.x}
          y={batchMenu.y}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            icon={<FolderInput />}
            onClick={() => {
              setBatchMoveMenu({ x: batchMenu.x, y: batchMenu.y });
              setBatchMenu(null);
            }}
          >
            {t('doclist.batchMove')}
          </MenuItem>
          <MenuDivider />
          <MenuItem
            variant="danger"
            icon={<Trash2 />}
            onClick={batchDelete}
          >
            {t('doclist.batchMoveToTrash')}
          </MenuItem>
        </MenuList>
      )}

      {/* Batch move-to-folder menu (drops down from the action bar) */}
      {batchMoveMenu && (
        <MenuList
          x={batchMoveMenu.x}
          y={batchMoveMenu.y}
          onClick={(e) => e.stopPropagation()}
          className="max-h-64 overflow-y-auto"
        >
          <MenuItem
            icon={<FileText className="w-4 h-4" />}
            onClick={() => batchMove(null)}
          >
            {t('doclist.rootLevel')}
          </MenuItem>
          {folders.length > 0 && <MenuDivider />}
          {folders.map((f) => (
            <MenuItem
              key={f.id}
              icon={<Folder className="w-4 h-4" />}
              onClick={() => batchMove(f.id)}
            >
              {f.name}
            </MenuItem>
          ))}
        </MenuList>
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
