import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { storage } from '../lib/storage';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { FolderDot, FileText, Plus, MoreHorizontal, FileDown } from 'lucide-react';
import DocumentContextMenu from './DocumentContextMenu';
import { MenuList, MenuItem } from './ui/MenuList';

interface ContextMenuState {
  x: number;
  y: number;
  docId: string;
}

export default function DocumentList() {
  const { t } = useI18n();
  const documents = useStore((s) => s.documents);
  const activeDocId = useStore((s) => s.activeDocId);
  const openDocument = useStore((s) => s.openDocument);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const createDocument = useStore((s) => s.createDocument);
  const importDocumentFromMarkdown = useStore((s) => s.importDocumentFromMarkdown);
  const renameDocument = useStore((s) => s.renameDocument);
  const searchQuery = useStore((s) => s.searchQuery);
  const sidebarWidth = useStore((s) => s.sidebarWidth);

  const { onResizeStart } = useSidebarResize();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const filteredDocs = documents.filter((doc) =>
    (doc.title || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // close context menu on any click
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

  // close "more" menu on outside click
  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moreMenuOpen]);

  // focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const startRename = useCallback((docId: string, currentTitle: string) => {
    setRenamingId(docId);
    setRenameValue(currentTitle);
    setContextMenu(null);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId) {
      const trimmed = renameValue.trim();
      renameDocument(renamingId, trimmed);
      setRenamingId(null);
    }
  }, [renamingId, renameValue, renameDocument]);

  const handleContextMenu = (e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, docId });
  };

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

  return (
    <div
      className="shrink-0 h-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col p-2 select-none z-10 relative"
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 mb-1.5 shrink-0">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)] flex items-center gap-1.5">
          <FolderDot className="w-4 h-4" />
          <span>{t('doclist.allDocuments')} {filteredDocs.length}</span>
        </h4>
        <div className="flex items-center gap-0.5">
          <div className="relative" ref={moreMenuRef}>
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

      {/* Documents list */}
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {filteredDocs.length === 0 ? (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
            {t('doclist.noMatch')}
          </p>
        ) : (
          filteredDocs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => openDocument(doc.id)}
              onContextMenu={(e) => handleContextMenu(e, doc.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename(doc.id, doc.title || '');
              }}
              className={`group flex h-9 items-center justify-between px-2 rounded-md cursor-pointer transition-colors duration-150 ${
                doc.id === activeDocId
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-sideBar-foreground)]'
              }`}
            >
              {renamingId === doc.id ? (
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
                  <span className="text-sm truncate">{doc.title || t('doclist.untitled')}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
 
      {/* Context menu */}
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
