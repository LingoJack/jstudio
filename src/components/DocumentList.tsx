import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { storage } from '../lib/storage';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { buildFolderTree, type FolderTreeNode } from '../lib/folderTree';
import {
  FileText, Plus, MoreHorizontal, FileDown,
  FolderPlus, Folder, FolderOpen, ChevronRight, Trash2, FolderInput, FolderDown,
  X,
} from 'lucide-react';
import DocumentContextMenu from './DocumentContextMenu';
import TrashDialog from './TrashDialog';
import { MenuList, MenuItem, MenuDivider } from './ui/MenuList';
import { NavBranch, NavRow } from './ui/NavTree';

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

/** Sentinel id for the root-level drop zone (no folder). */
const ROOT_DROP_ID = '__root__';

/** Minimum pointer movement (px) before a click becomes a drag. */
const DRAG_THRESHOLD = 5;

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

export default function DocumentList() {
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
  const addToast = useStore((s) => s.addToast);
  const renameDocument = useStore((s) => s.renameDocument);
  const searchQuery = useStore((s) => s.searchQuery);
  const sidebarWidth = useStore((s) => s.sidebarWidth);

  // Folder store
  const folders = useStore((s) => s.folders);
  const createFolder = useStore((s) => s.createFolder);
  const renameFolder = useStore((s) => s.renameFolder);
  const trashFolder = useStore((s) => s.trashFolder);
  const toggleFolderCollapsed = useStore((s) => s.toggleFolderCollapsed);
  const moveDocumentToFolder = useStore((s) => s.moveDocumentToFolder);
  const moveDocumentsToFolder = useStore((s) => s.moveDocumentsToFolder);

  const { onResizeStart } = useSidebarResize();

  // ── UI state ──────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Batch selection state ─────────────────────────────────
  /** Unified selection set — contains both document ids and folder ids. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [batchMenu, setBatchMenu] = useState<{ x: number; y: number } | null>(null);
  const [batchMoveMenu, setBatchMoveMenu] = useState<{ x: number; y: number } | null>(null);

  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const folderRenameRef = useRef<HTMLInputElement>(null);

  // ── Trash dialog state ────────────────────────────────────
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);

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
    () => buildFolderTree(folders, filteredDocs),
    [folders, filteredDocs],
  );
  const rootDocCount = tree.documents.length;

  // ── Derived: ordered visible item ids (docs + folders, for shift+click range) ──
  const visibleItemIds = useMemo(() => {
    const ids: string[] = [];
    const collect = (nodes: FolderTreeNode[]) => {
      for (const node of nodes) {
        if (node.folder) ids.push(node.folder.id);
        for (const doc of node.documents) ids.push(doc.id);
        if (node.folder && !node.folder.collapsed) collect(node.subFolders);
      }
    };
    if (isSearching) {
      return filteredDocs.map((d) => d.id);
    }
    collect(tree.subFolders);
    for (const doc of tree.documents) ids.push(doc.id);
    return ids;
  }, [tree, isSearching, filteredDocs]);

  // ── Batch operations ──────────────────────────────────────

  /** Split the unified selection into document ids and folder ids. */
  const splitSelection = useCallback(() => {
    const folderIdSet = new Set(folders.map((f) => f.id));
    const selectedDocs: string[] = [];
    const selectedFolders: string[] = [];
    for (const id of selectedIds) {
      if (folderIdSet.has(id)) selectedFolders.push(id);
      else selectedDocs.push(id);
    }
    return { selectedDocs, selectedFolders };
  }, [selectedIds, folders]);

  const batchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const msg = t('doclist.batchMoveToTrashConfirm', { count: selectedIds.size });
    if (!window.confirm(msg)) return;
    const { selectedDocs, selectedFolders } = splitSelection();
    if (selectedDocs.length > 0) trashDocuments(selectedDocs);
    if (selectedFolders.length > 0) selectedFolders.forEach((id) => trashFolder(id));
    setSelectedIds(new Set());
    setBatchMenu(null);
  }, [selectedIds, splitSelection, trashDocuments, trashFolder, t]);

  const batchMove = useCallback((folderId: string | null) => {
    if (selectedIds.size === 0) return;
    const { selectedDocs } = splitSelection();
    if (selectedDocs.length > 0) moveDocumentsToFolder(selectedDocs, folderId);
    setSelectedIds(new Set());
    setBatchMoveMenu(null);
    setBatchMenu(null);
  }, [selectedIds, splitSelection, moveDocumentsToFolder]);

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

  // ── Effect: Escape clears batch selection ─────────────────
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIds(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds]);

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
  const openMoreMenu = useCallback(() => {
    if (moreMenuCloseTimer.current) {
      clearTimeout(moreMenuCloseTimer.current);
      moreMenuCloseTimer.current = null;
    }
    setMoreMenuOpen(true);
  }, []);

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

  const handleContextMenu = (e: React.MouseEvent, id: string, kind: 'doc' | 'folder' = 'doc') => {
    e.preventDefault();
    e.stopPropagation();
    // If right-clicking on an item that's already in a multi-selection,
    // show the batch menu. Otherwise, clear selection and show single menu.
    if (selectedIds.size > 1 && selectedIds.has(id)) {
      setBatchMenu({ x: e.clientX, y: e.clientY });
      return;
    }
    setSelectedIds(new Set());
    if (kind === 'folder') {
      setFolderMenu({ x: e.clientX, y: e.clientY, folderId: id });
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY, docId: id });
    }
  };

  /**
   * Unified document click handler supporting multi-select:
   * - Cmd/Ctrl+Click: toggle selection
   * - Shift+Click: range select from last clicked doc
   * - Plain click: open doc, clear selection
   */
  const handleDocClick = useCallback((e: React.MouseEvent, docId: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(docId)) next.delete(docId);
        else next.add(docId);
        return next;
      });
      setLastClickedId(docId);
    } else if (e.shiftKey && lastClickedId) {
      const start = visibleItemIds.indexOf(lastClickedId);
      const end = visibleItemIds.indexOf(docId);
      if (start !== -1 && end !== -1) {
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        setSelectedIds(new Set(visibleItemIds.slice(lo, hi + 1)));
      }
      setLastClickedId(docId);
    } else {
      // If there's an existing multi-selection, a plain click clears it
      // without opening the document (so user can "click away" to deselect).
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        return;
      }
      setSelectedIds(new Set());
      setLastClickedId(docId);
      openDocumentTab(docId);
    }
  }, [lastClickedId, visibleItemIds, selectedIds, openDocumentTab]);

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
            size={Math.max(renameValue.length, 1)}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            className="max-w-full h-6 text-[13px] bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded px-1.5 focus:outline-none"
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
   * The folder row itself is a NavLeaf (can show drop highlight line).
   * Its children are wrapped in a NavBranch (gray guide line) so the
   * green active lines of all descendants are perfectly continuous.
   */
  const renderNode = (node: FolderTreeNode, depth: number): React.ReactNode => {
    if (!node.folder) return null;
    const f = node.folder;
    const open = isFolderExpanded(f.id);
    const isDropTarget = dragOverTarget === f.id;
    const isFlashing = flashFolderId === f.id;
    const isRenaming = renamingFolderId === f.id;

    return (
      <div key={f.id}>
        {/* Folder row — also a drop target */}
        <NavRow
          level="primary"
          highlighted={isDropTarget || isFlashing}
          selected={selectedIds.has(f.id)}
          data-drop-target={f.id}
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
              size={Math.max(folderRenameValue.length, 1)}
              onChange={(e) => setFolderRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitFolderRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitFolderRename();
                if (e.key === 'Escape') setRenamingFolderId(null);
              }}
              className="max-w-full h-6 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded px-1.5 focus:outline-none"
              placeholder={t('doclist.folderNamePlaceholder')}
            />
          ) : (
            f.name
          )}
        </NavRow>

        {/* Children wrapped in NavBranch for continuous guide line */}
        {open && (
          <NavBranch className="mt-0.5 mb-1 ml-[18px]">
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
      className="shrink-0 h-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col py-5 select-none z-10 relative"
      style={{ width: sidebarWidth }}
    >
      {/* Header — aligned with Settings.tsx */}
      <div className="flex items-center justify-between px-5 mb-5 shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          {t('doclist.allDocuments')}
        </h2>
        <div className="flex items-center gap-0.5 -mr-1.5">
          <div
            className="relative"
            onMouseEnter={openMoreMenu}
            onMouseLeave={scheduleCloseMoreMenu}
          >
            <button
              onClick={() => setMoreMenuOpen((v) => !v)}
              className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] p-1 rounded-md transition-colors duration-150"
              title={t('doclist.moreActions')}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {moreMenuOpen && (
              <MenuList
                className="absolute left-0 top-full mt-1"
                onClick={(e) => e.stopPropagation()}
              >
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
                <MenuDivider />
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

      {/* Batch selection action bar (shown when documents are selected) */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-1.5 mx-5 mb-2 px-3 py-2 rounded-md bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] shrink-0">
          <span className="text-xs text-[var(--vscode-foreground)] flex-1 truncate font-medium">
            {t('doclist.batchSelected', { count: selectedIds.size })}
          </span>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setBatchMoveMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
              className="flex items-center justify-center w-7 h-7 rounded text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-activeSelectionBackground)] transition-colors"
              title={t('doclist.batchMove')}
            >
              <FolderInput className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              batchDelete();
            }}
            className="flex items-center justify-center w-7 h-7 rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-activeSelectionBackground)] transition-colors"
            title={t('doclist.batchDelete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIds(new Set());
            }}
            className="flex items-center justify-center w-7 h-7 rounded text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-activeSelectionBackground)] transition-colors"
            title={t('doclist.batchClear')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Documents + folders list (root drop zone) */}
      <div
        data-drop-target={ROOT_DROP_ID}
        className={`flex-1 overflow-y-auto px-3 space-y-0.5 transition-colors duration-150 ${
          isRootDropTarget ? 'ring-1 ring-inset ring-[var(--vscode-focusBorder)] rounded-md' : ''
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

      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-20 hover:bg-[var(--vscode-focusBorder)] active:bg-[var(--vscode-focusBorder)] transition-colors"
        style={{ marginRight: '-1px' }}
      />
    </div>
  );
}
