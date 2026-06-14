import { useRef, useCallback } from 'react';
import type { BlockType, Block } from '../types';
import { useStore } from '../store/useStore';
import BlockRouter from './blocks/BlockRouter';
import SlashMenu from './blocks/SlashMenu';
import { useSurfaceEditor } from './blocks/useSurfaceEditor';

export default function BlockEditor() {
  const activeDoc = useStore((s) => s.activeDoc);
  const documents = useStore((s) => s.documents);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);

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
    (
      blockId: string,
      placement: 'start' | 'end' = 'end',
      charOffset?: number,
    ) => {
      const node = blockNodesRef.current.get(blockId);
      const surface = surfaceRef.current;
      if (!surface || !node) return false;
      const line = node.querySelector<HTMLElement>('[data-block-line]');

      // For non-text blocks (code, image, etc.) there's no [data-block-line].
      // Focus the surface and try to place the caret at the block boundary.
      if (!line) {
        surface.focus();
        // Try focusing within the island block (e.g. its first focusable child)
        const focusable = node.querySelector<HTMLElement>(
          'input, textarea, [contenteditable="true"], [tabindex]',
        );
        if (focusable) {
          requestAnimationFrame(() => focusable.focus());
        }
        return true;
      }

      surface.focus();
      requestAnimationFrame(() => {
        let sel: Selection | null;
        try {
          sel = window.getSelection();
        } catch {
          return;
        }
        if (!sel) return;
        const range = document.createRange();

        if (charOffset !== undefined) {
          // Place caret at a specific character offset within the line.
          // This is used after block merge to position at the boundary.
          const walker = document.createTreeWalker(
            line,
            NodeFilter.SHOW_TEXT,
            null,
          );
          let remaining = charOffset;
          let textNode: Text | null = null;
          while (walker.nextNode()) {
            textNode = walker.currentNode as Text;
            if (remaining <= textNode.length) {
              range.setStart(textNode, remaining);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
              return;
            }
            remaining -= textNode.length;
          }
          // Fallback: place at end if offset exceeds content
          range.selectNodeContents(line);
          range.collapse(false);
        } else {
          range.selectNodeContents(line);
          range.collapse(placement === 'end');
        }
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
      // Use double-rAF to ensure React has committed the new DOM node
      // before we try to focus it. A single rAF can fire before refs are set.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const doc = useStore.getState().activeDoc;
          if (!doc) return;
          const idx = doc.blocks.findIndex((b) => b.id === targetBlockId);
          if (idx !== -1 && idx + 1 < doc.blocks.length) {
            focusBlockAt(doc.blocks[idx + 1].id, 'start');
          }
        }),
      );
    },
    [focusBlockAt],
  );

  const appendBlockAtEnd = useCallback(
    (type: BlockType) => {
      useStore.getState().appendBlockAtEnd(type);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const doc = useStore.getState().activeDoc;
          if (!doc) return;
          const last = doc.blocks[doc.blocks.length - 1];
          if (last) {
            focusBlockAt(last.id, 'start');
          }
        }),
      );
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
      const isOnlyBlock = doc.blocks.length === 1;
      const prevBlock = idx > 0 ? doc.blocks[idx - 1] : null;
      const prevBlockId = prevBlock?.id ?? null;

      // Only calculate char offset when actually merging content (Backspace).
      // For handle-delete (no merge), we just focus at end of previous block.
      // The offset must be the TEXT length, not the HTML string length.
      const isMerging = mergeContent !== undefined && idx > 0;
      const prevTextLength = isMerging
        ? htmlTextLength(prevBlock!.content)
        : undefined;

      useStore.getState().deleteBlock(blockId, mergeContent);

      if (isOnlyBlock) {
        // The store creates a fallback text block. Focus it after mount.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const updatedDoc = useStore.getState().activeDoc;
            if (updatedDoc && updatedDoc.blocks.length > 0) {
              focusBlockAt(updatedDoc.blocks[0].id, 'start');
            } else {
              focusTitle('end');
            }
          }),
        );
      } else if (prevBlockId) {
        requestAnimationFrame(() =>
          focusBlockAt(prevBlockId, 'end', prevTextLength),
        );
      } else {
        // Deleted the first block (but not the only one) — focus title
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

  // Stable callbacks for BlockRouter — accept blockId as first arg so they
  // don't need to be re-created per block (preserves memo).
  const stableUpdateBlock = useCallback(
    (blockId: string, fields: Partial<Block>) => {
      useStore.getState().updateBlock(blockId, fields);
    },
    [],
  );
  const stableNavigateToDoc = useCallback((_docId: string) => {}, []);
  const stableInsertBelow = useCallback(
    (blockId: string, type: BlockType) => insertBlockBelowIndex(blockId, type),
    [insertBlockBelowIndex],
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
      // Ignore key auto-repeat to prevent creating multiple blocks at once
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
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
              onUpdateBlock={stableUpdateBlock}
              onDeleteBlock={deleteBlockInline}
              onNavigateToDoc={stableNavigateToDoc}
              onInsertBlockBelow={stableInsertBelow}
              onDuplicateBlock={duplicateBlockInline}
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
  let sel: Selection | null;
  try {
    sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
  } catch {
    return null;
  }
  let node: Node | null;
  try {
    node = sel.anchorNode;
  } catch {
    return null;
  }
  if (!node) return null;
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

/**
 * Get the visible text length of an HTML string.
 * Used to calculate caret offset after block merge.
 */
function htmlTextLength(html: string): number {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.innerText.length;
}
