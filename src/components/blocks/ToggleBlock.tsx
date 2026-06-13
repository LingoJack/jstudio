import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react';
import type { TextBlockProps } from './types';
import SlashMenu from './SlashMenu';
import { useBlockEditor } from './useBlockEditor';

/**
 * TYPE: toggle — a foldable section with a title and collapsible body.
 */
export default function ToggleBlock({
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
      <div className="rounded-sm p-3 bg-[var(--vscode-textBlockQuote-background)]">
        <div className="flex items-center gap-2 cursor-pointer">
          <button
            onClick={() =>
              onUpdateBlock({
                properties: {
                  ...block.properties,
                  isOpen: !block.properties?.isOpen,
                },
              })
            }
            className="cursor-pointer text-[var(--vscode-icon-foreground)]"
          >
            {block.properties?.isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          <input
            data-block-editable="true"
            ref={elementRef as React.RefObject<HTMLInputElement>}
            onKeyDown={handleKeyDown}
            type="text"
            value={rawText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="折叠区主题..."
            className="w-full text-sm font-semibold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none"
          />
        </div>

        {block.properties?.isOpen && (
          <div className="pl-6 mt-3 pt-3">
            <div className="flex items-start gap-2">
              <CornerDownRight className="w-4 h-4 text-[var(--vscode-icon-foreground)] opacity-50 mt-1" />
              <textarea
                value={block.properties?.caption || ''}
                onChange={(e) =>
                  onUpdateBlock({
                    properties: {
                      ...block.properties,
                      caption: e.target.value,
                    },
                  })
                }
                placeholder="折叠详情与附加段落..."
                className="w-full text-xs text-[var(--vscode-descriptionForeground)] bg-transparent border-none resize-none focus:outline-none"
                rows={2}
              />
            </div>
          </div>
        )}
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
