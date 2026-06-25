import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { storage } from '../lib/storage';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { buildFolderTree, type FolderTreeNode } from '../lib/folderTree';
import {
  FileText, Plus, MoreHorizontal, FileDown,
  FolderPlus, Folder, FolderOpen, ChevronRight, Trash2, FolderInput, FolderDown,
} from 'lucide-react';
import DocumentContextMenu from './DocumentContextMenu';
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
  const openDocument = useStore((s) => s.openDocument);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const createDocument = useStore((s) => s.createDocument);
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
  const deleteFolder = useStore((s) => s.deleteFolder);
  const toggleFolderCollapsed = useStore((s) => s.toggleFolderCollapsed);
  const moveDocumentToFolder = useStore((s) => s.moveDocumentToFolder);

  const { onResizeStart } = useSidebarResize();

  // ── UI state ──────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const folderRenameRef = useRef<HTMLInputElement>(null);

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

  const handleContextMenu = (e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, docId });
  };

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
      const msg = t('doclist.deleteFolderConfirm').replace('{name}', folder.name);
      if (window.confirm(msg)) {
        deleteFolder(folderId);
      }
      setFolderMenu(null);
    },
    [folders, deleteFolder, t],
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

  const handleImportMarkdown = useCallback(async () => {
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
      await importDocumentFromMarkdown(filename, md);
    } catch (e) {
      console.error('Failed to import Markdown:', e);
    }
  }, [importDocumentFromMarkdown]);

  const handleImportMarkdownDirectory = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const dirPath = await open({ directory: true, multiple: false });
      if (!dirPath || typeof dirPath !== 'string') return;
      const count = await importMarkdownDirectory(dirPath);
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
          const doc = docList.find((x) => x.id === d.docId);
          const currentFolder = doc?.folderId ?? null;
          if (currentFolder !== folderId) {
            moveDocumentToFolder(d.docId, folderId);
            if (folderId) {
              setFlashFolderId(folderId);
              setTimeout(() => setFlashFolderId(null), 600);
            }
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
  }, [dragArmed, docList, moveDocumentToFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render helpers ────────────────────────────────────────

  /**
   * Render a single document row inside the folder tree.
   * Uses NavRow (secondary level) so it matches Settings sub-items.
   */
  const renderDoc = (doc: (typeof docList)[number]) => {
    const isActive = doc.id === activeDocId;
    const isDragging = draggingDocId === doc.id;
    const isRenaming = renamingId === doc.id;

    return (
      <NavRow
        key={doc.id}
        level="secondary"
        active={isActive}
        icon={<FileText className="w-4 h-4 opacity-50 shrink-0" />}
        onPointerDown={(e) => onDocPointerDown(e, doc.id)}
        onClick={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          openDocument(doc.id);
        }}
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
          data-drop-target={f.id}
          onClick={() => handleToggleFolder(f.id)}
          onContextMenu={(e) => handleFolderContextMenu(e, f.id)}
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
        icon={<FileText className="w-5 h-5 opacity-70 shrink-0" />}
        onPointerDown={(e) => onDocPointerDown(e, doc.id)}
        onClick={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          openDocument(doc.id);
        }}
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
                  icon={<FolderPlus />}
                  onClick={() => {
                    setMoreMenuOpen(false);
                    handleCreateFolder();
                  }}
                >
                  {t('doclist.newFolder')}
                </MenuItem>
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
              </MenuList>
            )}
          </div>
          <button
            onClick={() => createDocument()}
            className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] p-1 rounded-md transition-colors duration-150"
            title={t('doclist.newDocument')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Documents + folders list (root drop zone) */}
      <div
        data-drop-target={ROOT_DROP_ID}
        className="flex-1 overflow-y-auto px-3 space-y-0.5"
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
                  icon={<FileText className="w-5 h-5 opacity-70 shrink-0" />}
                  onPointerDown={(e) => onDocPointerDown(e, doc.id)}
                  onClick={(e) => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    openDocument(doc.id);
                  }}
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
            variant="danger"
            icon={<Trash2 />}
            onClick={() => handleDeleteFolder(folderMenu.folderId)}
          >
            {t('doclist.deleteFolder')}
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
            deleteDocument(contextMenu.docId);
            setContextMenu(null);
          }}
          onOpenInFinder={() => handleOpenInFinder(contextMenu.docId)}
          onCopyPath={() => handleCopyPath(contextMenu.docId)}
          onCopyRelativePath={() => handleCopyRelativePath(contextMenu.docId)}
        />
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
