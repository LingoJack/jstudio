import { ChevronDown, ChevronRight } from 'lucide-react';
import type { BaseBlockProps } from './types';
import BlockLine from './BlockLine';
import { useStore } from '../../store/useStore';

/**
 * TYPE: toggle — a foldable section with a title.
 * The chevron is a non-editable island inside the surface.
 */
export default function ToggleBlock({ block }: BaseBlockProps) {
  const isOpen = block.properties?.isOpen ?? false;
  const toggle = () => {
    // Direct store update — toggle doesn't need surface involvement
    useStore.getState().updateBlock(block.id, {
      properties: { ...block.properties, isOpen: !isOpen },
    });
  };

  return (
    <div className="rounded-sm p-3 bg-[var(--vscode-textBlockQuote-background)]">
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          contentEditable={false}
          className="cursor-pointer text-[var(--vscode-icon-foreground)] shrink-0"
        >
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <BlockLine
          tagName="div"
          html={block.content}
          placeholder="折叠区主题..."
          className="w-full text-sm font-semibold text-[var(--vscode-editor-foreground)] flex-1"
        />
      </div>
      {isOpen && (
        <div className="pl-6 mt-3 pt-3 text-xs text-[var(--vscode-descriptionForeground)]">
          {block.properties?.caption || '（展开状态，暂无附加内容）'}
        </div>
      )}
    </div>
  );
}
