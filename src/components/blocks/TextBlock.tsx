import { useState, useEffect, useRef } from 'react';
import type { TextBlockProps } from './types';
import ContentEditableBlock from './ContentEditableBlock';
import SlashMenu from './SlashMenu';
import { useBlockEditor } from './useBlockEditor';

/**
 * TYPE: text — the default paragraph block.
 * Supports inline Markdown formatting (bold, code, wiki-links) on blur.
 */
export default function TextBlock({
  block,
  documents,
  onUpdateBlock,
  onDeleteBlock,
  onNavigateToDoc,
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
    <div className="relative group/text">
      <div
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const link = target.closest('.wiki-link');
          if (link) {
            e.preventDefault();
            const docId = link.getAttribute('data-doc-id');
            if (docId) onNavigateToDoc(docId);
          }
        }}
      >
        <ContentEditableBlock
          ref={elementRef as React.RefObject<HTMLDivElement>}
          tagName="div"
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          html={rawText}
          onChange={(val, text) =>
            handleTextChange(val, elementRef.current!, text)
          }
          placeholder=""
          className="w-full text-sm text-[var(--vscode-foreground)] bg-transparent border-none focus:outline-none focus:ring-0 leading-relaxed block"
        />
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
