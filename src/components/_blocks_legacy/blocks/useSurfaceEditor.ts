import { useState, useCallback, useRef, useEffect } from 'react';
import type { BlockType, RichText } from '../../types';
import { SLASH_COMMANDS, getDefaultProperties } from './shared';
import { useStore } from '../../store/useStore';
import { htmlToRichText, richTextToHtml } from '../../lib';

interface UseSurfaceEditorParams {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  blockNodesRef: React.RefObject<Map<string, HTMLElement>>;
  onInsertBelow: (blockId: string, type: BlockType) => void;
  onAppendEnd: (type: BlockType) => void;
  onDeleteBlock: (blockId: string, mergeContent?: RichText[]) => void;
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
    const sel = safeGetSelection();
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
      const richText = htmlToRichText(el);
      onUpdateBlock(blockId, { content: richText });
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
          const sel = safeGetSelection();
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
      detectMarkdownShortcut(text, blockId, line, onUpdateBlock, surfaceRef.current);
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

      // CRITICAL: Blur the surface before mutating the DOM.
      // When a text block is converted to a non-text block (e.g. code),
      // React removes the old [data-block-line] element. If the browser's
      // Selection still references that node, WebKit throws
      // "NotFoundError: The object can not be found here."
      // removeAllRanges() alone is insufficient — WebKit auto-restores
      // a range inside the focused contentEditable. Blur forces release.
      blurSurfaceForMutation(surfaceRef.current);

      // Convert the current block in place — it's empty now
      onUpdateBlock(blockId, { type, content: [] as RichText[], properties: getDefaultProperties(type) });
      setSlashMenu(NO_MENU);

