import React, { useState } from 'react';
import { Document, Plugin } from '../types';
import {
  Search,
  Plus,
  BookOpen,
  FolderDot,
  Sun,
  Moon,
  Trash,
  Star,
  FileText
} from 'lucide-react';

interface DocumentListProps {
  documents: Document[];
  activeDocId: string;
  onSelectDocument: (id: string) => void;
  onDeleteDocument: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export default function DocumentList({
  documents,
  activeDocId,
  onSelectDocument,
  onDeleteDocument,
  onToggleFavorite,
  isDarkMode,
  onToggleDarkMode,
}: DocumentListProps) {
  const [search, setSearch] = useState('');

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(search.toLowerCase())
  );

  const favoriteDocs = filteredDocs.filter((doc) => doc.isFavorite);
  const otherDocs = filteredDocs.filter((doc) => !doc.isFavorite);

  return (
    <div className="w-full md:w-60 h-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col p-2 select-none z-10">

      {/* Search Input */}
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vscode-icon-foreground)] opacity-60 pointer-events-none" />
        <input
          type="text"
          placeholder="查找文档..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-7 text-xs pl-7 pr-2 rounded-sm border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-60 focus:outline-none focus:border-[var(--vscode-focusBorder)] transition-colors duration-150"
        />
      </div>

      {/* Docs List viewports */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">

        {/* Favorite section */}
        {favoriteDocs.length > 0 && (
          <div className="space-y-0.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)] flex items-center gap-1.5 px-1.5 mb-1">
              <Star className="w-3 h-3 text-amber-500" />
              <span>常用 {favoriteDocs.length}</span>
            </h4>

            <div className="space-y-0.5">
              {favoriteDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={`group flex h-7 items-center justify-between px-2 border-l-2 cursor-pointer transition-colors duration-150 ${
                    doc.id === activeDocId
                      ? 'border-[var(--vscode-tab-activeBorderTop)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                      : 'border-transparent hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-sideBar-foreground)]'
                  }`}
                  id={`sidebar-doc-${doc.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 opacity-50 shrink-0" />
                    <span className="text-xs truncate">{doc.title || '无标题'}</span>
                  </div>

                  {/* Sidebar item controls - enhanced hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(doc.id);
                      }}
                      className="cursor-pointer text-amber-500 p-0.5 hover:text-amber-600 rounded-sm transition-colors duration-150"
                      id={`unfav-${doc.id}`}
                    >
                      <Star className="w-3 h-3 fill-amber-500" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id);
                      }}
                      className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-errorForeground)] p-0.5 rounded-sm transition-colors duration-150"
                      id={`delete-${doc.id}`}
                    >
                      <Trash className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Local Documents collection */}
        <div className="space-y-0.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)] flex items-center gap-1.5 px-1.5 mb-1 mt-3">
            <FolderDot className="w-3 h-3" />
            <span>全部知识本 {otherDocs.length}</span>
          </h4>

          <div className="space-y-0.5">
            {otherDocs.length === 0 && favoriteDocs.length === 0 ? (
              <p className="text-[10px] text-[var(--vscode-descriptionForeground)] px-2 py-2">
                暂无匹配文档
              </p>
            ) : (
              otherDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={`group flex h-7 items-center justify-between px-2 border-l-2 cursor-pointer transition-colors duration-150 ${
                    doc.id === activeDocId
                      ? 'border-[var(--vscode-tab-activeBorderTop)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                      : 'border-transparent hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-sideBar-foreground)]'
                  }`}
                  id={`sidebar-doc-${doc.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 opacity-50 shrink-0" />
                    <span className="text-xs truncate">{doc.title || '无标题'}</span>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(doc.id);
                      }}
                      className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-amber-500 p-0.5 rounded-sm transition-colors duration-150"
                      title="添加常用"
                      id={`fav-${doc.id}`}
                    >
                      <Star className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id);
                      }}
                      className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-errorForeground)] p-0.5 rounded-sm transition-colors duration-150"
                      id={`delete-${doc.id}`}
                    >
                      <Trash className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Footer: Theme toggle */}
      <div className="pt-2 border-t border-[var(--vscode-widget-border)] flex items-center shrink-0">
        <button
          onClick={onToggleDarkMode}
          className="cursor-pointer w-7 h-7 text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] p-1.5 rounded-sm flex items-center justify-center transition-colors duration-150"
          id="btn-toggle-theme"
          title="切换外观"
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

    </div>
  );
}