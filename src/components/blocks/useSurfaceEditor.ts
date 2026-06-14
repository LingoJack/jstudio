import { useState, useCallback, useRef, useEffect } from 'react';
import type { BlockType } from '../../types';
import { SLASH_COMMANDS, getDefaultProperties } from './shared';
import { useStore } from '../../store/useStore';

interface UseSurfaceEditorParams {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  blockNodesRef: React.RefObject<Map<string, HTMLElement>>;
  onInsertBelow: (blockId: string, type: BlockType) => void;
  onAppendEnd: (type: BlockType) => void;
  onDeleteBlock: (blockId: string, mergeContent?: string) => void;
  onDuplicateBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, fields: Record<string, unknown>) => void;
  onFocusTitle: () => boolean;
  onFocusBlock: (offset: number) => boolean;
}

interface SlashMenuState {
  visible: boolean;
  index: number;
  coords: { top: number; left: number } | null;
  blockId: string | null;
}

const NO_MENU: SlashMenuState = {
  visible: false,
  index: 0,
  coords: null,
  blockId: null,
};

/**
 * Unified surface-level editor hook.
 *
 * The entire document is ONE contentEditable surface. This hook handles
 * all keyboard, input, and paste events at the container level. Individual
 * text blocks are plain <div data-block-line> children inside the surface.
 *
 * This architecture — identical to Notion's — enables native cross-block
 * text selection, copy, and cut, because the browser sees one continuous
 * editable region rather than many isolated ones.
 */
