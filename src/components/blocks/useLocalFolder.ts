import { useState, useEffect, useRef, useCallback } from 'react';
import { storage, AssetInfo } from '../../lib/storage';
import { useStore } from '../../store/useStore';

/**
 * Business logic for the local assets folder panel.
 *
 * Encapsulates: asset listing, upload, drag-and-drop, delete,
 * thumbnail loading, insertion into document, and copy-ref.
 */
export function useLocalFolder(onClose: () => void) {
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
      if (asset.type.startsWith('image/') && !thumbCache[asset.fileName]) {
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

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const assetId = `asset-${Date.now()}`;
      const ext = file.name.split('.').pop() || 'bin';

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
    },
    [refreshAssets],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
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
    },
    [refreshAssets],
  );

  const handleDeleteAsset = useCallback(
    async (fileName: string, name: string) => {
      if (confirm(`确定要将附件「${name}」从本地硬盘彻底删除吗？`)) {
        try {
          await storage.deleteAsset(fileName);
          await refreshAssets();
        } catch (err) {
          console.error('Failed to delete asset:', err);
        }
      }
    },
    [refreshAssets],
  );

  const handleInsertToDoc = useCallback(
    async (asset: AssetInfo) => {
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
    },
    [insertAssetAsBlock],
  );

  const handleCopyRef = useCallback((asset: AssetInfo) => {
    const refCode = asset.type.startsWith('image/')
      ? `![${asset.name}](${asset.fileName})`
      : `[附件:${asset.name}](${asset.size})`;
    navigator.clipboard.writeText(refCode);
    setCopiedId(asset.fileName);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return {
    assets,
    thumbCache,
    searchTerm,
    setSearchTerm,
    activeTab,
    setActiveTab,
    activeFolder,
    setActiveFolder,
    copiedId,
    fileInputRef,
    handleFileUpload,
    handleDrop,
    handleDeleteAsset,
    handleInsertToDoc,
    handleCopyRef,
  };
}
