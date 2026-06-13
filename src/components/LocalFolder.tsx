import { useState, useEffect, useRef, useCallback } from 'react';
import { storage, AssetInfo } from '../lib/storage';
import { useStore } from '../store/useStore';
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

interface LocalFolderProps {
  onClose: () => void;
}

export default function LocalFolder({ onClose }: LocalFolderProps) {
  const insertAssetAsBlock = useStore((s) => s.insertAssetAsBlock);

  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [thumbCache, setThumbCache] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'docs'>('all');
  const [activeFolder, setActiveFolder] = useState<string>('root');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshAssets = useCallback(async () => {
    try {
      const list = await storage.listAssets();
      setAssets(list);
    } catch (e) {
      console.error('Failed to load assets:', e);
      setAssets([]);
    }
  }, []);

  useEffect(() => {
    refreshAssets();
  }, [refreshAssets]);

  // Lazily load image thumbnails as base64 data URIs
  useEffect(() => {
    for (const asset of assets) {
      if (
        asset.type.startsWith('image/') &&
        !thumbCache[asset.fileName]
      ) {
        storage
          .readAssetBase64(asset.fileName)
          .then((b64) => {
            setThumbCache((prev) => ({
              ...prev,
              [asset.fileName]: `data:${asset.type};base64,${b64}`,
            }));
          })
          .catch(() => {});
      }
    }
  }, [assets, thumbCache]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const assetId = `asset-${Date.now()}`;
    const ext = file.name.split('.').pop() || 'bin';

    // Read file as binary
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));

    try {
      await storage.saveAsset(assetId, bytes, ext);
      await refreshAssets();
    } catch (err) {
      console.error('Failed to save asset:', err);
      alert('附件保存失败，请重试。');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const assetId = `asset-${Date.now()}`;
    const ext = file.name.split('.').pop() || 'bin';

    const arrayBuffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));

    try {
      await storage.saveAsset(assetId, bytes, ext);
      await refreshAssets();
    } catch (err) {
      console.error('Failed to save dropped asset:', err);
    }
  };

  const handleDeleteAsset = async (fileName: string, name: string) => {
    if (confirm(`确定要将附件「${name}」从本地硬盘彻底删除吗？`)) {
      try {
        await storage.deleteAsset(fileName);
        await refreshAssets();
      } catch (err) {
        console.error('Failed to delete asset:', err);
      }
    }
  };

  const handleInsertToDoc = async (asset: AssetInfo) => {
    let content = '';
    if (asset.type.startsWith('image/')) {
      try {
        const b64 = await storage.readAssetBase64(asset.fileName);
        content = `data:${asset.type};base64,${b64}`;
      } catch (e) {
        console.error('Failed to load asset for insertion:', e);
      }
    }

    insertAssetAsBlock({
      name: asset.name,
      type: asset.type,
      size: asset.size,
      content,
    });
  };

  const handleCopyRef = (asset: AssetInfo) => {
    const refCode = asset.type.startsWith('image/')
      ? `![${asset.name}](${asset.fileName})`
      : `[附件:${asset.name}](${asset.size})`;
    navigator.clipboard.writeText(refCode);
    setCopiedId(asset.fileName);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getFileIcon = (type: string, name: string) => {
    if (type.startsWith('image/'))
      return (
        <ImageIcon className="w-4 h-4 text-[var(--vscode-symbolIcon-eventForeground)]" />
      );
    if (name.endsWith('.sql') || name.endsWith('.db'))
      return (
        <Database className="w-4 h-4 text-[var(--vscode-symbolIcon-namespaceForeground)]" />
      );
    if (name.endsWith('.csv') || name.endsWith('.xlsx'))
      return (
        <FileSpreadsheet className="w-4 h-4 text-[var(--vscode-terminal-ansiGreen)]" />
      );
    return (
      <FileText className="w-4 h-4 text-[var(--vscode-symbolIcon-fileForeground)]" />
    );
  };

  const filteredCategoryAssets = assets.filter((asset) => {
    const matchesSearch = asset.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFolder === 'images') return asset.type.startsWith('image/');
    if (activeFolder === 'attachments') return !asset.type.startsWith('image/');
    if (activeTab === 'images') return asset.type.startsWith('image/');
    if (activeTab === 'docs') return !asset.type.startsWith('image/');
    return true;
  });

  const imagesCount = assets.filter((a) => a.type.startsWith('image/')).length;
  const attachmentsCount = assets.filter((a) => !a.type.startsWith('image/'))
    .length;

  // Calculate total size
  const totalSizeBytes = assets.reduce(
    (sum, a) => sum + (a.sizeBytes ?? 0),
    0,
  );
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);
  const usagePercent = Math.min(
    100,
    Math.round((totalSizeBytes / (50 * 1024 * 1024)) * 100),
  );

  const folderBtnBase =
    'cursor-pointer px-1 py-1.5 rounded-md border flex flex-col items-center justify-center transition-colors duration-150';
  const folderBtnActive =
    'bg-[var(--vscode-list-activeSelectionBackground)] border-[var(--vscode-list-activeSelectionBackground)] text-white font-medium';
  const folderBtnInactive =
    'bg-[var(--vscode-editor-background)] border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-list-activeSelectionBackground)]';

  const tabBtnBase = 'flex-1 py-1 rounded-sm transition-colors';
  const tabBtnActive =
    'bg-[var(--vscode-list-activeSelectionBackground)] font-medium text-white';
  const tabBtnInactive =
    'text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]';

  return (
    <div className="absolute right-2 top-12 bottom-2 w-[min(22rem,calc(100vw-1rem))] bg-[var(--vscode-sideBar-background)] border border-[var(--vscode-widget-border)] flex flex-col z-40 select-none rounded-lg shadow-xl overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-widget-border)] flex items-center justify-between bg-[var(--vscode-sideBarSectionHeader-background)]">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
          <div>
            <h3 className="font-semibold text-xs text-[var(--vscode-sideBarTitle-foreground)]">
              本地共享文件夹
            </h3>
            <p className="text-[9px] text-[var(--vscode-descriptionForeground)]">
              ~/.jdata/studio/assets/
            </p>
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
        <div className="text-[10px] uppercase font-semibold text-[var(--vscode-descriptionForeground)]">
          目录浏览 (Directories)
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => {
              setActiveFolder('root');
              setActiveTab('all');
            }}
            className={`${folderBtnBase} ${activeFolder === 'root' ? folderBtnActive : folderBtnInactive}`}
          >
            <Folder className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] truncate w-full text-center">
              /assets/
            </span>
          </button>
          <button
            onClick={() => setActiveFolder('images')}
            className={`${folderBtnBase} ${activeFolder === 'images' ? folderBtnActive : folderBtnInactive}`}
          >
            <ImageIcon className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] truncate w-full text-center">
              /images ({imagesCount})
            </span>
          </button>
          <button
            onClick={() => setActiveFolder('attachments')}
            className={`${folderBtnBase} ${activeFolder === 'attachments' ? folderBtnActive : folderBtnInactive}`}
          >
            <Folder className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] truncate w-full text-center">
              /attachments ({attachmentsCount})
            </span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-2 border-b border-[var(--vscode-widget-border)] space-y-1.5 bg-[var(--vscode-sideBarSectionHeader-background)]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vscode-descriptionForeground)]" />
          <input
            type="text"
            placeholder="搜索本地文件..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-[11px] pl-7 pr-2 py-1.5 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:outline-none focus:border-[var(--vscode-focusBorder)] transition-colors duration-150"
          />
        </div>

        {activeFolder === 'root' && (
          <div className="flex bg-[var(--vscode-editor-background)] p-0.5 rounded border border-[var(--vscode-widget-border)] text-[10px]">
            <button
              onClick={() => setActiveTab('all')}
              className={`${tabBtnBase} ${activeTab === 'all' ? tabBtnActive : tabBtnInactive}`}
            >
              全部 ({assets.length})
            </button>
            <button
              onClick={() => setActiveTab('images')}
              className={`${tabBtnBase} ${activeTab === 'images' ? tabBtnActive : tabBtnInactive}`}
            >
              图片库 ({imagesCount})
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`${tabBtnBase} ${activeTab === 'docs' ? tabBtnActive : tabBtnInactive}`}
            >
              附件 ({attachmentsCount})
            </button>
          </div>
        )}
      </div>

      {/* File list */}
      <div
        onDragOver={(e) => e.preventDefault()}
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
            物理落盘到 ~/.jdata/studio/assets/
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
              key={asset.fileName}
              className="p-2.5 bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] hover:border-[var(--vscode-list-activeSelectionBackground)] rounded-md hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 text-xs flex flex-col gap-2 group"
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded bg-[var(--vscode-editorWidget-background)] flex items-center justify-center shrink-0 border border-[var(--vscode-widget-border)]">
                    {getFileIcon(asset.type, asset.name)}
                  </div>
                  <div className="min-w-0">
                    <div
                      className="font-medium text-[var(--vscode-foreground)] truncate"
                      title={asset.name}
                    >
                      {asset.name}
                    </div>
                    <div className="text-[9px] text-[var(--vscode-descriptionForeground)] font-mono flex items-center gap-1.5 mt-0.5">
                      <span>{asset.size}</span>
                      <span>•</span>
                      <span>
                        {new Date(asset.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteAsset(asset.fileName, asset.name)}
                  className="cursor-pointer text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除物理附件"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {asset.type.startsWith('image/') &&
                thumbCache[asset.fileName] && (
                  <div className="rounded overflow-hidden border border-[var(--vscode-widget-border)] bg-[var(--vscode-editorWidget-background)] p-1 max-h-24 flex items-center justify-center">
                    <img
                      src={thumbCache[asset.fileName]}
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
                  {copiedId === asset.fileName ? (
                    <>
                      <Check className="w-3 h-3 text-[var(--vscode-terminal-ansiGreen)]" />
                      <span className="text-[var(--vscode-terminal-ansiGreen)]">
                        已拷贝
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>复制引用</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleInsertToDoc(asset)}
                  className="cursor-pointer bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[10px] text-[var(--vscode-button-foreground)] py-1 px-1.5 rounded flex items-center justify-center gap-1.5 transition-colors font-medium"
                  title="将该媒体图片/附件一键置入当前文档末尾"
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
          <span>本地存储</span>
          <span className="font-medium">
            {totalSizeMB} MB / 50 MB ({usagePercent}%)
          </span>
        </div>
        <div className="w-full bg-[var(--vscode-editorWidget-background)] rounded-full h-1 overflow-hidden">
          <div
            className="bg-[var(--vscode-list-activeSelectionBackground)] h-1 rounded-full"
            style={{ width: `${usagePercent}%` }}
          ></div>
        </div>
        <p className="text-[9px] text-[var(--vscode-descriptionForeground)] leading-normal">
          注: 附件物理存储于 ~/.jdata/studio/assets/，无容量限制。
        </p>
      </div>
    </div>
  );
}
