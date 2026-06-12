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
    <div className="w-full md:w-60 h-full bg-white dark:bg-[#0f0f11] border-r border-slate-100 dark:border-white/[0.06] flex flex-col p-3 select-none z-10">
      
      {/* Search Input - enhanced with focus ring and rounded-xl */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="查找文档..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.03] text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 dark:focus:border-indigo-500/30 transition-all duration-150"
        />
      </div>

      {/* Docs List viewports - enhanced spacing */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-0.5">
        
        {/* Favorite section */}
        {favoriteDocs.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-[10px] font-semibold text-slate-400 flex items-center gap-1.5 px-2 mb-2">
              <Star className="w-3 h-3 text-amber-500" />
              <span>常用 {favoriteDocs.length}</span>
            </h4>
            
            <div className="space-y-0.5">
              {favoriteDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={`group flex items-center justify-between px-2 py-2 rounded-xl cursor-pointer transition-all duration-150 ${
                    doc.id === activeDocId
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 text-slate-900 dark:text-slate-100 font-medium'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.04] text-slate-600 dark:text-slate-400'
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
                      className="cursor-pointer text-amber-500 p-1 hover:bg-amber-100 dark:hover:bg-amber-500/15 rounded-md transition-colors duration-150 active:scale-95"
                      id={`unfav-${doc.id}`}
                    >
                      <Star className="w-3 h-3 fill-amber-500" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id);
                      }}
                      className="cursor-pointer text-slate-400 hover:text-rose-500 p-1 hover:bg-rose-100 dark:hover:bg-rose-500/15 rounded-md transition-colors duration-150 active:scale-95"
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
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-semibold text-slate-400 flex items-center gap-1.5 px-2 mb-2 mt-5">
            <FolderDot className="w-3 h-3" />
            <span>全部知识本 {otherDocs.length}</span>
          </h4>
          
          <div className="space-y-0.5">
            {otherDocs.length === 0 && favoriteDocs.length === 0 ? (
              <p className="text-[10px] text-slate-400 px-2 py-2">
                暂无匹配文档
              </p>
            ) : (
              otherDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={`group flex items-center justify-between px-2 py-2 rounded-xl cursor-pointer transition-all duration-150 ${
                    doc.id === activeDocId
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 text-slate-900 dark:text-slate-100 font-medium'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.04] text-slate-600 dark:text-slate-400'
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
                      className="cursor-pointer text-slate-400 hover:text-amber-500 p-1 hover:bg-amber-100 dark:hover:bg-amber-500/15 rounded-md transition-colors duration-150 active:scale-95"
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
                      className="cursor-pointer text-slate-400 hover:text-rose-500 p-1 hover:bg-rose-100 dark:hover:bg-rose-500/15 rounded-md transition-colors duration-150 active:scale-95"
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

      {/* Footer controls dock - enhanced */}
      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-2 text-xs relative shrink-0">
        
        {/* Settings Popover wrapper */}
        {showSettingsPopover && (
          <div className="absolute bottom-10 left-0 w-64 bg-white dark:bg-[#1a1c23] border border-slate-200 dark:border-white/10 rounded-xl p-3 shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5 mb-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                <Settings className="w-3 h-3 text-slate-500" />
                <span>偏好设置</span>
              </span>
              <button
                onClick={() => {
                  setShowSettingsPopover(false);
                  setShowImporter(false);
                }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer px-1 rounded hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                收起
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => {
                  onRestoreDefaults();
                  setShowSettingsPopover(false);
                }}
                className="cursor-pointer w-full text-left p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-700 dark:text-slate-300 transition-all duration-150 text-xs flex items-center justify-between font-medium active:scale-[0.98]"
              >
                <span>恢复初始数据</span>
                <span className="text-[10px] text-slate-400 font-mono">Rest</span>
              </button>

              <button
                onClick={() => {
                  if(window.confirm('确定清空所有本地数据吗？')){
                     onClearAll();
                     setShowSettingsPopover(false);
                  }
                }}
                className="cursor-pointer w-full text-left p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-all duration-150 text-xs flex items-center justify-between font-medium active:scale-[0.98]"
              >
                <span>清空本地文档</span>
                <span className="text-[10px] text-rose-400/50 font-mono">Warn</span>
              </button>

              <div className="h-px bg-slate-100 dark:bg-white/5 my-2" />

              <div className="space-y-1 text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between gap-1 text-[10px] px-1">
                  <span className="font-medium text-slate-500">主备份副本 (JSON)</span>
                  <button
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(JSON.stringify(documents, null, 2));
                        alert('已复制至剪贴板');
                      } catch (err) {
                        alert('导出失败: ' + err);
                      }
                    }}
                    className="cursor-pointer text-slate-500 font-medium hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    备份整库
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowImporter(!showImporter)}
                  className="cursor-pointer w-full py-1.5 text-center rounded-xl border border-dashed border-slate-200 dark:border-white/[0.08] text-[9.5px] text-slate-500 hover:text-indigo-500 hover:border-indigo-300 dark:hover:border-indigo-500/30 bg-transparent transition-all duration-150"
                >
                  {showImporter ? '隐藏导入输入区' : '📂 置入外部备份副本'}
                </button>

                {showImporter && (
                  <div className="space-y-1.5 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-white/5">
                    <textarea
                      placeholder="粘贴备份数组 JSON..."
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={3}
                      className="w-full text-[9px] p-1.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] rounded-lg text-slate-800 dark:text-slate-350 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all"
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
                      className="cursor-pointer w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold transition-all duration-150 active:scale-[0.98]"
                    >
                      安全加载此副本
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Toggle Gear Button: Settings - enhanced hover */}
        <button
          onClick={() => setShowSettingsPopover(!showSettingsPopover)}
          className="cursor-pointer flex-1 text-slate-650 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-indigo-400 p-2 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-150 text-[11px] font-semibold border border-transparent active:scale-95"
          id="btn-sidebar-settings"
        >
          <Settings className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          <span>库设置</span>
        </button>

        {/* Theme select option next of settings - enhanced hover */}
        <button
          onClick={onToggleDarkMode}
          className="cursor-pointer w-8 h-8 text-slate-650 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-white/5 p-1.5 rounded-xl flex items-center justify-center transition-all duration-150 border border-transparent active:scale-95"
          id="btn-toggle-theme"
          title="切换暗度/明亮外观"
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-400" />}
        </button>
      </div>

    </div>
  );
}
