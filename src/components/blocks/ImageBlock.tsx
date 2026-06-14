import { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { BaseBlockProps } from './types';
import { useStore } from '../../store/useStore';
import { storage } from '../../lib/storage';
import { contentToString } from '../../lib';

/**
 * TYPE: image — displays an image.
 *
 * Storage modes:
 *  - `url`:    content is a direct http/data URL
 *  - `asset`:  content is a relative path like `assets/image-xxx.png`
 *              stored inside the document's own folder
 *  - `base64`: content is a raw data URI (legacy / drag-drop)
 */
export default function ImageBlock({ block, onUpdateBlock }: BaseBlockProps) {
  const activeDocId = useStore((s) => s.activeDocId);
  const [resolvedSrc, setResolvedSrc] = useState<string>('');

  // Resolve asset paths to data URLs for display
  useEffect(() => {
    const content = contentToString(block.content);
    const imageType = block.properties?.imageType;

    if (!content) {
      setResolvedSrc('');
      return;
    }

    // Direct URL or data URI — use as-is
    if (
      imageType === 'url' ||
      content.startsWith('http') ||
      content.startsWith('data:') ||
      content.startsWith('blob:')
    ) {
      setResolvedSrc(content);
      return;
    }

    // Document-scoped asset path: assets/xxx.png
    if (activeDocId && content.startsWith('assets/')) {
      const fileName = content.slice('assets/'.length);
      storage
        .readDocAssetBase64(activeDocId, fileName)
        .then((b64) => {
          const mime = fileName.endsWith('.png')
            ? 'image/png'
            : fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')
              ? 'image/jpeg'
              : fileName.endsWith('.gif')
                ? 'image/gif'
                : fileName.endsWith('.webp')
                  ? 'image/webp'
                  : 'image/png';
          setResolvedSrc(`data:${mime};base64,${b64}`);
        })
        .catch((e) => {
          console.error('Failed to load doc image:', e);
          setResolvedSrc('');
        });
      return;
    }

    // Legacy base64
    setResolvedSrc(content);
  }, [block.content, block.properties?.imageType, activeDocId]);

  const handleImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    if (!activeDocId) return;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const savedName = await storage.saveDocAsset(
      activeDocId,
      file.name,
      Array.from(bytes),
    );
    onUpdateBlock({
      content: `assets/${savedName}`,
      properties: { ...block.properties, imageType: 'asset', caption: file.name },
    });
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleImageDrop}
      className="border border-dashed border-[var(--vscode-widget-border)] rounded-sm p-5 flex flex-col items-center justify-center gap-3 bg-[var(--vscode-textBlockQuote-background)]"
    >
      {resolvedSrc ? (
        <div className="max-w-md w-full">
          <img
            src={resolvedSrc}
            alt={block.properties?.caption || 'Image content'}
            referrerPolicy="no-referrer"
            className="rounded-sm object-contain w-full max-h-72 mx-auto"
          />
          <input
            type="text"
            value={block.properties?.caption || ''}
            onChange={(e) =>
              onUpdateBlock({
                properties: {
                  ...block.properties,
                  caption: e.target.value,
                },
              })
            }
            placeholder="添加说明文字..."
            className="w-full mt-2 text-center text-xs text-[var(--vscode-descriptionForeground)] bg-transparent border-none focus:outline-none"
          />
        </div>
      ) : (
        <div className="text-center py-4 space-y-2">
          <ImageIcon className="w-8 h-8 text-[var(--vscode-icon-foreground)] mx-auto opacity-60" />
          <p className="text-xs text-[var(--vscode-descriptionForeground)]">
            可拖放本地图片至此 或
          </p>
          <input
            type="text"
            placeholder="粘贴在线图片 URL..."
            onChange={(e) => onUpdateBlock({ content: e.target.value })}
            className="px-3 py-1.5 text-xs rounded-sm border border-[var(--vscode-widget-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] focus:outline-none w-64 text-center"
          />
        </div>
      )}
    </div>
  );
}
