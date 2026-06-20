import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { storage } from '../lib/storage';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { buildFolderTree, type FolderTreeNode } from '../lib/folderTree';
import {
  FolderDot, FileText, Plus, MoreHorizontal, FileDown,
  FolderPlus, Folder, FolderOpen, ChevronRight, Trash2, FolderInput,
} from 'lucide-react';
import DocumentContextMenu from './DocumentContextMenu';
import { MenuList, MenuItem, MenuDivider } from './ui/MenuList';

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

/** MIME type used to identify a dragged document during HTML5 DnD. */
const DRAG_MIME = 'application/x-jstudio-doc';

/** Sentinel id for the root-level drop zone (no folder). */
const ROOT_DROP_ID = '__root__';

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

  // ── Drag-and-drop state ───────────────────────────────────
  /** The doc id being dragged (ref — no re-render needed on start/end). */
  const draggedDocId = useRef<string | null>(null);
  /** The current drop target id (`ROOT_DROP_ID` or a folder id). Drives highlight. */
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  /** Brief flash when a move succeeds — drives a pulse animation. */
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

  // ── Drag-and-drop handlers ────────────────────────────────

  /** Fired on the **document** row when a drag starts. */
  const handleDragStart = (e: React.DragEvent, docId: string) => {
    draggedDocId.current = docId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, docId);
    // Transparent image so the browser ghost doesn't look janky
    const ghost = document.createElement('div');
    ghost.style.opacity = '0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
  };

  const handleDragEnd = () => {
    draggedDocId.current = null;
    setDragOverTarget(null);
  };

  /**
   * Shared drag-over logic for folder rows and the root drop zone.
   * `targetId` is either `ROOT_DROP_ID` or a folder id.
   */
  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!draggedDocId.current) return;
    e.preventDefault(); // allow drop
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTarget !== targetId) setDragOverTarget(targetId);
  };

  const handleDragLeave = (e: React.DragEvent, targetId: string) => {
    // Only clear if we're truly leaving this element (not entering a child)
    const related = e.relatedTarget as Node | null;
    const current = e.currentTarget as Node;
    if (related && current.contains(related)) return;
    if (dragOverTarget === targetId) setDragOverTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const docId = e.dataTransfer.getData(DRAG_MIME) || draggedDocId.current;
    if (!docId) return;

    const folderId = targetId === ROOT_DROP_ID ? null : targetId;

    // Check current folder to avoid no-op
    const doc = docList.find((d) => d.id === docId);
    const currentFolder = doc?.folderId ?? null;
    if (currentFolder === folderId) {
      setDragOverTarget(null);
      return;
    }

    moveDocumentToFolder(docId, folderId);

    // Flash the target to confirm success
    if (folderId) {
      setFlashFolderId(folderId);
      setTimeout(() => setFlashFolderId(null), 600);
    }

    draggedDocId.current = null;
    setDragOverTarget(null);
  };

  // ── Render helpers ────────────────────────────────────────

  /** Render a single document row (draggable). */
  const renderDoc = (doc: (typeof docList)[number], depth: number) => {
    const isActive = doc.id === activeDocId;
    const isRenaming = renamingId === doc.id;
    const isDragging = draggedDocId.current === doc.id;
    return (
      <div
        key={doc.id}
        draggable={!isRenaming}
        onDragStart={(e) => handleDragStart(e, doc.id)}
        onDragEnd={handleDragEnd}
        onClick={() => openDocument(doc.id)}
        onContextMenu={(e) => handleContextMenu(e, doc.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename(doc.id, doc.title || '');
        }}
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          opacity: isDragging ? 0.4 : undefined,
        }}
        className={`group flex h-9 items-center justify-between pr-2 rounded-md cursor-pointer transition-all duration-150 ${
          isActive
            ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
            : 'hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-sideBar-foreground)]'
        } ${isDragging ? 'cursor-grabbing' : ''}`}
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
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            className="flex-1 min-w-0 h-6 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded px-1.5 focus:outline-none"
            placeholder={t('doclist.renamePlaceholder')}
          />
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="w-4 h-4 opacity-50 shrink-0" />
            <span className="text-sm truncate">
              {doc.title || t('doclist.untitled')}
            </span>
          </div>
        )}
      </div>
    );
  };

  /** Recursively render a folder node and its children. */
  const renderNode = (node: FolderTreeNode, depth: number): React.ReactNode => {
    if (!node.folder) return null;
    const f = node.folder;
    const open = isFolderExpanded(f.id);
    const isRenaming = renamingFolderId === f.id;
    const isDropTarget = dragOverTarget === f.id;
    const isFlashing = flashFolderId === f.id;

    return (
      <div key={f.id}>
        {/* Folder row — also a drop target */}
        <div
          onClick={() => handleToggleFolder(f.id)}
          onContextMenu={(e) => handleFolderContextMenu(e, f.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startFolderRename(f.id, f.name);
          }}
          onDragOver={(e) => handleDragOver(e, f.id)}
          onDragLeave={(e) => handleDragLeave(e, f.id)}
          onDrop={(e) => handleDrop(e, f.id)}
          style={{ paddingLeft: `${4 + depth * 16}px` }}
          className={`group flex h-9 items-center gap-1.5 pr-2 rounded-md cursor-pointer transition-all duration-200 text-[var(--vscode-sideBar-foreground)] ${
            isFlashing
              ? 'bg-[var(--vscode-focusBorder)]'
              : isDropTarget
                ? 'bg-[var(--vscode-list-activeSelectionBackground)] ring-1 ring-[var(--vscode-focusBorder)]'
                : 'hover:bg-[var(--vscode-list-hoverBackground)]'
          }`}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 opacity-50 transition-transform duration-200 shrink-0 ${
              open ? 'rotate-90' : ''
            }`}
          />
          {isDropTarget || open ? (
            <FolderOpen
              className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                isDropTarget ? 'text-[var(--vscode-focusBorder)]' : 'opacity-60'
              }`}
            />
          ) : (
            <Folder className="w-4 h-4 opacity-60 shrink-0" />
          )}
          {isRenaming ? (
            <input
              ref={folderRenameRef}
              type="text"
              value={folderRenameValue}
              onChange={(e) => setFolderRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitFolderRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitFolderRename();
                if (e.key === 'Escape') setRenamingFolderId(null);
              }}
              className="flex-1 min-w-0 h-6 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded px-1.5 focus:outline-none"
              placeholder={t('doclist.folderNamePlaceholder')}
            />
          ) : (
            <span
              className={`text-sm truncate flex-1 transition-colors duration-200 ${
                isDropTarget ? 'text-[var(--vscode-foreground)] font-medium' : ''
              }`}
            >
              {f.name}
            </span>
          )}
        </div>

        {/* Children */}
        {open && (
          <div>
            {node.subFolders.map((sub) => renderNode(sub, depth + 1))}
            {node.documents.map((doc) => renderDoc(doc, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ── Search mode: flat list ────────────────────────────────
  const renderSearchResults = () => {
    if (filteredDocs.length === 0) {
      return (
        <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
          {t('doclist.noMatch')}
        </p>
      );
    }
    return filteredDocs.map((doc) => renderDoc(doc, 0));
  };

  // ── Main render ───────────────────────────────────────────
  const totalCount = docList.length;
  const isRootDropTarget = dragOverTarget === ROOT_DROP_ID;

  return (
    <div
      className="shrink-0 h-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col p-2 select-none z-10 relative"
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 mb-1.5 shrink-0">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)] flex items-center gap-1.5">
          <FolderDot className="w-4 h-4" />
          <span>
            {t('doclist.allDocuments')} {totalCount}
          </span>
        </h4>
        <div className="flex items-center gap-0.5">
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
              </MenuList>
            )}
          </div>
          <button
            onClick={createDocument}
            className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] p-1 rounded-md transition-colors duration-150"
            title={t('doclist.newDocument')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Documents + folders list */}
      <div
        className={`flex-1 overflow-y-auto space-y-0.5 pr-0.5 transition-colors duration-200 ${
          isRootDropTarget
            ? 'rounded-lg bg-[var(--vscode-list-activeSelectionBackground)] ring-1 ring-[var(--vscode-focusBorder)]'
            : ''
        }`}
        onDragOver={(e) => handleDragOver(e, ROOT_DROP_ID)}
        onDragLeave={(e) => handleDragLeave(e, ROOT_DROP_ID)}
        onDrop={(e) => handleDrop(e, ROOT_DROP_ID)}
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
              tree.documents.map((doc) => renderDoc(doc, 0))
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
