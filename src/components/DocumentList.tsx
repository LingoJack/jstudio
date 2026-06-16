import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Search, FolderDot, FileText, Plus, Pencil, Trash2 } from 'lucide-react';

interface ContextMenuState {
  x: number;
  y: number;
  docId: string;
}

export default function DocumentList() {
  const documents = useStore((s) => s.documents);
  const activeDocId = useStore((s) => s.activeDocId);
  const openDocument = useStore((s) => s.openDocument);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const createDocument = useStore((s) => s.createDocument);
  const renameDocument = useStore((s) => s.renameDocument);

  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const filteredDocs = documents.filter((doc) =>
    (doc.title || '').toLowerCase().includes(search.toLowerCase()),
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

  return (
    <div className="w-60 shrink-0 h-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col p-2 pt-12 select-none z-10 relative">
      {/* macOS 标题栏拖拽区域 */}
      <div className="absolute top-0 left-0 right-0 h-12" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      {/* Header */}
      <div className="flex items-center justify-between px-1.5 mb-1 shrink-0">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)] flex items-center gap-1.5">
          <FolderDot className="w-3 h-3" />
          <span>全部文档 {filteredDocs.length}</span>
        </h4>
        <button
          onClick={createDocument}
          className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] p-0.5 rounded-sm transition-colors duration-150"
          title="新建文档"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-2 shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vscode-icon-foreground)] opacity-60 pointer-events-none" />
        <input
          type="text"
          placeholder="查找文档..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-7 text-xs pl-7 pr-2 rounded-sm border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-60 focus:outline-none focus:border-[var(--vscode-focusBorder)] transition-colors duration-150"
        />
      </div>

      {/* Documents list */}
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {filteredDocs.length === 0 ? (
          <p className="text-[10px] text-[var(--vscode-descriptionForeground)] px-2 py-2">
            暂无匹配文档
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
              className={`group flex h-7 items-center justify-between px-2 border-l-2 cursor-pointer transition-colors duration-150 ${
                doc.id === activeDocId
                  ? 'border-[var(--vscode-tab-activeBorderTop)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                  : 'border-transparent hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-sideBar-foreground)]'
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
                  className="flex-1 min-w-0 h-5 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded-sm px-1 focus:outline-none"
                  placeholder="输入文档名称"
                />
              ) : (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  <span className="text-xs truncate">{doc.title || '无标题'}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[120px] py-1 rounded-sm border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-lg text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const doc = documents.find((d) => d.id === contextMenu.docId);
              if (doc) startRename(doc.id, doc.title || '');
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-hoverBackground)]"
          >
            <Pencil className="w-3 h-3 opacity-70" />
            <span>重命名</span>
          </button>
          <button
            onClick={() => {
              deleteDocument(contextMenu.docId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-menu-hoverBackground)]"
          >
            <Trash2 className="w-3 h-3 opacity-70" />
            <span>删除</span>
          </button>
        </div>
      )}
    </div>
  );
}