export function useSurfaceEditor({
  surfaceRef,
  blockNodesRef,
  onInsertBelow,
  onDeleteBlock,
  onDuplicateBlock,
  onUpdateBlock,
  onFocusTitle,
  onFocusBlock,
}: UseSurfaceEditorParams) {
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>(NO_MENU);
  const saveImageToDoc = useStore((s) => s.saveImageToDoc);
  // Track whether we're in a "slash typing" session to debounce input
  const slashTypingRef = useRef(false);

  // ------------------------------------------------------------------
  // Find which block the caret is currently inside
  // ------------------------------------------------------------------
  const getCurrentBlockId = useCallback((): string | null => {
    const surface = surfaceRef.current;
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
  }, [surfaceRef]);

  // ------------------------------------------------------------------
  // Track which block is "active" (contains the caret) — sets
  // data-active attribute on the block wrapper so CSS can show
  // the BlockHandle for the current line.
  // ------------------------------------------------------------------
  const updateActiveBlock = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const activeId = getCurrentBlockId();

    // Clear previous active markers
    surface.querySelectorAll('[data-active]').forEach((el) => {
      el.removeAttribute('data-active');
    });
    // Mark current block
    if (activeId) {
      const node = blockNodesRef.current.get(activeId);
      if (node) node.setAttribute('data-active', 'true');
    }
  }, [surfaceRef, blockNodesRef, getCurrentBlockId]);

  // Listen for selection changes to update active block marker
  useEffect(() => {
    document.addEventListener('selectionchange', updateActiveBlock);
    return () => document.removeEventListener('selectionchange', updateActiveBlock);
  }, [updateActiveBlock]);

  // ------------------------------------------------------------------
  // Sync a single block's DOM content → store
  // ------------------------------------------------------------------
  const syncBlockToStore = useCallback(
    (blockId: string, el: HTMLElement) => {
      onUpdateBlock(blockId, { content: el.innerHTML });
    },
    [onUpdateBlock],
  );

  // ------------------------------------------------------------------
  // Input handler — detect which block changed, sync to store,
  // detect "/" for slash menu and markdown shortcuts
  // ------------------------------------------------------------------
  const handleInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      const blockId = getCurrentBlockId();
      if (!blockId) return;

      const node = blockNodesRef.current.get(blockId);
      const line = node?.querySelector<HTMLElement>('[data-block-line]');
      if (!line) return;

      // Sync to store
      syncBlockToStore(blockId, line);

      const text = line.innerText;

      // — Slash menu detection —
      // Trigger when the block text is just "/" (empty line) or starts with "/"
      // followed by a filter query.
      const trimmed = text.trimStart();
      if (trimmed.startsWith('/') && !trimmed.includes('\n')) {
        const surface = surfaceRef.current;
        if (surface) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const parentRect = surface.getBoundingClientRect();
            setSlashMenu({
              visible: true,
              index: 0,
              coords: {
                top: rect.bottom - parentRect.top + 6,
                left: Math.max(rect.left - parentRect.left - 8, 0),
              },
              blockId,
            });
            return;
          }
        }
      }

      // Close slash menu if it was open
      if (slashMenu.visible) {
        setSlashMenu(NO_MENU);
      }

      // — Markdown shortcuts —
      detectMarkdownShortcut(text, blockId, line, onUpdateBlock);
    },
    [getCurrentBlockId, blockNodesRef, syncBlockToStore, surfaceRef, slashMenu.visible, onUpdateBlock],
  );

  // ------------------------------------------------------------------
  // Slash command execution
  // ------------------------------------------------------------------
  const executeSlashCommand = useCallback(
    (type: BlockType) => {
      if (!slashMenu.blockId) return;
      const blockId = slashMenu.blockId;
      const node = blockNodesRef.current.get(blockId);
      const line = node?.querySelector<HTMLElement>('[data-block-line]');

      // Clear the slash query (e.g. "/cod" or just "/") from the block
      if (line) {
        line.innerHTML = '';
        syncBlockToStore(blockId, line);
      }

      // Convert the current block in place — it's empty now
      onUpdateBlock(blockId, { type, content: '', properties: getDefaultProperties(type) });
      setSlashMenu(NO_MENU);

      // Refocus the block
      requestAnimationFrame(() => {
        const surface = surfaceRef.current;
        const updatedNode = blockNodesRef.current.get(blockId);
        const updatedLine = updatedNode?.querySelector<HTMLElement>('[data-block-line]');
        if (surface && updatedLine) {
          surface.focus();
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(updatedLine);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      });
    },
    [slashMenu.blockId, blockNodesRef, syncBlockToStore, onUpdateBlock, surfaceRef],
  );

  // ------------------------------------------------------------------
  // Paste — detect images, otherwise let native paste work
  // ------------------------------------------------------------------
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;
          const blockId = getCurrentBlockId();
          await saveImageToDoc(blob, blockId ?? undefined);
          return;
        }
      }
      // Let native paste happen for text/html — contentEditable handles it.
      // The onInput event will then sync the changes to the store.
    },
    [saveImageToDoc, getCurrentBlockId],
  );

  // ------------------------------------------------------------------
  // Blur — close menus
  // ------------------------------------------------------------------
  const handleBlur = useCallback(() => {
    // Delay to allow menu clicks to register
    setTimeout(() => {
      if (!surfaceRef.current?.contains(document.activeElement)) {
        setSlashMenu(NO_MENU);
      }
    }, 200);
  }, [surfaceRef]);

  // ------------------------------------------------------------------
  // KeyDown — the big one
  // ------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // — Slash menu navigation —
      if (slashMenu.visible) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashMenu((p) => ({ ...p, index: p.index > 0 ? p.index - 1 : SLASH_COMMANDS.length - 1 }));
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashMenu((p) => ({ ...p, index: p.index < SLASH_COMMANDS.length - 1 ? p.index + 1 : 0 }));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          executeSlashCommand(SLASH_COMMANDS[slashMenu.index].type as BlockType);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setSlashMenu(NO_MENU);
          return;
        }
      }

      // — Inline formatting —
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'b') {
          e.preventDefault();
          document.execCommand('bold');
          // Sync after execCommand
          syncCurrentBlock();
          return;
        }
        if (key === 'i') {
          e.preventDefault();
          document.execCommand('italic');
          syncCurrentBlock();
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          const blockId = getCurrentBlockId();
          if (blockId) onDuplicateBlock(blockId);
          return;
        }
      }

      // — Enter: new block (Shift+Enter = line break) —
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const blockId = getCurrentBlockId();
        if (blockId) {
          // Sync current content first
          syncCurrentBlock();
          onInsertBelow(blockId, 'text');
        }
        return;
      }

      // — Backspace at block start → merge —
      if (e.key === 'Backspace') {
        const surface = surfaceRef.current;
        if (!surface) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

        const blockId = getCurrentBlockId();
        if (!blockId) return;
        const node = blockNodesRef.current.get(blockId);
        const line = node?.querySelector<HTMLElement>('[data-block-line]');
        if (!line) return;

        // Check caret is at the very start of the block
        const range = sel.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(line);
        preRange.setEnd(range.startContainer, range.startOffset);
        if (preRange.toString().length === 0) {
          e.preventDefault();
          onDeleteBlock(blockId, line.innerHTML);
        }
        return;
      }

      // — ArrowUp/Down: navigate between blocks —
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        const surface = surfaceRef.current;
        const el = getLineFromCaret();
        if (el && isAtFirstLine(el)) {
          if (onFocusTitle()) {
            e.preventDefault();
            return;
          }
          if (onFocusBlock(-1)) {
            e.preventDefault();
            return;
          }
        }
      }
      if (e.key === 'ArrowDown' && !e.shiftKey) {
        const el = getLineFromCaret();
        if (el && isAtLastLine(el)) {
          if (onFocusBlock(1)) {
            e.preventDefault();
            return;
          }
        }
      }
    },
    [
      slashMenu,
      executeSlashCommand,
      onInsertBelow,
      onDeleteBlock,
      onDuplicateBlock,
      onFocusTitle,
      onFocusBlock,
      surfaceRef,
      blockNodesRef,
      getCurrentBlockId,
      syncCurrentBlock,
    ],
  );

  // Helper: sync the block that currently contains the caret
  function syncCurrentBlock() {
    const blockId = getCurrentBlockId();
    if (!blockId) return;
    const node = blockNodesRef.current.get(blockId);
    const line = node?.querySelector<HTMLElement>('[data-block-line]');
    if (line) syncBlockToStore(blockId, line);
  }

  return {
    handleInput,
    handleKeyDown,
    handlePaste,
    handleBlur,
    slashMenu,
    executeSlashCommand,
  };
}

