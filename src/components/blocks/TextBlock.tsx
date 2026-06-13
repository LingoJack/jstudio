import { useState, useEffect, useRef } from 'react';
import type { TextBlockProps } from './types';
import EditableText from './EditableText';
import SlashMenu from './SlashMenu';
import { useBlockEditor } from './useBlockEditor';

/**
 * TYPE: text — the default paragraph block.
 * Uses a unified contentEditable for native text selection, copy, and paste.
 */
export default function TextBlock({
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
    <div className="relative group/text">
      <EditableText
        ref={elementRef as React.RefObject<HTMLDivElement>}
        tagName="div"
        onKeyDown={editor.handleKeyDown}
        onPaste={editor.handlePaste}
        html={rawText}
        onChange={(val, text) => editor.handleTextChange(val, text)}
        placeholder="输入 / 唤出命令"
        className="w-full text-sm text-[var(--vscode-foreground)] bg-transparent border-none focus:outline-none leading-relaxed min-h-[1.5rem] py-0.5"
      />

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
