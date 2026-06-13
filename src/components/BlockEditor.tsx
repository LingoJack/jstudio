import React, { useMemo, useState, useRef, useCallback } from 'react';
import { Document, Block, BlockType } from '../types';
import BlockItem from './BlockItem';
import { Link2 } from 'lucide-react';

interface BlockEditorProps {
  document: Document;
  documents: Document[];
  onSelectDocument: (id: string) => void;
  onUpdateDocument: (updatedFields: Partial<Document>) => void;
}

export default function BlockEditor({
  document: activeDoc,
  documents,
  onSelectDocument,
  onUpdateDocument,
}: BlockEditorProps) {
  
  const [newlyCreatedBlockId, setNewlyCreatedBlockId] = useState<string | null>(null);
  const backlinks = useMemo(() => {
    if (!activeDoc) return [];
    return documents.filter((doc) => {
      if (doc.id === activeDoc.id) return false;
      return doc.blocks.some((block) => {
        return (
          block.content &&
          block.content.toLowerCase().includes(`[[${activeDoc.title.toLowerCase()}]]`)
        );
      });
    });
  }, [documents, activeDoc]);

  // Add a new block at the end of the document
  const appendBlockAtEnd = (type: BlockType) => {
    const newBlock: Block = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      content: '',
      properties: {},
    };

    setNewlyCreatedBlockId(newBlock.id);

    onUpdateDocument({
      blocks: [...activeDoc.blocks, newBlock],
    });
  };

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

  // Focus the editable child of a block. Used by title → first block (↓)
  // and by the first block → title (↑) round-trip.
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

  // Focus the document title input. Used by the first block ↑ to bounce up.
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
    const el = e.currentTarget;
    const isAtEnd =
      el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    const isAtStart = el.selectionStart === 0 && el.selectionEnd === 0;

    if (e.key === 'ArrowDown' && (isAtEnd || el.value.length === 0)) {
      // Jump from title into the first block, at its end.
      if (activeDoc.blocks.length > 0) {
        e.preventDefault();
        focusBlockEditable(activeDoc.blocks[0].id, 'end');
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Enter on title: insert a fresh text block below and focus it.
      e.preventDefault();
      if (activeDoc.blocks.length === 0) {
        appendBlockAtEnd('text');
      } else {
        insertBlockBelowIndex(activeDoc.blocks[0].id, 'text');
      }
    } else if (e.key === 'ArrowUp' && isAtStart) {
      // Nothing to navigate to above the title, swallow to avoid losing focus.
      e.preventDefault();
    }
  };

  // Insert a block directly below a given block ID
  const insertBlockBelowIndex = (targetBlockId: string, type: BlockType) => {
    const targetIdx = activeDoc.blocks.findIndex((b) => b.id === targetBlockId);
    if (targetIdx === -1) return;

    const newBlock: Block = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      content: '',
      properties: {},
    };

    const blocksCopy = [...activeDoc.blocks];
    blocksCopy.splice(targetIdx + 1, 0, newBlock);

    setNewlyCreatedBlockId(newBlock.id);

    onUpdateDocument({
      blocks: blocksCopy,
    });
  };

  // Modify a single block's values
  const updateBlockContent = (blockId: string, updatedFields: Partial<Block>) => {
    const updatedBlocks = activeDoc.blocks.map((b) => {
      if (b.id === blockId) {
        return { ...b, ...updatedFields };
      }
      return b;
    });

    onUpdateDocument({
      blocks: updatedBlocks,
    });
  };

  // Delete a block
  const deleteBlockInline = (blockId: string, mergeContent?: string) => {
    const targetIdx = activeDoc.blocks.findIndex(b => b.id === blockId);
    let nextFocusId: string | null = null;
    let updatedBlocks = [...activeDoc.blocks];

    if (targetIdx > 0) {
      const prevBlock = updatedBlocks[targetIdx - 1];
      nextFocusId = prevBlock.id;
      
      if (mergeContent !== undefined) {
         updatedBlocks[targetIdx - 1] = {
           ...prevBlock,
           content: prevBlock.content + mergeContent
         };
      }
    } else if (targetIdx === 0 && activeDoc.blocks.length > 1) {
      nextFocusId = activeDoc.blocks[1].id;
    }

    // Keep at least one empty block if user clears everything
    updatedBlocks = updatedBlocks.filter((b) => b.id !== blockId);
    if (updatedBlocks.length === 0) {
      const fallbackId = `block-fallback-${Date.now()}`;
      updatedBlocks = [
        {
          id: fallbackId,
          type: 'text',
          content: '',
          properties: {},
        },
      ];
      nextFocusId = fallbackId;
    }

    if (nextFocusId) {
      setNewlyCreatedBlockId(nextFocusId);
    }

    onUpdateDocument({
      blocks: updatedBlocks,
    });
  };

  // Handle emoji quick collection
  const emojiOptions = ['📝', '🧪', '🎨', '📚', '📆', '🚀', '🧠', '💡', '🏁', '⭐'];

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">

      {/* Editor Canvas Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-20 py-8 md:py-12 space-y-6 bg-white dark:bg-[#1e1e1e] select-text">
        {/* Document Title header */}
        <div className="pb-4">
          <input
            ref={titleInputRef}
            type="text"
            value={activeDoc.title}
            onChange={(e) => onUpdateDocument({ title: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            data-block-editable="true"
            placeholder="文档标题"
            className="text-4xl font-bold text-slate-800 dark:text-slate-200 bg-transparent border-none focus:outline-none w-full placeholder-slate-300 dark:placeholder-slate-600 pb-1 border-b border-transparent focus:border-[#0e639c]/40 dark:focus:border-[#0e639c]/50 transition-colors duration-200"
          />
        </div>

        {/* Blocks rendering stream */}
        <div className="space-y-2 min-h-[50vh]" id="blocks-container">
          {activeDoc.blocks.map((block, index) => (
            <BlockItem
              key={block.id}
              ref={(node) => registerBlockNode(block.id, node)}
              block={block}
              documents={documents}
              onUpdateBlock={(fields) => updateBlockContent(block.id, fields)}
              onDeleteBlock={(content) => deleteBlockInline(block.id, content)}
              onNavigateToDoc={onSelectDocument}
              onInsertBlockBelow={(type) => insertBlockBelowIndex(block.id, type)}
              autoFocus={newlyCreatedBlockId === block.id}
              onRequestFocusTitle={() => focusTitle('end')}
              onRequestFocusBlock={(offset) => {
                if (offset < 0) {
                  return focusBlockEditable(activeDoc.blocks[index + offset]?.id ?? '', 'end');
                }
                if (offset > 0) {
                  return focusBlockEditable(activeDoc.blocks[index + offset]?.id ?? '', 'start');
                }
                return false;
              }}
            />
          ))}
        </div>

        {/* Dynamic Backlinks View Section */}
        {backlinks.length > 0 && (
          <div className="pt-10 mt-10 border-t border-slate-200 dark:border-white/[0.08]" id="backlinks-section">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
              <Link2 className="w-3 h-3" />
              <span>引用链接 ({backlinks.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {backlinks.map((link) => (
                <span
                  key={link.id}
                  onClick={() => onSelectDocument(link.id)}
                  className="cursor-pointer px-2.5 py-1 bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 rounded-sm text-xs transition-colors duration-150 hover:text-[#0e639c] hover:bg-[#0e639c]/10 dark:hover:bg-[#0e639c]/20"
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
