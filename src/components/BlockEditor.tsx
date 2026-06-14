import { useState, useRef, useCallback, useEffect } from 'react';
import type { BlockType, Block } from '../types';
import { useStore } from '../store/useStore';
import BlockRouter from './blocks/BlockRouter';
import SlashMenu from './blocks/SlashMenu';
import { useSurfaceEditor } from './blocks/useSurfaceEditor';

export default function BlockEditor() {
  const activeDoc = useStore((s) => s.activeDoc);
  const documents = useStore((s) => s.documents);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);

  const [newlyCreatedBlockId, setNewlyCreatedBlockId] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const blockNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // ------------------------------------------------------------------
  // Block node registry — maps block IDs to DOM elements
  // ------------------------------------------------------------------
  const registerBlockNode = useCallback((id: string, node: HTMLElement | null) => {
    if (node) blockNodesRef.current.set(id, node);
    else blockNodesRef.current.delete(id);
  }, []);

  // ------------------------------------------------------------------
  // Focus helpers
  // ------------------------------------------------------------------
  const focusBlockAt = useCallback(
    (blockId: string, placement: 'start' | 'end' = 'end') => {
      const node = blockNodesRef.current.get(blockId);
      if (!node) return false;
      const line = node.querySelector<HTMLElement>('[data-block-line]');
      const surface = surfaceRef.current;
      if (!surface || !line) return false;

      surface.focus();
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(line);
        range.collapse(placement === 'end');
        sel.removeAllRanges();
        sel.addRange(range);
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
      try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
    });
    return true;
  }, []);

  // ------------------------------------------------------------------
  // Block operations (wrap store methods with focus management)
  // ------------------------------------------------------------------
  const insertBlockBelowIndex = useCallback(
    (targetBlockId: string, type: BlockType) => {
      useStore.getState().insertBlockBelow(targetBlockId, type);
      setTimeout(() => {
        const doc = useStore.getState().activeDoc;
        if (!doc) return;
        const idx = doc.blocks.findIndex((b) => b.id === targetBlockId);
        if (idx !== -1 && idx + 1 < doc.blocks.length) {
          const newId = doc.blocks[idx + 1].id;
          setNewlyCreatedBlockId(newId);
          focusBlockAt(newId, 'start');
        }
      }, 0);
    },
    [focusBlockAt],
  );

  const appendBlockAtEnd = useCallback(
    (type: BlockType) => {
      useStore.getState().appendBlockAtEnd(type);
      setTimeout(() => {
        const doc = useStore.getState().activeDoc;
        if (!doc) return;
        const last = doc.blocks[doc.blocks.length - 1];
        if (last) {
          setNewlyCreatedBlockId(last.id);
          focusBlockAt(last.id, 'start');
        }
      }, 0);
    },
    [focusBlockAt],
  );

  const deleteBlockInline = useCallback(
    (blockId: string, mergeContent?: string) => {
      const doc = useStore.getState().activeDoc;
      if (!doc) {
        useStore.getState().deleteBlock(blockId, mergeContent);
        return;
      }
      const idx = doc.blocks.findIndex((b) => b.id === blockId);
      const prevBlockId = idx > 0 ? doc.blocks[idx - 1].id : null;

      useStore.getState().deleteBlock(blockId, mergeContent);

      if (prevBlockId) {
        requestAnimationFrame(() => focusBlockAt(prevBlockId, 'end'));
      } else {
        // Deleted the first block — focus title
        requestAnimationFrame(() => focusTitle('end'));
      }
    },
    [focusBlockAt, focusTitle],
  );

  const duplicateBlockInline = useCallback(
    (blockId: string) => {
      useStore.getState().duplicateBlock(blockId);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Surface editor hook — handles all keyboard/input at container level
  // ------------------------------------------------------------------
  const surface = useSurfaceEditor({
    surfaceRef,
    blockNodesRef,
    onInsertBelow: insertBlockBelowIndex,
    onAppendEnd: appendBlockAtEnd,
    onDeleteBlock: deleteBlockInline,
    onDuplicateBlock: duplicateBlockInline,
    onUpdateBlock: (blockId, fields) => useStore.getState().updateBlock(blockId, fields),
    onFocusTitle: () => focusTitle('end'),
    onFocusBlock: (offset) => {
      const doc = useStore.getState().activeDoc;
      if (!doc) return false;
      const currentBlockId = getCurrentBlockId(surfaceRef.current);
      if (!currentBlockId) return false;
      const idx = doc.blocks.findIndex((b) => b.id === currentBlockId);
      const target = doc.blocks[idx + offset];
      if (target) return focusBlockAt(target.id, offset < 0 ? 'end' : 'start');
      return false;
    },
  });

  // ------------------------------------------------------------------
  // Auto-focus newly created block
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!newlyCreatedBlockId) return;
    const timer = setTimeout(() => focusBlockAt(newlyCreatedBlockId, 'start'), 10);
    return () => clearTimeout(timer);
  }, [newlyCreatedBlockId, focusBlockAt]);

  // ------------------------------------------------------------------
  // Title keydown
  // ------------------------------------------------------------------
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeDoc) return;
    const el = e.currentTarget;
    const isAtEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    const isAtStart = el.selectionStart === 0 && el.selectionEnd === 0;

    if (e.key === 'ArrowDown' && (isAtEnd || el.value.length === 0)) {
      if (activeDoc.blocks.length > 0) {
        e.preventDefault();
        focusBlockAt(activeDoc.blocks[0].id, 'start');
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

  const blocks = activeDoc.blocks;

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-20 py-8 md:py-12 bg-[var(--vscode-editor-background)] select-text">
        {/* Document Title */}
        <div className="pb-4">
          <input
            ref={titleInputRef}
            type="text"
            value={activeDoc.title}
            onChange={(e) => updateDocumentMeta({ title: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            placeholder="文档标题"
            className="text-4xl font-bold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none w-full placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-40 pb-1"
          />
        </div>

        {/* Blocks surface — ONE contentEditable for the entire document */}
        <div
          ref={surfaceRef}
          contentEditable
          suppressContentEditableWarning
          data-editor-surface="true"
          onInput={surface.handleInput}
          onKeyDown={surface.handleKeyDown}
          onPaste={surface.handlePaste}
          onBlur={surface.handleBlur}
          className="relative space-y-1 min-h-[50vh] outline-none"
        >
          {/* Slash command popover */}
          {surface.slashMenu.visible && (
            <SlashMenu
              slashMenuIndex={surface.slashMenu.index}
              slashMenuCoords={surface.slashMenu.coords}
              onExecute={surface.executeSlashCommand}
            />
          )}

          {blocks.map((block) => (
            <BlockRouter
              key={block.id}
              forwardedRef={(node) => registerBlockNode(block.id, node)}
              block={block}
              documents={documents}
              onUpdateBlock={(fields) => useStore.getState().updateBlock(block.id, fields)}
              onDeleteBlock={(content) => deleteBlockInline(block.id, content)}
              onNavigateToDoc={() => {}}
              onInsertBlockBelow={(type) => insertBlockBelowIndex(block.id, type)}
              onDuplicateBlock={() => duplicateBlockInline(block.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// Helpers
// ====================================================================

/** Find the block ID of the block that currently contains the caret. */
function getCurrentBlockId(surface: HTMLElement | null): string | null {
  if (!surface) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.anchorNode;
  while (node && node !== surface) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const id = el.getAttribute?.('data-block-id');
      if (id) return id;
    }
    node = node.parentNode;
  }
  return null;
}
