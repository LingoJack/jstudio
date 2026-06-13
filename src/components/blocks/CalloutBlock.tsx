import { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import type { TextBlockProps } from './types';
import EditableText from './EditableText';
import SlashMenu from './SlashMenu';
import { useBlockEditor } from './useBlockEditor';

/**
 * TYPE: callout — a highlighted info card with an icon.
 * Uses EditableText for multi-line support and native text selection.
 */
export default function CalloutBlock({
  block,
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

  const editor = useBlockEditor({
    blockId: block.id,
    rawText,
    setRawText,
    onUpdateBlock,
    onDeleteBlock,
    onInsertBlockBelow,
    elementRef,
    autoFocus,
    onRequestFocusTitle,
    onRequestFocusBlock,
  });

  return (
    <div className="relative">
      <div className="flex items-start gap-3 p-4 bg-[var(--vscode-textBlockQuote-background)] rounded-sm border-l-4 border-l-[var(--vscode-focusBorder)]">
        <FileText className="w-4 h-4 text-[var(--vscode-icon-foreground)] mt-0.5 shrink-0" />
        <div className="flex-1">
          <EditableText
            ref={elementRef as React.RefObject<HTMLDivElement>}
            tagName="div"
            onKeyDown={editor.handleKeyDown}
            onPaste={editor.handlePaste}
            html={rawText}
            onChange={(val, text) => editor.handleTextChange(val, text)}
            placeholder="在此输入高亮提示卡内容..."
            className="w-full text-sm font-medium text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none min-h-[1.5rem]"
          />
        </div>
      </div>

      {editor.showSlashMenu && (
        <SlashMenu
          slashMenuIndex={editor.slashMenuIndex}
          slashMenuCoords={editor.slashMenuCoords}
          onExecute={editor.executeSlashCommand}
        />
      )}
    </div>
  );
}
