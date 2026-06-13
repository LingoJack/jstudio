import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react';
import type { TextBlockProps } from './types';
import EditableText from './EditableText';
import SlashMenu from './SlashMenu';
import { useBlockEditor } from './useBlockEditor';

/**
 * TYPE: toggle — a foldable section with a title and collapsible body.
 * Uses EditableText for the title for consistent editing experience.
 */
export default function ToggleBlock({
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
      <div className="rounded-sm p-3 bg-[var(--vscode-textBlockQuote-background)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              onUpdateBlock({
                properties: {
                  ...block.properties,
                  isOpen: !block.properties?.isOpen,
                },
              })
            }
            className="cursor-pointer text-[var(--vscode-icon-foreground)] shrink-0"
          >
            {block.properties?.isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          <EditableText
            ref={elementRef as React.RefObject<HTMLDivElement>}
            tagName="div"
            onKeyDown={editor.handleKeyDown}
            onPaste={editor.handlePaste}
            html={rawText}
            onChange={(val, text) => editor.handleTextChange(val, text)}
            placeholder="折叠区主题..."
            className="w-full text-sm font-semibold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none min-h-[1.5rem] flex-1"
          />
        </div>

        {block.properties?.isOpen && (
          <div className="pl-6 mt-3 pt-3">
            <div className="flex items-start gap-2">
              <CornerDownRight className="w-4 h-4 text-[var(--vscode-icon-foreground)] opacity-50 mt-1 shrink-0" />
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