// ====================================================================
// Helpers
// ====================================================================

/** Get the [data-block-line] element that contains the caret. */
function getLineFromCaret(): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.anchorNode;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.hasAttribute?.('data-block-line')) return el;
    }
    node = node.parentNode;
  }
  return null;
}

function isAtFirstLine(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  const caretRect = range.getClientRects()[0];
  if (!caretRect) return true;
  const elRect = el.getBoundingClientRect();
  const lh = estimateLineHeight(el);
  return Math.abs(caretRect.top - elRect.top) <= lh / 2 + 2;
}

function isAtLastLine(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  const caretRect = range.getClientRects()[0];
  if (!caretRect) return true;
  const elRect = el.getBoundingClientRect();
  const lh = estimateLineHeight(el);
  return Math.abs(caretRect.bottom - elRect.bottom) <= lh / 2 + 2;
}

function estimateLineHeight(el: HTMLElement): number {
  const computed = window.getComputedStyle(el);
  const lh = parseFloat(computed.lineHeight);
  if (Number.isFinite(lh) && lh > 0) return lh;
  const fs = parseFloat(computed.fontSize);
  return Number.isFinite(fs) && fs > 0 ? fs * 1.5 : 24;
}

/**
 * Detect "# ", "## ", "### ", "> " at start of block and convert type.
 */
function detectMarkdownShortcut(
  text: string,
  blockId: string,
  line: HTMLElement,
  onUpdateBlock: (id: string, fields: Record<string, unknown>) => void,
) {
  const md = text.match(/^(#{1,3})\s+(.*)/s);
  if (md) {
    const level = md[1].length;
    const content = md[2];
    const type = `heading-${level}` as BlockType;
    line.innerHTML = content;
    onUpdateBlock(blockId, {
      type,
      content,
      properties: {},
    });
    return;
  }

  if (/^>\s+/.test(text)) {
    const content = text.replace(/^>\s+/, '');
    line.innerHTML = content;
    onUpdateBlock(blockId, {
      type: 'callout',
      content,
      properties: {},
    });
  }
}
