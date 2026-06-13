import { Image as ImageIcon } from 'lucide-react';
import type { BaseBlockProps } from './types';

/**
 * TYPE: image — displays an image from URL or base64 drag-drop.
 */
export default function ImageBlock({ block, onUpdateBlock }: BaseBlockProps) {
  const handleImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      onUpdateBlock({
        content: base64,
        properties: { ...block.properties, imageType: 'base64' },
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleImageDrop}
      className="border border-dashed border-[var(--vscode-widget-border)] rounded-sm p-5 flex flex-col items-center justify-center gap-3 bg-[var(--vscode-textBlockQuote-background)]"
    >
      {block.content ? (
        <div className="max-w-md w-full">
          <img
            src={block.content}
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
