import { useState, useRef, useCallback } from 'react';
import { BlockType } from '../types';
import { useStore } from '../store/useStore';
import BlockRouter from './blocks/BlockRouter';

export default function BlockEditor() {
  const activeDoc = useStore((s) => s.activeDoc);
  const documents = useStore((s) => s.documents);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);
  const updateBlock = useStore((s) => s.updateBlock);
  const deleteBlock = useStore((s) => s.deleteBlock);
  const insertBlockBelowStore = useStore((s) => s.insertBlockBelow);
  const appendBlockAtEndStore = useStore((s) => s.appendBlockAtEnd);

  const [newlyCreatedBlockId, setNewlyCreatedBlockId] = useState<string | null>(null);

  const insertBlockBelowIndex = useCallback(
    (targetBlockId: string, type: BlockType) => {
      insertBlockBelowStore(targetBlockId, type);
      setTimeout(() => {
        const doc = useStore.getState().activeDoc;
        if (!doc) return;
        const idx = doc.blocks.findIndex((b) => b.id === targetBlockId);
        if (idx !== -1 && idx + 1 < doc.blocks.length) {
          setNewlyCreatedBlockId(doc.blocks[idx + 1].id);
        }
      }, 0);
    },
    [insertBlockBelowStore],
  );

  const appendBlockAtEnd = useCallback(
    (type: BlockType) => {
      appendBlockAtEndStore(type);
      setTimeout(() => {
        const doc = useStore.getState().activeDoc;
        if (!doc) return;
        const last = doc.blocks[doc.blocks.length - 1];
        if (last) setNewlyCreatedBlockId(last.id);
      }, 0);
    },
    [appendBlockAtEndStore],
  );

  const deleteBlockInline = useCallback(
    (blockId: string, mergeContent?: string) => {
      deleteBlock(blockId, mergeContent);
    },
    [deleteBlock],
  );

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const blockNodesRef = useRef<Map<string, HTMLElement>>(new Map());

  const registerBlockNode = useCallback((id: string, node: HTMLElement | null) => {
    if (node) blockNodesRef.current.set(id, node);
    else blockNodesRef.current.delete(id);
  }, []);

  const focusBlockEditable = useCallback(
    (blockId: string, placement: 'start' | 'end' = 'end') => {
      const node = blockNodesRef.current.get(blockId);
      if (!node) return false;
      const editable = node.querySelector<HTMLElement>("[data-block-editable='true']");
      if (!editable) return false;
      editable.focus();
      requestAnimationFrame(() => {
        if (editable.isContentEditable) {
          const sel = window.getSelection();
          if (!sel) return;
          const range = document.createRange();
          range.selectNodeContents(editable);
          range.collapse(placement === 'end');
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
      return true;
    },
    [],
  );

  const focusTitle = useCallback((placement: 'start' | 'end' = 'end') => {
    const el = titleInputRef.current;
    if (!el) return false;
    el.focus();
    requestAnimationFrame(() => {
      const pos = placement === 'end' ? el.value.length : 0;
      try {
        el.setSelectionRange(pos, pos);
      } catch { /* ignore */ }
    });
    return true;
  }, []);

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeDoc) return;
    const el = e.currentTarget;
    const isAtEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    const isAtStart = el.selectionStart === 0 && el.selectionEnd === 0;

    if (e.key === 'ArrowDown' && (isAtEnd || el.value.length === 0)) {
      if (activeDoc.blocks.length > 0) {
        e.preventDefault();
        focusBlockEditable(activeDoc.blocks[0].id, 'end');
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (activeDoc.blocks.length === 0) {
        appendBlockAtEnd('text');
      } else {
        insertBlockBelowIndex(activeDoc.blocks[0].id, 'text');
      }
    } else if (e.key === 'ArrowUp' && isAtStart) {
      e.preventDefault();
    }
  };

  if (!activeDoc) return null;

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-20 py-8 md:py-12 space-y-6 bg-[var(--vscode-editor-background)] select-text">
        {/* Document Title */}
        <div className="pb-4">
          <input
            ref={titleInputRef}
            type="text"
            value={activeDoc.title}
            onChange={(e) => updateDocumentMeta({ title: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            data-block-editable="true"
            placeholder="文档标题"
            className="text-4xl font-bold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none w-full placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-40 pb-1 border-b border-transparent focus:border-[var(--vscode-focusBorder)] transition-colors duration-200"
          />
        </div>

        {/* Blocks */}
        <div className="space-y-2 min-h-[50vh]" id="blocks-container">
          {activeDoc.blocks.map((block, index) => (
            <BlockRouter
              key={block.id}
              forwardedRef={(node) => registerBlockNode(block.id, node)}
              block={block}
              documents={documents}
              onUpdateBlock={(fields) => updateBlock(block.id, fields)}
              onDeleteBlock={(content) => deleteBlockInline(block.id, content)}
              onNavigateToDoc={() => {}}
              onInsertBlockBelow={(type) => insertBlockBelowIndex(block.id, type)}
              autoFocus={newlyCreatedBlockId === block.id}
              onRequestFocusTitle={() => focusTitle('end')}
              onRequestFocusBlock={(offset) => {
                if (offset < 0) return focusBlockEditable(activeDoc.blocks[index + offset]?.id ?? '', 'end');
                if (offset > 0) return focusBlockEditable(activeDoc.blocks[index + offset]?.id ?? '', 'start');
                return false;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
