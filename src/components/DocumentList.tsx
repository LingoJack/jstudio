import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Search, FolderDot, Trash, FileText, Plus } from 'lucide-react';

export default function DocumentList() {
  const documents = useStore((s) => s.documents);
  const activeDocId = useStore((s) => s.activeDocId);
  const openDocument = useStore((s) => s.openDocument);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const createDocument = useStore((s) => s.createDocument);

  const [search, setSearch] = useState('');

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="w-60 shrink-0 h-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col p-2 select-none z-10">
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
              className={`group flex h-7 items-center justify-between px-2 border-l-2 cursor-pointer transition-colors duration-150 ${
                doc.id === activeDocId
                  ? 'border-[var(--vscode-tab-activeBorderTop)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                  : 'border-transparent hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-sideBar-foreground)]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 opacity-50 shrink-0" />
                <span className="text-xs truncate">{doc.title || '无标题'}</span>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteDocument(doc.id);
                }}
                className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-errorForeground)] p-0.5 rounded-sm transition-colors duration-150 opacity-0 group-hover:opacity-100"
                title="删除文档"
              >
                <Trash className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
