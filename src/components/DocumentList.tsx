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

interface ContextMenuState {
  x: number;
  y: number;
  docId: string;
}

/** Context-menu state for folder right-click. */
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

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Folder UI state
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const folderRenameRef = useRef<HTMLInputElement>(null);
  const [moveMenuDocId, setMoveMenuDocId] = useState<string | null>(null);
  const [moveMenuPos, setMoveMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Folder expand/collapse state is derived directly from the persisted
  // `collapsed` field on FolderMeta — single source of truth, survives reload.
  const isFolderExpanded = useCallback(
    (folderId: string) => {
      const f = folders.find((x) => x.id === folderId);
      return f ? !f.collapsed : true;
    },
    [folders],
  );

  // ── Derived: tree + search results ────────────────────────
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

  // ── Effects: close menus on outside action ────────────────
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
    if (!moveMenuDocId) return;
    const close = () => {
      setMoveMenuDocId(null);
      setMoveMenuPos(null);
    };
    // Delay to allow the click that opened the menu to pass first.
    const timer = setTimeout(() => {
      window.addEventListener('click', close);
      window.addEventListener('blur', close);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [moveMenuDocId]);

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

  // ── Document rename ───────────────────────────────────────
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

  // ── Folder actions ────────────────────────────────────────
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

  // ── Path actions (Finder, copy) ───────────────────────────
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

  const handleMoveToFolder = useCallback(
    (docId: string, folderId: string | null) => {
      moveDocumentToFolder(docId, folderId);
      setMoveMenuDocId(null);
      setMoveMenuPos(null);
      setContextMenu(null);
    },
    [moveDocumentToFolder],
  );

  // ── Render helpers ────────────────────────────────────────

  /** Render a single document row. */
  const renderDoc = (doc: (typeof docList)[number], depth: number) => {
    const isActive = doc.id === activeDocId;
    const isRenaming = renamingId === doc.id;
    return (
      <div
        key={doc.id}
        onClick={() => openDocument(doc.id)}
        onContextMenu={(e) => handleContextMenu(e, doc.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename(doc.id, doc.title || '');
        }}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        className={`group flex h-9 items-center justify-between pr-2 rounded-md cursor-pointer transition-colors duration-150 ${
          isActive
            ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
            : 'hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-sideBar-foreground)]'
        }`}
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

    return (
      <div key={f.id}>
        {/* Folder row */}
        <div
          onClick={() => handleToggleFolder(f.id)}
          onContextMenu={(e) => handleFolderContextMenu(e, f.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startFolderRename(f.id, f.name);
          }}
          style={{ paddingLeft: `${4 + depth * 16}px` }}
          className="group flex h-9 items-center gap-1.5 pr-2 rounded-md cursor-pointer transition-colors duration-150 hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-sideBar-foreground)]"
        >
          <ChevronRight
            className={`w-3.5 h-3.5 opacity-50 transition-transform duration-200 shrink-0 ${
              open ? 'rotate-90' : ''
            }`}
          />
          {open ? (
            <FolderOpen className="w-4 h-4 opacity-60 shrink-0" />
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
            <span className="text-sm truncate flex-1">{f.name}</span>
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
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {isSearching ? (
          renderSearchResults()
        ) : (
          <>
            {/* Root-level folders */}
            {tree.subFolders.map((node) => renderNode(node, 0))}
            {/* Root-level documents */}
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
          onMoveTo={() => {
            // Capture position, close the context menu, then show move submenu.
            setMoveMenuPos({ x: contextMenu.x, y: contextMenu.y });
            setMoveMenuDocId(contextMenu.docId);
            setContextMenu(null);
          }}
        />
      )}

      {/* Move-to-folder submenu */}
      {moveMenuDocId && moveMenuPos && (
        <MenuList
          x={moveMenuPos.x}
          y={moveMenuPos.y}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            icon={<Folder />}
            onClick={() => handleMoveToFolder(moveMenuDocId, null)}
          >
            {t('doclist.rootLevel')}
          </MenuItem>
          <MenuDivider />
          {folders.map((f) => (
            <MenuItem
              key={f.id}
              icon={<Folder />}
              onClick={() => handleMoveToFolder(moveMenuDocId, f.id)}
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
