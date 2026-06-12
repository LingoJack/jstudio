import React, { useState, useEffect, useRef } from 'react';
import { LocalAsset } from '../types';
import {
  Folder,
  File,
  Image as ImageIcon,
  Plus,
  Trash2,
  Copy,
  Download,
  Search,
  ChevronRight,
  FolderOpen,
  ArrowRight,
  X,
  FileSpreadsheet,
  FileText,
  Database,
  ArrowUpToLine,
  Check
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
  const [activeFolder, setActiveFolder] = useState<string>('root'); // 'root', 'images', 'attachments'
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load physical workspace folder persistence
  useEffect(() => {
    const saved = localStorage.getItem('omninote_assets');
    if (saved) {
      try {
        setAssets(JSON.parse(saved));
      } catch (e) {
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

  // Convert real file uploads to encrypted simulated Base64 physical cache
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

      const updated = [newAsset, ...assets];
      saveAssets(updated);
    };

    if (file.type.startsWith('image/') || file.type.startsWith('text/')) {
      reader.readAsDataURL(file);
    } else {
      // Just simulate upload
      reader.onload = () => {
        const newAsset: LocalAsset = {
          id: `asset-${Date.now()}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: sizeFormatted,
          createdAt: new Date().toISOString(),
          content: '',
        };
        const updated = [newAsset, ...assets];
        saveAssets(updated);
      };
      reader.readAsText(file); // trigger read
    }

    // Reset file input value
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

  // Delete physical files
  const handleDeleteAsset = (id: string, name: string) => {
    if (confirm(`确定要将附件「${name}」从本地硬盘及缓存中彻底物理删除吗？`)) {
      const updated = assets.filter((f) => f.id !== id);
      saveAssets(updated);
    }
  };

  // Copy references
  const handleCopyRef = (asset: LocalAsset) => {
    const refCode = asset.type.startsWith('image/')
      ? `![${asset.name}](${asset.content || '(Base64_Payload_Too_Large)'})`
      : `[附件:${asset.name}](${asset.size})`;
    
    navigator.clipboard.writeText(refCode);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // File type icon distributor
  const getFileIcon = (type: string, name: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-emerald-500" />;
    if (name.endsWith('.sql') || name.endsWith('.db')) return <Database className="w-4 h-4 text-indigo-500" />;
    if (name.endsWith('.csv') || name.endsWith('.xlsx')) return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
    return <FileText className="w-4 h-4 text-indigo-400" />;
  };

  // Filter based on folders and searches
  const filteredCategoryAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    // Filter folder
    if (activeFolder === 'images') {
      return asset.type.startsWith('image/');
    }
    if (activeFolder === 'attachments') {
      return !asset.type.startsWith('image/');
    }

    // Filter categorization tabs when viewing "all" folders
    if (activeTab === 'images') {
      return asset.type.startsWith('image/');
    }
    if (activeTab === 'docs') {
      return !asset.type.startsWith('image/');
    }

    return true;
  });

  // Folder statistical indicators
  const imagesCount = assets.filter((a) => a.type.startsWith('image/')).length;
  const attachmentsCount = assets.filter((a) => !a.type.startsWith('image/')).length;

  return (
    <div className="absolute right-2 top-12 bottom-2 w-[min(22rem,calc(100vw-1rem))] bg-white dark:bg-[#252526] border border-slate-200 dark:border-white/[0.08] flex flex-col z-40 select-none rounded-sm shadow-lg overflow-hidden">
      
      {/* Drawer Title Header */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between bg-[#f3f3f3] dark:bg-[#1e1e1e]">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-slate-500" />
          <div>
            <h3 className="font-semibold text-xs text-slate-800 dark:text-slate-100">本地共享文件夹</h3>
            <p className="text-[9px] text-slate-500 dark:text-slate-400">/assets/ (物理脱机暂存目录)</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer p-1 rounded-sm hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-colors duration-150 text-slate-500 dark:text-slate-300 hover:text-red-500"
          title="关闭文件夹面板"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Directory Folders Browser Selector Row */}
      <div className="p-2 border-b border-slate-200 dark:border-white/[0.08] flex flex-col gap-1.5 bg-[#f3f3f3] dark:bg-[#1e1e1e]">
        <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">目录浏览 (Directories)</div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => { setActiveFolder('root'); setActiveTab('all'); }}
            className={`cursor-pointer px-1 py-1.5 rounded-sm border flex flex-col items-center justify-center transition-colors duration-150 ${
              activeFolder === 'root'
                ? 'bg-[#0e639c]/10 border-[#0e639c]/50 text-[#0e639c] dark:text-[#4fc3f7] font-medium'
                : 'bg-white dark:bg-[#2d2d2d] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:border-[#0e639c]/40'
            }`}
          >
            <Folder className="w-4 h-4 text-slate-500 mb-0.5" />
            <span className="text-[9px] truncate w-full text-center">/assets/</span>
          </button>

          <button
            onClick={() => setActiveFolder('images')}
            className={`cursor-pointer px-1 py-1.5 rounded-sm border flex flex-col items-center justify-center transition-colors duration-150 ${
              activeFolder === 'images'
                ? 'bg-[#0e639c]/10 border-[#0e639c]/50 text-[#0e639c] dark:text-[#4fc3f7] font-medium'
                : 'bg-white dark:bg-[#2d2d2d] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:border-[#0e639c]/40'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-emerald-500 mb-0.5" />
            <span className="text-[9px] truncate w-full text-center">/images ({imagesCount})</span>
          </button>

          <button
            onClick={() => setActiveFolder('attachments')}
            className={`cursor-pointer px-1 py-1.5 rounded-sm border flex flex-col items-center justify-center transition-colors duration-150 ${
              activeFolder === 'attachments'
                ? 'bg-[#0e639c]/10 border-[#0e639c]/50 text-[#0e639c] dark:text-[#4fc3f7] font-medium'
                : 'bg-white dark:bg-[#2d2d2d] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:border-[#0e639c]/40'
            }`}
          >
            <Folder className="w-4 h-4 text-amber-500 mb-0.5" />
            <span className="text-[9px] truncate w-full text-center">/attachments ({attachmentsCount})</span>
          </button>
        </div>
      </div>

      {/* Directory files list filters */}
      <div className="p-2 border-b border-slate-200 dark:border-white/[0.08] space-y-1.5 bg-[#f3f3f3] dark:bg-[#1e1e1e]">
        
        {/* Local Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="搜索物理文件夹中缓存..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-[11px] pl-7 pr-2 py-1.5 rounded-sm border border-slate-300 dark:border-white/[0.10] bg-white dark:bg-[#3c3c3c] text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-[#0e639c] transition-colors duration-150"
          />
        </div>

        {/* Categories Tab selectors (Only visible in root mode) */}
        {activeFolder === 'root' && (
          <div className="flex bg-white dark:bg-[#2d2d2d] p-0.5 rounded-sm border border-slate-200 dark:border-white/[0.08] text-[10px]">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 py-1 rounded-sm ${
                activeTab === 'all'
                  ? 'bg-[#e8e8e8] dark:bg-[#37373d] font-medium text-[#0e639c] dark:text-[#4fc3f7]'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              全部 ({assets.length})
            </button>
            <button
              onClick={() => setActiveTab('images')}
              className={`flex-1 py-1 rounded-sm ${
                activeTab === 'images'
                  ? 'bg-[#e8e8e8] dark:bg-[#37373d] font-medium text-[#0e639c] dark:text-[#4fc3f7]'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              图片库 ({imagesCount})
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`flex-1 py-1 rounded-sm ${
                activeTab === 'docs'
                  ? 'bg-[#e8e8e8] dark:bg-[#37373d] font-medium text-[#0e639c] dark:text-[#4fc3f7]'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              附件 ({attachmentsCount})
            </button>
          </div>
        )}
      </div>

      {/* Directory listing stream container */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-transparent"
      >
        {/* Drag over Dropzone feedback info card */}
        <div className="p-2.5 mb-1 bg-[#0e639c]/5 dark:bg-[#0e639c]/10 rounded-sm border border-dashed border-[#0e639c]/30 text-center relative hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <ArrowUpToLine className="w-4 h-4 text-[#0e639c] dark:text-[#4fc3f7] mx-auto mb-1" />
          <p className="text-[10px] text-slate-600 dark:text-slate-300 font-medium leading-normal">
            点击或拖放本地任意图片/工程文件附件至此
          </p>
          <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
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

        {/* Current Folder Path Header Indicator */}
        <div className="text-[9px] text-slate-500 dark:text-slate-400 px-1 py-0.5 flex items-center gap-1">
          <span>文件列表</span>
          <span>/</span>
          <span className="font-medium underline">
            assets{activeFolder !== 'root' ? `/${activeFolder}` : ''}
          </span>
          <span>({filteredCategoryAssets.length} 项)</span>
        </div>

        {/* Loop Asset Items */}
        {filteredCategoryAssets.length === 0 ? (
          <div className="py-8 text-center space-y-1.5">
            <Folder className="w-7 h-7 text-slate-400 dark:text-slate-600 mx-auto opacity-50" />
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
              该文件夹下空空如也
            </p>
          </div>
        ) : (
          filteredCategoryAssets.map((asset) => (
            <div
              key={asset.id}
              className="p-2.5 bg-white dark:bg-[#2d2d2d] border border-slate-200 dark:border-white/[0.08] hover:border-[#0e639c]/40 rounded-sm hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors duration-150 text-xs flex flex-col gap-2 group"
              id={`asset-file-${asset.id}`}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-sm bg-slate-100 dark:bg-black/30 flex items-center justify-center shrink-0 border border-slate-200 dark:border-white/[0.06]">
                    {getFileIcon(asset.type, asset.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-100 truncate" title={asset.name}>
                      {asset.name}
                    </div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                      <span>{asset.size}</span>
                      <span>•</span>
                      <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteAsset(asset.id, asset.name)}
                  className="cursor-pointer text-slate-500 hover:text-red-500 p-1 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除物理附件"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Thumbnail image previews directly in the folder viewer */}
              {asset.type.startsWith('image/') && asset.content && (
                <div className="rounded-sm overflow-hidden border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-black/20 p-1 max-h-24 flex items-center justify-center">
                  <img
                    src={asset.content}
                    alt={asset.name}
                    className="max-h-20 max-w-full object-contain rounded-sm"
                  />
                </div>
              )}

              {/* Action shortcuts docked cleanly inside element */}
              <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-200 dark:border-white/[0.08]">
                <button
                  onClick={() => handleCopyRef(asset)}
                  className="cursor-pointer bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.10] text-[10px] text-slate-700 dark:text-slate-300 py-1 px-1.5 rounded-sm border border-slate-200 dark:border-white/[0.08] flex items-center justify-center gap-1.5 transition-colors font-medium"
                  title="拷贝该附件的 Markdown 或是 Wiki 等引用语法"
                >
                  {copiedId === asset.id ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">已拷贝</span>
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
                  className="cursor-pointer bg-[#0e639c]/10 hover:bg-[#0e639c]/20 dark:bg-[#0e639c]/20 dark:hover:bg-[#0e639c]/30 text-[10px] text-[#0e639c] dark:text-[#4fc3f7] py-1 px-1.5 rounded-sm border border-[#0e639c]/20 dark:border-[#0e639c]/30 flex items-center justify-center gap-1.5 transition-colors font-medium"
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

      {/* Directory capacity progress indicator */}
      <div className="p-2 border-t border-slate-200 dark:border-white/[0.08] bg-[#f3f3f3] dark:bg-[#1e1e1e] text-[10px] space-y-1">
        <div className="flex justify-between font-mono text-slate-500 dark:text-slate-400">
          <span>Tauri Folder Limit</span>
          <span className="font-medium">6.2 MB / 50 MB (12%)</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1 overflow-hidden">
          <div className="bg-[#0e639c] h-1 rounded-full" style={{ width: '12%' }}></div>
        </div>
        <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-normal">
          注: 本地文档引擎支持图片/音视频任意附件挂载，体积受本地独立沙盒配额限制。
        </p>
      </div>

    </div>
  );
}
