import React, { useState } from 'react';
import { Document, Plugin } from '../types';
import {
  Search,
  Plus,
  BookOpen,
  FolderDot,
  Settings,
  RefreshCw,
  Package,
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
  onRestoreDefaults: () => void;
  onClearAll: () => void;
  onImportData: (importedText: string) => boolean;
}

export default function DocumentList({
  documents,
  activeDocId,
  onSelectDocument,
  onDeleteDocument,
  onToggleFavorite,
  isDarkMode,
  onToggleDarkMode,
  onRestoreDefaults,
  onClearAll,
  onImportData,
}: DocumentListProps) {
  const [search, setSearch] = useState('');
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImporter, setShowImporter] = useState(false);

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(search.toLowerCase())
  );

  const favoriteDocs = filteredDocs.filter((doc) => doc.isFavorite);
  const otherDocs = filteredDocs.filter((doc) => !doc.isFavorite);

  return (
    <div className="w-full md:w-60 h-full bg-[#f3f3f3] dark:bg-[#252526] border-r border-slate-200 dark:border-white/[0.08] flex flex-col p-2 select-none z-10">
      
      {/* Search Input */}
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        <input
          type="text"
          placeholder="查找文档..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-7 text-xs pl-7 pr-2 rounded-sm border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#3c3c3c] text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-[#0e639c] transition-colors duration-150"
        />
      </div>

      {/* Docs List viewports */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
        
        {/* Favorite section */}
        {favoriteDocs.length > 0 && (
          <div className="space-y-0.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5 px-1.5 mb-1">
              <Star className="w-3 h-3 text-slate-500" />
              <span>常用 {favoriteDocs.length}</span>
            </h4>
            
            <div className="space-y-0.5">
              {favoriteDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={`group flex h-7 items-center justify-between px-2 border-l-2 cursor-pointer transition-colors duration-150 ${
                    doc.id === activeDocId
                      ? 'border-[#0e639c] bg-[#e8e8e8] dark:bg-[#37373d] text-slate-900 dark:text-slate-100 font-medium'
                      : 'border-transparent hover:bg-[#e8e8e8] dark:hover:bg-white/[0.06] text-slate-700 dark:text-slate-300'
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
                      className="cursor-pointer text-slate-500 hover:text-red-500 p-0.5 rounded-sm transition-colors duration-150"
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
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5 px-1.5 mb-1 mt-3">
            <FolderDot className="w-3 h-3" />
            <span>全部知识本 {otherDocs.length}</span>
          </h4>
          
          <div className="space-y-0.5">
            {otherDocs.length === 0 && favoriteDocs.length === 0 ? (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 px-2 py-2">
                暂无匹配文档
              </p>
            ) : (
              otherDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={`group flex h-7 items-center justify-between px-2 border-l-2 cursor-pointer transition-colors duration-150 ${
                    doc.id === activeDocId
                      ? 'border-[#0e639c] bg-[#e8e8e8] dark:bg-[#37373d] text-slate-900 dark:text-slate-100 font-medium'
                      : 'border-transparent hover:bg-[#e8e8e8] dark:hover:bg-white/[0.06] text-slate-700 dark:text-slate-300'
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
                      className="cursor-pointer text-slate-500 hover:text-amber-500 p-0.5 rounded-sm transition-colors duration-150"
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
                      className="cursor-pointer text-slate-500 hover:text-red-500 p-0.5 rounded-sm transition-colors duration-150"
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

      {/* Footer controls dock */}
      <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2 text-xs relative shrink-0">
        
        {/* Settings Popover wrapper */}
        {showSettingsPopover && (
          <div className="absolute bottom-10 left-0 w-72 overflow-hidden rounded-sm border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#252526] shadow-lg z-50">
            <div className="flex h-8 items-center justify-between border-b border-slate-200 dark:border-white/[0.08] px-3">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span>库设置</span>
              </span>
              <button
                onClick={() => {
                  setShowSettingsPopover(false);
                  setShowImporter(false);
                }}
                className="cursor-pointer rounded-sm px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                Esc
              </button>
            </div>

            <div className="py-1">
              <button
                onClick={() => {
                  onRestoreDefaults();
                  setShowSettingsPopover(false);
                }}
                className="cursor-pointer group flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06] transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#0e639c]" />
                <span className="flex-1">恢复初始数据</span>
                <span className="text-[10px] text-slate-500">Reset</span>
              </button>

              <button
                onClick={() => {
                  if(window.confirm('确定清空所有本地数据吗？')){
                     onClearAll();
                     setShowSettingsPopover(false);
                  }
                }}
                className="cursor-pointer group flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/10 dark:hover:text-red-300 transition-colors"
              >
                <Trash className="w-3.5 h-3.5 text-slate-500 group-hover:text-red-500" />
                <span className="flex-1">清空本地文档</span>
                <span className="text-[10px] text-slate-500 group-hover:text-red-400">Danger</span>
              </button>

              <div className="my-1 h-px bg-slate-200 dark:bg-white/[0.08]" />

              <div className="px-3 py-1.5">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Package className="w-3 h-3" />
                    主备份副本 JSON
                  </span>
                  <button
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(JSON.stringify(documents, null, 2));
                        alert('已复制至剪贴板');
                      } catch (err) {
                        alert('导出失败: ' + err);
                      }
                    }}
                    className="cursor-pointer rounded-sm px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                  >
                    备份整库
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowImporter(!showImporter)}
                  className="cursor-pointer flex w-full items-center justify-between border border-dashed border-slate-300 dark:border-white/[0.10] px-2 py-1.5 text-left text-[10px] text-slate-500 hover:border-[#0e639c] hover:bg-[#e8e8e8] hover:text-[#0e639c] dark:hover:border-[#0e639c]/60 dark:hover:bg-white/[0.06] dark:hover:text-[#4fc3f7] transition-colors"
                >
                  <span>{showImporter ? '隐藏导入输入区' : '置入外部备份副本'}</span>
                  <span className="text-slate-500">JSON</span>
                </button>

                {showImporter && (
                  <div className="mt-2 space-y-2 border-t border-slate-200 dark:border-white/[0.08] pt-2">
                    <textarea
                      placeholder="粘贴备份数组 JSON..."
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={4}
                      className="w-full resize-none border border-slate-300 dark:border-white/[0.10] bg-white dark:bg-[#3c3c3c] p-2 font-mono text-[10px] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#0e639c] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!importText) return;
                        const ok = onImportData(importText);
                        if (ok) {
                          setShowSettingsPopover(false);
                          setShowImporter(false);
                          setImportText('');
                        }
                      }}
                      className="cursor-pointer w-full bg-[#0e639c] hover:bg-[#1177bb] px-2 py-1.5 text-[10px] font-medium text-white transition-colors"
                    >
                      安全加载此副本
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowSettingsPopover(!showSettingsPopover)}
          className="cursor-pointer flex-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-[#0e639c] dark:hover:text-[#4fc3f7] p-1.5 rounded-sm flex items-center justify-center gap-1.5 transition-colors duration-150 text-[11px] font-medium"
          id="btn-sidebar-settings"
        >
          <Settings className="w-4 h-4 text-slate-500" />
          <span>库设置</span>
        </button>

        <button
          onClick={onToggleDarkMode}
          className="cursor-pointer w-7 h-7 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08] p-1.5 rounded-sm flex items-center justify-center transition-colors duration-150"
          id="btn-toggle-theme"
          title="切换暗度/明亮外观"
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-500" />}
        </button>
      </div>

    </div>
  );
}