      // Refocus the block
      requestAnimationFrame(() => {
        const surface = surfaceRef.current;
        const updatedNode = blockNodesRef.current.get(blockId);
        if (!surface || !updatedNode) return;

        // For text-type blocks, focus the [data-block-line]
        const updatedLine = updatedNode.querySelector<HTMLElement>('[data-block-line]');
        if (updatedLine) {
          surface.focus();
          const sel = safeGetSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(updatedLine);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          return;
        }

        // For non-text blocks (code, image, etc.), try focusing the island's
        // first interactive child, or just focus the surface.
        const focusable = updatedNode.querySelector<HTMLElement>(
          'input, textarea, [contenteditable="true"], [tabindex]',
        );
        if (focusable) {
          focusable.focus();
        } else {
          surface.focus();
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
  // Helper: sync the block that currently contains the caret
  const syncCurrentBlock = useCallback(() => {
    const blockId = getCurrentBlockId();
    if (!blockId) return;
    const node = blockNodesRef.current.get(blockId);
    const line = node?.querySelector<HTMLElement>('[data-block-line]');
    if (line) syncBlockToStore(blockId, line);
  }, [getCurrentBlockId, blockNodesRef, syncBlockToStore]);

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
        // Ignore key auto-repeat to prevent creating multiple blocks at once
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const blockId = getCurrentBlockId();
        if (blockId) {
          // Sync current content first
          syncCurrentBlock();
          onInsertBelow(blockId, 'text');
        }
        return;
      }

      // — Backspace at block start → merge or delete island —
      if (e.key === 'Backspace') {
        const surface = surfaceRef.current;
        if (!surface) return;
        const sel = safeGetSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

        const blockId = getCurrentBlockId();
        if (!blockId) return;
        const node = blockNodesRef.current.get(blockId);
        if (!node) return;

        // Check if this is a non-text island block (code, image, table, etc.)
        const isIsland = node.getAttribute('data-block-island') === 'true';
        const line = node.querySelector<HTMLElement>('[data-block-line]');

        if (!line && !isIsland) return;

        if (isIsland) {
          // For non-text blocks, Backspace should just delete the whole block.
          // We don't merge content because island blocks aren't text-based.
          // But we DO need to check if the selection is actually on this island.
          // If the caret is inside an island child (e.g. a code editor textarea),
          // let the browser handle it normally (don't intercept).
          const selCheck = safeGetSelection();
          if (selCheck && selCheck.anchorNode) {
            let walker: Node | null = selCheck.anchorNode;
            let insideIsland = false;
            while (walker && walker !== surface) {
              if (walker === node) { insideIsland = true; break; }
              walker = walker.parentNode;
            }
            // If the caret is inside a focusable child of the island
            // (textarea, input, etc.), let the child handle Backspace.
            if (insideIsland) {
              const active = document.activeElement;
              if (
                active &&
                active !== surface &&
                node.contains(active) &&
                (active.tagName === 'TEXTAREA' ||
                  active.tagName === 'INPUT' ||
                  (active as HTMLElement).isContentEditable)
              ) {
                return; // let the child handle it
              }
            }
          }
          e.preventDefault();
          // CRITICAL: Blur surface before DOM mutation to prevent
          // WebKit NotFoundError when React removes this node.
          blurSurfaceForMutation(surface);
          onDeleteBlock(blockId);
          return;
        }

        // For text blocks: check caret is at the very start of the block
        const range = sel.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(line);
        preRange.setEnd(range.startContainer, range.startOffset);
        if (preRange.toString().length === 0) {
          e.preventDefault();
          // CRITICAL: Blur surface before DOM mutation to prevent
          // WebKit NotFoundError when React removes this node.
          blurSurfaceForMutation(surface);

          // Check if the previous block is a non-text island. If so, don't
          // merge text content into it — just delete this block and focus
          // the previous island.
          const doc = useStore.getState().activeDoc;
          if (doc) {
            const idx = doc.blocks.findIndex((b) => b.id === blockId);
            if (idx > 0) {
              const prevBlock = doc.blocks[idx - 1];
              const TEXT_TYPES_SET = new Set([
                'text', 'heading-1', 'heading-2', 'heading-3', 'callout', 'toggle',
              ]);
              if (!TEXT_TYPES_SET.has(prevBlock.type as string)) {
                // Previous block is non-text: just delete current block,
                // don't merge content.
                onDeleteBlock(blockId);
                return;
              }
            }
          }
          onDeleteBlock(blockId, htmlToRichText(line));
        }
        return;
      }

      // — ArrowUp/Down: navigate between blocks —
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        const el = getLineFromCaret();
        if (el && isAtFirstLine(el)) {
          // Try previous block first; if there is none, fall through to title
          if (onFocusBlock(-1)) {
            e.preventDefault();
            return;
          }
          if (onFocusTitle()) {
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

/**
 * Safely get the current selection. In WebKit, accessing selection
 * properties after a DOM node has been removed can throw
 * "NotFoundError: The object can not be found here."
 * This wrapper catches that and returns null.
 */
function safeGetSelection(): Selection | null {
  try {
    const sel = window.getSelection();
    if (!sel) return null;
    // Touch rangeCount to force WebKit to validate — if the underlying
    // range references a detached node, this is where it throws.
    void sel.rangeCount;
    return sel;
  } catch {
    return null;
  }
}

/**
 * Safely remove all ranges from the current selection.
 * Wrapped in try-catch for the same WebKit reason.
 */
function safeRemoveAllRanges(): void {
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    // ignore
  }
}

/**
 * Release the contentEditable surface's selection binding BEFORE a DOM mutation
 * (block type conversion, deletion, document switch, etc.).
 *
 * This is the ONLY reliable way to prevent WebKit's
 * "NotFoundError: The object can not be found here." which is thrown
 * internally by React's commitDeletionEffects (removeChild) when it
 * removes a DOM node that the browser's Selection still references.
 *
 * Strategy: move focus to <body> (a non-contentEditable element) and
 * clear the selection. This forces WebKit to fully detach its
 * internal selection state from the contentEditable.
 */
function releaseSurfaceSelection(surface: HTMLElement | null): void {
  if (!surface) return;
  // 1. Move focus to <body> — this is more reliable than .blur() because
  //    .blur() on a contentEditable can leave WebKit's caret in place.
  if (document.activeElement === surface || surface.contains(document.activeElement)) {
    (document.body as HTMLElement).focus();
  }
  // 2. Clear the selection AFTER focus has moved away from the surface.
  try {
    window.getSelection()?.removeAllRanges();
  } catch { /* ignore */ }
}

/** Backwards-compatible alias. */
const blurSurfaceForMutation = releaseSurfaceSelection;

/** Get the [data-block-line] element that contains the caret. */
function getLineFromCaret(): HTMLElement | null {
  const sel = safeGetSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null;
  try {
    node = sel.anchorNode;
  } catch {
    return null;
  }
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
  const sel = safeGetSelection();
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
  const sel = safeGetSelection();
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
  surface: HTMLElement | null,
) {
  const md = text.match(/^(#{1,3})\s+(.*)/s);
  if (md) {
    const level = md[1].length;
    const content = md[2];
    const type = `heading-${level}` as BlockType;
    const richContent: RichText[] = [{ text: content, annotations: {} }];
    // Blur surface before mutating DOM to prevent WebKit NotFoundError
    // when React re-renders the block as a different element type.
    blurSurfaceForMutation(surface);
    line.innerHTML = richTextToHtml(richContent);
    onUpdateBlock(blockId, {
      type,
      content: richContent,
      properties: {},
    });
    return;
  }

  if (/^>\s+/.test(text)) {
    const content = text.replace(/^>\s+/, '');
    const richContent: RichText[] = [{ text: content, annotations: {} }];
    // Same protection as above.
    blurSurfaceForMutation(surface);
    line.innerHTML = richTextToHtml(richContent);
    onUpdateBlock(blockId, {
      type: 'callout',
      content: richContent,
      properties: {},
    });
  }
}
