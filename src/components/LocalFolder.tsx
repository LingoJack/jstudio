import React, { useState, useEffect, useRef } from 'react';
import { LocalAsset } from '../types';
import {
  Folder,
  Image as ImageIcon,
  Search,
  Trash2,
  Copy,
  ArrowRight,
  X,
  FileSpreadsheet,
  FileText,
  Database,
  ArrowUpToLine,
  Check,
  FolderOpen,
} from 'lucide-react';

// Pre-packaged gorgeous vector design representing of OmniNote Architecture
const ARCHITECTURE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" width="100%" height="100%"><rect width="100%" height="100%" fill="%2313131a"/><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%236366f1"/><stop offset="100%" stop-color="%23a855f7"/></linearGradient></defs><text x="20" y="35" fill="%23ffffff" font-family="system-ui" font-size="14" font-weight="bold">本地存储架构原理说明</text><rect x="20" y="60" width="100" height="40" rx="6" fill="%2322252a" stroke="%23383a40" stroke-width="1"/><text x="70" y="84" fill="%23ffffff" font-family="system-ui" font-size="10" text-anchor="middle" font-weight="600">双链文档层 (Docs)</text><rect x="150" y="60" width="100" height="40" rx="6" fill="%2322252a" stroke="%23383a40" stroke-width="1"/><text x="200" y="84" fill="%23ffffff" font-family="system-ui" font-size="10" text-anchor="middle" font-weight="600">本地附件库 (Assets)</text><rect x="280" y="60" width="100" height="40" rx="6" fill="%2322252a" stroke="%23383a40" stroke-width="1"/><text x="330" y="84" fill="%23ffffff" font-family="system-ui" font-size="10" text-anchor="middle" font-weight="600">扩展模块层 (Plugins)</text><rect x="150" y="140" width="100" height="50" rx="10" fill="url(%23g1)"/><text x="200" y="165" fill="%23ffffff" font-family="system-ui" font-size="11" text-anchor="middle" font-weight="bold">Tauri Web / Live Sandbox</text><text x="200" y="180" fill="%23ffffff" font-family="system-ui" font-size="9" text-anchor="middle" opacity="0.8">物理沙盒物理加密存储</text><path d="M 70 100 L 70 165 L 150 165" fill="none" stroke="%236366f1" stroke-width="1.5" stroke-dasharray="3,3"/><path d="M 200 100 L 200 140" fill="none" stroke="%236366f1" stroke-width="1.5" stroke-dasharray="3,3"/><path d="M 330 100 L 330 165 L 250 165" fill="none" stroke="%23a855f7" stroke-width="1.5" stroke-dasharray="3,3"/></svg>`;

const INITIAL_ASSETS: LocalAsset[] = [
  {
    id: 'asset-1',
    name: 'OmniNote_本地存储原理图.svg',
    type: 'image/svg+xml',
    size: '12 KB',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    content: ARCHITECTURE_SVG,
  },
  {
    id: 'asset-2',
    name: '交互式脑图说明与规格手册.pdf',
    type: 'application/pdf',
    size: '4.8 MB',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    content: '',
  },
  {
    id: 'asset-3',
    name: 'SQLite_物理脱机缓存表_v2.sql',
    type: 'text/x-sql',
    size: '28 KB',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    content: '',
  },
  {
    id: 'asset-4',
    name: '离线测试多维表格.xlsx',
    type: 'application/octet-stream',
    size: '112 KB',
    createdAt: new Date().toISOString(),
    content: '',
  },
];

interface LocalFolderProps {
  onInsertAsset: (asset: LocalAsset) => void;
  onClose: () => void;
}

export default function LocalFolder({ onInsertAsset, onClose }: LocalFolderProps) {
  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'docs'>('all');
  const [activeFolder, setActiveFolder] = useState<string>('root');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('omninote_assets');
    if (saved) {
      try {
        setAssets(JSON.parse(saved));
      } catch {
        setAssets(INITIAL_ASSETS);
      }
    } else {
      setAssets(INITIAL_ASSETS);
      localStorage.setItem('omninote_assets', JSON.stringify(INITIAL_ASSETS));
    }
  }, []);

  const saveAssets = (updated: LocalAsset[]) => {
    setAssets(updated);
    localStorage.setItem('omninote_assets', JSON.stringify(updated));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeFormatted =
      file.size > 1024 * 1024
        ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
        : (file.size / 1024).toFixed(0) + ' KB';

    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result as string;
      const newAsset: LocalAsset = {
        id: `asset-${Date.now()}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: sizeFormatted,
        createdAt: new Date().toISOString(),
        content: b64,
      };
      saveAssets([newAsset, ...assets]);
    };

    if (file.type.startsWith('image/') || file.type.startsWith('text/')) {
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        const newAsset: LocalAsset = {
          id: `asset-${Date.now()}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: sizeFormatted,
          createdAt: new Date().toISOString(),
          content: '',
        };
        saveAssets([newAsset, ...assets]);
      };
      reader.readAsText(file);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const sizeFormatted =
      file.size > 1024 * 1024
        ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
        : (file.size / 1024).toFixed(0) + ' KB';

    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result as string;
      const newAsset: LocalAsset = {
        id: `asset-${Date.now()}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: sizeFormatted,
        createdAt: new Date().toISOString(),
        content: b64,
      };
      saveAssets([newAsset, ...assets]);
    };

    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      const newAsset: LocalAsset = {
        id: `asset-${Date.now()}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: sizeFormatted,
        createdAt: new Date().toISOString(),
        content: '',
      };
      saveAssets([newAsset, ...assets]);
    }
  };

  const handleDeleteAsset = (id: string, name: string) => {
    if (confirm(`确定要将附件「${name}」从本地硬盘及缓存中彻底物理删除吗？`)) {
      saveAssets(assets.filter((f) => f.id !== id));
    }
  };

  const handleCopyRef = (asset: LocalAsset) => {
    const refCode = asset.type.startsWith('image/')
      ? `![${asset.name}](${asset.content || '(Base64_Payload_Too_Large)'})`
      : `[附件:${asset.name}](${asset.size})`;
    navigator.clipboard.writeText(refCode);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getFileIcon = (type: string, name: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-[var(--vscode-symbolIcon-eventForeground)]" />;
    if (name.endsWith('.sql') || name.endsWith('.db')) return <Database className="w-4 h-4 text-[var(--vscode-symbolIcon-namespaceForeground)]" />;
    if (name.endsWith('.csv') || name.endsWith('.xlsx')) return <FileSpreadsheet className="w-4 h-4 text-[var(--vscode-terminal-ansiGreen)]" />;
    return <FileText className="w-4 h-4 text-[var(--vscode-symbolIcon-fileForeground)]" />;
  };

  const filteredCategoryAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFolder === 'images') return asset.type.startsWith('image/');
    if (activeFolder === 'attachments') return !asset.type.startsWith('image/');
    if (activeTab === 'images') return asset.type.startsWith('image/');
    if (activeTab === 'docs') return !asset.type.startsWith('image/');
    return true;
  });

  const imagesCount = assets.filter((a) => a.type.startsWith('image/')).length;
  const attachmentsCount = assets.filter((a) => !a.type.startsWith('image/')).length;

  const folderBtnBase = 'cursor-pointer px-1 py-1.5 rounded-md border flex flex-col items-center justify-center transition-colors duration-150';
  const folderBtnActive = 'bg-[var(--vscode-list-activeSelectionBackground)] border-[var(--vscode-list-activeSelectionBackground)] text-white font-medium';
  const folderBtnInactive = 'bg-[var(--vscode-editor-background)] border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-list-activeSelectionBackground)]';

  const tabBtnBase = 'flex-1 py-1 rounded-sm transition-colors';
  const tabBtnActive = 'bg-[var(--vscode-list-activeSelectionBackground)] font-medium text-white';
  const tabBtnInactive = 'text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]';

  return (
    <div className="absolute right-2 top-12 bottom-2 w-[min(22rem,calc(100vw-1rem))] bg-[var(--vscode-sideBar-background)] border border-[var(--vscode-widget-border)] flex flex-col z-40 select-none rounded-lg shadow-xl overflow-hidden">

      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-widget-border)] flex items-center justify-between bg-[var(--vscode-sideBarSectionHeader-background)]">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
          <div>
            <h3 className="font-semibold text-xs text-[var(--vscode-sideBarTitle-foreground)]">本地共享文件夹</h3>
            <p className="text-[9px] text-[var(--vscode-descriptionForeground)]">/assets/ (物理脱机暂存目录)</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors duration-150 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)]"
          title="关闭文件夹面板"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Directory selector */}
      <div className="p-2 border-b border-[var(--vscode-widget-border)] flex flex-col gap-1.5 bg-[var(--vscode-sideBarSectionHeader-background)]">
        <div className="text-[10px] uppercase font-semibold text-[var(--vscode-descriptionForeground)]">目录浏览 (Directories)</div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => { setActiveFolder('root'); setActiveTab('all'); }}
            className={`${folderBtnBase} ${activeFolder === 'root' ? folderBtnActive : folderBtnInactive}`}
          >
            <Folder className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] truncate w-full text-center">/assets/</span>
          </button>
          <button
            onClick={() => setActiveFolder('images')}
            className={`${folderBtnBase} ${activeFolder === 'images' ? folderBtnActive : folderBtnInactive}`}
          >
            <ImageIcon className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] truncate w-full text-center">/images ({imagesCount})</span>
          </button>
          <button
            onClick={() => setActiveFolder('attachments')}
            className={`${folderBtnBase} ${activeFolder === 'attachments' ? folderBtnActive : folderBtnInactive}`}
          >
            <Folder className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] truncate w-full text-center">/attachments ({attachmentsCount})</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-2 border-b border-[var(--vscode-widget-border)] space-y-1.5 bg-[var(--vscode-sideBarSectionHeader-background)]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vscode-descriptionForeground)]" />
          <input
            type="text"
            placeholder="搜索物理文件夹中缓存..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-[11px] pl-7 pr-2 py-1.5 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:outline-none focus:border-[var(--vscode-focusBorder)] transition-colors duration-150"
          />
        </div>

        {activeFolder === 'root' && (
          <div className="flex bg-[var(--vscode-editor-background)] p-0.5 rounded border border-[var(--vscode-widget-border)] text-[10px]">
            <button onClick={() => setActiveTab('all')} className={`${tabBtnBase} ${activeTab === 'all' ? tabBtnActive : tabBtnInactive}`}>
              全部 ({assets.length})
            </button>
            <button onClick={() => setActiveTab('images')} className={`${tabBtnBase} ${activeTab === 'images' ? tabBtnActive : tabBtnInactive}`}>
              图片库 ({imagesCount})
            </button>
            <button onClick={() => setActiveTab('docs')} className={`${tabBtnBase} ${activeTab === 'docs' ? tabBtnActive : tabBtnInactive}`}>
              附件 ({attachmentsCount})
            </button>
          </div>
        )}
      </div>

      {/* File list */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-transparent"
      >
        {/* Dropzone */}
        <div
          className="p-2.5 mb-1 bg-[var(--vscode-list-hoverBackground)] rounded border border-dashed border-[var(--vscode-list-activeSelectionBackground)] text-center relative hover:bg-[var(--vscode-editorWidget-background)] transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <ArrowUpToLine className="w-4 h-4 text-[var(--vscode-list-activeSelectionForeground)] mx-auto mb-1" />
          <p className="text-[10px] text-[var(--vscode-foreground)] font-medium leading-normal">
            点击或拖放本地任意图片/工程文件附件至此
          </p>
          <p className="text-[9px] text-[var(--vscode-descriptionForeground)] mt-0.5">
            物理落盘到模拟 assets/ 独立数据库
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,.pdf,.sql,.db,.xlsx,.csv,.zip,.docx"
          />
        </div>

        {/* Path header */}
        <div className="text-[9px] text-[var(--vscode-descriptionForeground)] px-1 py-0.5 flex items-center gap-1">
          <span>文件列表</span>
          <span>/</span>
          <span className="font-medium underline">
            assets{activeFolder !== 'root' ? `/${activeFolder}` : ''}
          </span>
          <span>({filteredCategoryAssets.length} 项)</span>
        </div>

        {/* Asset items */}
        {filteredCategoryAssets.length === 0 ? (
          <div className="py-8 text-center space-y-1.5">
            <Folder className="w-7 h-7 text-[var(--vscode-descriptionForeground)] mx-auto opacity-40" />
            <p className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-2">
              该文件夹下空空如也
            </p>
          </div>
        ) : (
          filteredCategoryAssets.map((asset) => (
            <div
              key={asset.id}
              className="p-2.5 bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] hover:border-[var(--vscode-list-activeSelectionBackground)] rounded-md hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 text-xs flex flex-col gap-2 group"
              id={`asset-file-${asset.id}`}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded bg-[var(--vscode-editorWidget-background)] flex items-center justify-center shrink-0 border border-[var(--vscode-widget-border)]">
                    {getFileIcon(asset.type, asset.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--vscode-foreground)] truncate" title={asset.name}>
                      {asset.name}
                    </div>
                    <div className="text-[9px] text-[var(--vscode-descriptionForeground)] font-mono flex items-center gap-1.5 mt-0.5">
                      <span>{asset.size}</span>
                      <span>•</span>
                      <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteAsset(asset.id, asset.name)}
                  className="cursor-pointer text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除物理附件"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {asset.type.startsWith('image/') && asset.content && (
                <div className="rounded overflow-hidden border border-[var(--vscode-widget-border)] bg-[var(--vscode-editorWidget-background)] p-1 max-h-24 flex items-center justify-center">
                  <img
                    src={asset.content}
                    alt={asset.name}
                    className="max-h-20 max-w-full object-contain rounded"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-1 pt-1 border-t border-[var(--vscode-widget-border)]">
                <button
                  onClick={() => handleCopyRef(asset)}
                  className="cursor-pointer bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[10px] text-[var(--vscode-button-secondaryForeground)] py-1 px-1.5 rounded border border-[var(--vscode-widget-border)] flex items-center justify-center gap-1.5 transition-colors font-medium"
                  title="拷贝该附件的 Markdown 或是 Wiki 等引用语法"
                >
                  {copiedId === asset.id ? (
                    <>
                      <Check className="w-3 h-3 text-[var(--vscode-terminal-ansiGreen)]" />
                      <span className="text-[var(--vscode-terminal-ansiGreen)]">已拷贝</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>复制引用</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => onInsertAsset(asset)}
                  className="cursor-pointer bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[10px] text-[var(--vscode-button-foreground)] py-1 px-1.5 rounded flex items-center justify-center gap-1.5 transition-colors font-medium"
                  title="将该媒体图片/附件一键置入当前文档末尾进行双链绑定"
                >
                  <ArrowRight className="w-3 h-3" />
                  <span>置入文档</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Capacity footer */}
      <div className="p-2 border-t border-[var(--vscode-widget-border)] bg-[var(--vscode-sideBarSectionHeader-background)] text-[10px] space-y-1">
        <div className="flex justify-between font-mono text-[var(--vscode-descriptionForeground)]">
          <span>Tauri Folder Limit</span>
          <span className="font-medium">6.2 MB / 50 MB (12%)</span>
        </div>
        <div className="w-full bg-[var(--vscode-editorWidget-background)] rounded-full h-1 overflow-hidden">
          <div className="bg-[var(--vscode-list-activeSelectionBackground)] h-1 rounded-full" style={{ width: '12%' }}></div>
        </div>
        <p className="text-[9px] text-[var(--vscode-descriptionForeground)] leading-normal">
          注: 本地文档引擎支持图片/音视频任意附件挂载，体积受本地独立沙盒配额限制。
        </p>
      </div>

    </div>
  );
}
