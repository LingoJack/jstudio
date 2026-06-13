import { useState, useEffect, useRef } from 'react';
import type { TextBlockProps } from './types';
import EditableText from './EditableText';
import SlashMenu from './SlashMenu';
import { useBlockEditor } from './useBlockEditor';

interface HeadingBlockProps extends TextBlockProps {
  level: 1 | 2 | 3;
}

const STYLES: Record<number, string> = {
  1: 'w-full text-2xl font-bold tracking-tight bg-transparent border-none focus:outline-none py-1',
  2: 'w-full text-xl font-bold tracking-tight bg-transparent border-none focus:outline-none py-1',
  3: 'w-full text-lg font-semibold tracking-tight bg-transparent border-none focus:outline-none py-0.5',
};

const PLACEHOLDERS: Record<number, string> = {
  1: '主标题 1',
  2: '主题分类 2',
  3: '小标题 3',
};

const TAG_NAMES: Record<number, 'h1' | 'h2' | 'h3'> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
};

/**
 * TYPE: heading-1 / heading-2 / heading-3 — uses EditableText
 * with the appropriate tag and font styling.
 */
export default function HeadingBlock({
  block,
  onUpdateBlock,
  onDeleteBlock,
  onInsertBlockBelow,
  autoFocus,
  onRequestFocusTitle,
  onRequestFocusBlock,
  level,
}: HeadingBlockProps) {
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
      <EditableText
        ref={elementRef as React.RefObject<HTMLDivElement>}
        tagName={TAG_NAMES[level]}
        onKeyDown={editor.handleKeyDown}
        onPaste={editor.handlePaste}
        html={rawText}
        onChange={(val, text) => editor.handleTextChange(val, text)}
        placeholder={PLACEHOLDERS[level]}
        className={STYLES[level]}
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
