import React, { useState, useEffect } from 'react';
import { Document } from './types';
import { DEFAULT_DOCUMENTS } from './data/defaultData';
import DocumentList from './components/DocumentList';
import BlockEditor from './components/BlockEditor';
import LocalFolder from './components/LocalFolder';
import ArticleOutline from './components/ArticleOutline';
import {
  FileText,
  Info,
  FolderDot,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  Plus,
  Trash2,
  Star
} from 'lucide-react';

export default function App() {
  // 1. Core Reactive States
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocId, setActiveDocId] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const currentViewMode = 'editor';
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);

  const handleInsertAssetAsBlock = (asset: any) => {
    if (!activeDocId) {
      alert('请先选择或创建一个目标文档，然后再置入此本地附件。');
      return;
    }
    const targetDoc = documents.find(d => d.id === activeDocId);
    if (!targetDoc) return;

    let newBlock;
    if (asset.type.startsWith('image/')) {
      newBlock = {
        id: `block-${Date.now()}`,
        type: 'image' as const,
        content: asset.content || '',
        properties: { caption: asset.name, imageType: asset.content ? 'base64' : 'url' }
      };
    } else {
      newBlock = {
        id: `block-${Date.now()}`,
        type: 'callout' as const,
        content: `📁 **已关联本地存储物理附件**: [${asset.name}] (${asset.size})\n*创建时间: ${new Date(asset.createdAt).toLocaleString()} • 双链指令 [[ 建立语义索引*`,
        properties: { emoji: '📎' }
      };
    }

    const updatedBlocks = [...targetDoc.blocks, newBlock];
    const updated = documents.map((doc) => {
      if (doc.id === activeDocId) {
        return {
          ...doc,
          blocks: updatedBlocks,
          updatedAt: new Date().toISOString(),
        };
      }
      return doc;
    });
    setDocuments(updated);
    localStorage.setItem('omninote_docs', JSON.stringify(updated));
  };

  // --- INITIAL LOADING (LocalStorage Check) ---
  useEffect(() => {
    // A. Load documents
    const savedDocs = localStorage.getItem('omninote_docs');
    if (savedDocs) {
      try {
        const parsed = JSON.parse(savedDocs) as Document[];
        if (parsed.length > 0) {
          setDocuments(parsed);
          setActiveDocId(parsed[0].id);
        } else {
          setDocuments(DEFAULT_DOCUMENTS);
          setActiveDocId(DEFAULT_DOCUMENTS[0].id);
        }
      } catch (e) {
        setDocuments(DEFAULT_DOCUMENTS);
        setActiveDocId(DEFAULT_DOCUMENTS[0].id);
      }
    } else {
      setDocuments(DEFAULT_DOCUMENTS);
      setActiveDocId(DEFAULT_DOCUMENTS[0].id);
    }

    // B. Load theme preferences (Default to dark)
    const savedTheme = localStorage.getItem('omninote_theme');
    if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  // --- DARK MODE TRIGGERS ---
  const handleToggleDarkMode = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('omninote_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('omninote_theme', 'light');
    }
  };

  // --- PHYSICAL DOCUMENT ACTIONS ---
  const handleCreateDocument = () => {
    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title: '未命名文档',
      emoji: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blocks: [
        {
          id: `block-${Date.now()}-initial`,
          type: 'text',
          content: '欢迎来到新页面！输入 [[ 可引用其它文档名称，输入 / 快速唤出交互块。',
          properties: {},
        },
      ],
    };

    const updated = [newDoc, ...documents];
    setDocuments(updated);
    setActiveDocId(newDoc.id);
    localStorage.setItem('omninote_docs', JSON.stringify(updated));
  };

  const handleDeleteDocument = (id: string) => {
    if (documents.length <= 1) {
      alert('抱歉，本地库中至少需要保留一篇文档，无法继续删除该项目。');
      return;
    }
    const updated = documents.filter((doc) => doc.id !== id);
    setDocuments(updated);
    if (activeDocId === id) {
      setActiveDocId(updated[0].id);
    }
    localStorage.setItem('omninote_docs', JSON.stringify(updated));
  };

  const handleToggleFavorite = (id: string) => {
    const updated = documents.map((doc) => {
      if (doc.id === id) {
        return { ...doc, isFavorite: !doc.isFavorite };
      }
      return doc;
    });
    setDocuments(updated);
    localStorage.setItem('omninote_docs', JSON.stringify(updated));
  };

  const handleUpdateDocument = (updatedFields: Partial<Document>) => {
    const updated = documents.map((doc) => {
      if (doc.id === activeDocId) {
        return {
          ...doc,
          ...updatedFields,
          updatedAt: new Date().toISOString(),
        };
      }
      return doc;
    });
    setDocuments(updated);
    localStorage.setItem('omninote_docs', JSON.stringify(updated));
  };

  // Extract selected active document
  const activeDocument = documents.find((doc) => doc.id === activeDocId);

  return (
    <div className="h-screen bg-[var(--vscode-sideBar-background)] text-[var(--vscode-editor-foreground)] flex flex-col font-sans tracking-tight relative overflow-hidden">

      {/* Workbench frame */}
      <div className="w-full flex-1 h-full bg-[var(--vscode-editor-background)] flex flex-col overflow-hidden relative z-10">

        {/* VS Code style top bar */}
        <div className="h-10 border-b border-[var(--vscode-titleBar-border)] px-2 md:px-3 flex items-center justify-between shrink-0 select-none bg-[var(--vscode-titleBar-background)]">
          {/* Left: Sidebar toggle & Title */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="cursor-pointer p-1.5 rounded-sm text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150"
              title={isSidebarOpen ? "收拢左边栏" : "展开左边栏"}
            >
              {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
            <div className="font-medium text-xs text-[var(--vscode-titleBar-foreground)] hidden sm:flex items-center gap-1.5 ml-1">
              <FileText className="w-3.5 h-3.5 text-[var(--vscode-icon-foreground)]" />
              <span>OmniNote</span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleCreateDocument}
              className="cursor-pointer bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] rounded-sm px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 mr-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">新建</span>
            </button>

            {activeDocument && (
              <>
                <button
                  onClick={() => handleToggleFavorite(activeDocument.id)}
                  className={`cursor-pointer p-1.5 rounded-sm transition-colors duration-150 ${
                    activeDocument.isFavorite
                      ? 'text-amber-500 hover:bg-[var(--vscode-list-hoverBackground)]'
                      : 'text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                  }`}
                  title={activeDocument.isFavorite ? "取消收藏" : "收藏"}
                >
                  <Star className={`w-4 h-4 ${activeDocument.isFavorite ? 'fill-amber-400 border-none' : ''}`} />
                </button>

                <button
                  onClick={() => handleDeleteDocument(activeDocument.id)}
                  className="cursor-pointer p-1.5 rounded-sm text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150"
                  title="删除文档"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-[var(--vscode-widget-border)] mx-1 hidden sm:block" />
              </>
            )}

            <button
              onClick={() => setIsFolderOpen(!isFolderOpen)}
              className={`cursor-pointer p-1.5 rounded-sm transition-colors duration-150 ${
                isFolderOpen
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]'
                  : 'text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
              title="本地文件夹"
            >
              <FolderDot className="w-4 h-4" />
            </button>

            {activeDocument && (
              <button
                onClick={() => setIsOutlineOpen(!isOutlineOpen)}
                className={`cursor-pointer p-1.5 rounded-sm transition-colors duration-150 ${
                  isOutlineOpen
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]'
                    : 'text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                }`}
                title="大纲面板"
              >
                {isOutlineOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Workspace Shell Split-Pane */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          
          {/* Collapsible Left Sidebar */}
          {isSidebarOpen && (
            <DocumentList
              documents={documents}
              activeDocId={activeDocId}
              onSelectDocument={setActiveDocId}
              onDeleteDocument={handleDeleteDocument}
              onToggleFavorite={handleToggleFavorite}
              isDarkMode={isDarkMode}
              onToggleDarkMode={handleToggleDarkMode}
            />
          )}

          {/* Core dynamic Main Stage Container - edge to edge */}
          <div className="flex-1 min-w-0 h-full bg-[var(--vscode-editor-background)] overflow-hidden">
            {activeDocument ? (
              <div className="w-full h-full flex flex-col">
                <div className="w-full h-full flex">
                  <div className="flex-1 h-full min-w-0 flex flex-col">
                    <BlockEditor
                      document={activeDocument}
                      documents={documents}
                      onSelectDocument={setActiveDocId}
                      onUpdateDocument={handleUpdateDocument}
                    />
                  </div>
                  {isOutlineOpen && (
                    <div className="hidden lg:block w-56 shrink-0 h-full border-l border-[var(--vscode-widget-border)]">
                      <ArticleOutline document={activeDocument} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3">
                <Info className="w-10 h-10 text-[var(--vscode-descriptionForeground)]" />
                <div>
                  <h3 className="font-semibold text-[var(--vscode-foreground)]">请选择左侧文档</h3>
                  <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">创建或选择现有文档立即进行整理编写。</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {isFolderOpen && (
          <LocalFolder
            onInsertAsset={handleInsertAssetAsBlock}
            onClose={() => setIsFolderOpen(false)}
          />
        )}

      </div>
    </div>
  );
}
