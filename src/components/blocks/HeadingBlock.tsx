import { useState, useEffect, useRef } from 'react';
import type { TextBlockProps } from './types';
import ContentEditableBlock from './ContentEditableBlock';
import SlashMenu from './SlashMenu';
import { useBlockEditor } from './useBlockEditor';

interface HeadingBlockProps extends TextBlockProps {
  level: 1 | 2 | 3;
}

const STYLES: Record<number, string> = {
  1: 'w-full text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight bg-transparent border-none focus:outline-none focus:ring-0 placeholder-[var(--vscode-descriptionForeground)]',
  2: 'w-full text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight bg-transparent border-none focus:outline-none focus:ring-0 placeholder-[var(--vscode-descriptionForeground)]',
  3: 'w-full text-lg font-semibold text-slate-800 dark:text-slate-200 tracking-tight bg-transparent border-none focus:outline-none focus:ring-0 placeholder-[var(--vscode-descriptionForeground)]',
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
 * TYPE: heading-1 / heading-2 / heading-3 — merged into one component
 * with a `level` prop.
 */
export default function HeadingBlock({
  block,
  documents,
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

  useEffect(() => {
    if (autoFocus && elementRef.current) {
      elementRef.current.focus();
      if (elementRef.current.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(elementRef.current);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [autoFocus]);

  const {
    showSlashMenu,
    slashMenuIndex,
    slashMenuCoords,
    handleKeyDown,
    handleTextChange,
    handleBlur,
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
      <ContentEditableBlock
        ref={elementRef as React.RefObject<HTMLDivElement>}
        tagName={TAG_NAMES[level]}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        html={rawText}
        onChange={(val, text) =>
          handleTextChange(val, elementRef.current!, text)
        }
        placeholder={PLACEHOLDERS[level]}
        className={STYLES[level]}
      />

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
