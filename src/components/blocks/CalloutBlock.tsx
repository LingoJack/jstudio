import { FileText } from 'lucide-react';
import type { BaseBlockProps } from './types';
import BlockLine from './BlockLine';

/**
 * TYPE: callout — a highlighted info card with an icon.
 * The icon is a non-editable island inside the surface.
 */
export default function CalloutBlock({ block }: BaseBlockProps) {
  return (
    <div className="flex items-start gap-3 p-4 bg-[var(--vscode-textBlockQuote-background)] rounded-sm border-l-4 border-l-[var(--vscode-focusBorder)]">
      <span contentEditable={false} className="shrink-0 mt-0.5">
        <FileText className="w-4 h-4 text-[var(--vscode-icon-foreground)]" />
      </span>
      <BlockLine
        tagName="div"
        html={block.content}
        placeholder="在此输入高亮提示卡内容..."
        className="w-full text-sm font-medium text-[var(--vscode-editor-foreground)]"
      />
    </div>
  );
}
