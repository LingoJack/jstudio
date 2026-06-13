import { useMemo, useState, useRef, useCallback } from 'react';
import { BlockType } from '../types';
import { useStore } from '../store/useStore';
import BlockRouter from './blocks/BlockRouter';
import { Link2 } from 'lucide-react';

export default function BlockEditor() {
  const activeDoc = useStore((s) => s.activeDoc);
  const documents = useStore((s) => s.documents);
  const openDocument = useStore((s) => s.openDocument);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);
  const updateBlock = useStore((s) => s.updateBlock);
  const deleteBlock = useStore((s) => s.deleteBlock);
  const insertBlockBelowStore = useStore((s) => s.insertBlockBelow);
  const appendBlockAtEndStore = useStore((s) => s.appendBlockAtEnd);

  const [newlyCreatedBlockId, setNewlyCreatedBlockId] = useState<string | null>(
    null,
  );

  const backlinks = useMemo(() => {
    if (!activeDoc) return [];
    return documents.filter((doc) => {
      if (doc.id === activeDoc.id) return false;
      return doc.blocks.some(
        (block) =>
          block.content &&
          block.content.toLowerCase().includes(`[[${activeDoc.title.toLowerCase()}]]`),
      );
    });
  }, [documents, activeDoc]);

  // Wrap the store's insertBlockBelow so we can capture the new block id
  // for auto-focus. We generate a predictable id prefix to match.
  const insertBlockBelowIndex = useCallback(
    (targetBlockId: string, type: BlockType) => {
      insertBlockBelowStore(targetBlockId, type);
      // The store generates the id; we use a microtask to find it.
      // Simpler: set a flag — the newly inserted block is right after target.
      // We'll use a setTimeout to read the updated store.
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
      // Focus logic is handled by BlockItem via onRequestFocusBlock
    },
    [deleteBlock],
  );

  // Title <input> ref & block nodes registry for keyboard navigation.
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const blockNodesRef = useRef<Map<string, HTMLElement>>(new Map());

  const registerBlockNode = useCallback((id: string, node: HTMLElement | null) => {
    if (node) {
      blockNodesRef.current.set(id, node);
    } else {
      blockNodesRef.current.delete(id);
    }
  }, []);

  const focusBlockEditable = useCallback(
    (blockId: string, placement: 'start' | 'end' = 'end') => {
      const node = blockNodesRef.current.get(blockId);
      if (!node) return false;
      const editable = node.querySelector<HTMLElement>(
        "[data-block-editable='true']",
      );
      if (!editable) return false;

      editable.focus();

      requestAnimationFrame(() => {
        if (
          editable instanceof HTMLTextAreaElement ||
          editable instanceof HTMLInputElement
        ) {
          const pos = placement === 'end' ? editable.value.length : 0;
          try {
            editable.setSelectionRange(pos, pos);
          } catch {
            /* ignore */
          }
        } else if (editable.isContentEditable) {
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
      } catch {
        /* ignore */
      }
    });
    return true;
  }, []);

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeDoc) return;
    const el = e.currentTarget;
    const isAtEnd =
      el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
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
      {/* Editor Canvas Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-20 py-8 md:py-12 space-y-6 bg-[var(--vscode-editor-background)] select-text">
        {/* Document Title header */}
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

        {/* Blocks rendering stream */}
        <div className="space-y-2 min-h-[50vh]" id="blocks-container">
          {activeDoc.blocks.map((block, index) => (
            <BlockRouter
              key={block.id}
              forwardedRef={(node) => registerBlockNode(block.id, node)}
              block={block}
              documents={documents}
              onUpdateBlock={(fields) => updateBlock(block.id, fields)}
              onDeleteBlock={(content) => deleteBlockInline(block.id, content)}
              onNavigateToDoc={openDocument}
              onInsertBlockBelow={(type) => insertBlockBelowIndex(block.id, type)}
              autoFocus={newlyCreatedBlockId === block.id}
              onRequestFocusTitle={() => focusTitle('end')}
              onRequestFocusBlock={(offset) => {
                if (offset < 0) {
                  return focusBlockEditable(
                    activeDoc.blocks[index + offset]?.id ?? '',
                    'end',
                  );
                }
                if (offset > 0) {
                  return focusBlockEditable(
                    activeDoc.blocks[index + offset]?.id ?? '',
                    'start',
                  );
                }
                return false;
              }}
            />
          ))}
        </div>

        {/* Dynamic Backlinks View Section */}
        {backlinks.length > 0 && (
          <div
            className="pt-10 mt-10 border-t border-[var(--vscode-widget-border)]"
            id="backlinks-section"
          >
            <div className="text-xs font-semibold text-[var(--vscode-descriptionForeground)] mb-3 flex items-center gap-1.5">
              <Link2 className="w-3 h-3" />
              <span>引用链接 ({backlinks.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {backlinks.map((link) => (
                <span
                  key={link.id}
                  onClick={() => openDocument(link.id)}
                  className="cursor-pointer px-2.5 py-1 bg-[var(--vscode-textBlockQuote-background)] text-[var(--vscode-textLink-foreground)] rounded-sm text-xs transition-colors duration-150 hover:bg-[var(--vscode-list-hoverBackground)]"
                >
                  {link.title}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
