import { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import type { TextBlockProps } from './types';
import SlashMenu from './SlashMenu';
import { useBlockEditor } from './useBlockEditor';

/**
 * TYPE: callout — a highlighted info card with an icon.
 */
export default function CalloutBlock({
  block,
  documents,
  onUpdateBlock,
  onDeleteBlock,
  onInsertBlockBelow,
  autoFocus,
  onRequestFocusTitle,
  onRequestFocusBlock,
}: TextBlockProps) {
  const [rawText, setRawText] = useState(block.content);
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setRawText(block.content);
  }, [block.content]);

  useEffect(() => {
    if (autoFocus && elementRef.current) {
      elementRef.current.focus();
      const len = (elementRef.current as HTMLInputElement).value?.length ?? 0;
      try {
        (elementRef.current as HTMLInputElement).setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }
  }, [autoFocus]);

  const {
    showSlashMenu,
    slashMenuIndex,
    slashMenuCoords,
    handleKeyDown,
    handleTextChange,
    executeSlashCommand,
  } = useBlockEditor({
    rawText,
    setRawText,
    documents,
    onUpdateBlock,
    onDeleteBlock,
    onInsertBlockBelow,
    elementRef,
    onRequestFocusTitle,
    onRequestFocusBlock,
  });

  return (
    <div className="relative">
      <div className="flex items-start gap-3 p-4 bg-[var(--vscode-textBlockQuote-background)] rounded-sm border-l-4 border-l-[var(--vscode-focusBorder)]">
        <FileText className="w-4 h-4 text-[var(--vscode-icon-foreground)] mt-0.5 shrink-0" />
        <div className="flex-1">
          <input
            data-block-editable="true"
            ref={elementRef as React.RefObject<HTMLInputElement>}
            onKeyDown={handleKeyDown}
            type="text"
            value={rawText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="在此输入高亮提示卡内容..."
            className="w-full text-sm font-medium text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      {showSlashMenu && (
        <SlashMenu
          slashMenuIndex={slashMenuIndex}
          slashMenuCoords={slashMenuCoords}
          onExecute={executeSlashCommand}
        />
      )}
    </div>
  );
}
