import { useState, useCallback, useEffect } from 'react';
import type { BlockType } from '../../types';
import { SLASH_COMMANDS, getDefaultProperties } from './shared';
import { useStore } from '../../store/useStore';

interface UseBlockEditorParams {
  blockId: string;
  rawText: string;
  setRawText: (v: string) => void;
  onUpdateBlock: (fields: Record<string, unknown>) => void;
  onDeleteBlock: (mergeContent?: string) => void;
  onInsertBlockBelow: (type: BlockType) => void;
  elementRef: React.MutableRefObject<HTMLElement | null>;
  autoFocus?: boolean;
  onRequestFocusTitle?: () => boolean;
  onRequestFocusBlock?: (offset: number) => boolean;
}

/**
 * Notion-style block editor hook.
 *
 * Responsibilities:
 *  - Slash menu: `/` triggers a command palette; ↑↓ navigate, Enter selects
 *  - Keyboard navigation: Enter (new block), Backspace (merge), ArrowUp/Down (jump)
 *  - Markdown shortcuts: `# `, `## `, `### `, `> ` convert block type on space
 *  - Inline formatting: Cmd+B, Cmd+I, Cmd+E via document.execCommand
 *  - Image paste: Cmd+V with image in clipboard → save to doc folder, insert image block
 */
export function useBlockEditor({
  blockId,
  rawText,
  setRawText,
  onUpdateBlock,
  onDeleteBlock,
  onInsertBlockBelow,
  elementRef,
  autoFocus,
  onRequestFocusTitle,
  onRequestFocusBlock,
}: UseBlockEditorParams) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [slashMenuCoords, setSlashMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const saveImageToDoc = useStore((s) => s.saveImageToDoc);

  // ------------------------------------------------------------------
  // Auto-focus newly created blocks
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!autoFocus || !elementRef.current) return;
    const el = elementRef.current;
    el.focus();
    requestAnimationFrame(() => {
      if (el.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
  }, [autoFocus, elementRef]);

  // ------------------------------------------------------------------
  // Text change — update store + detect `/` for slash menu
  // ------------------------------------------------------------------
  const handleTextChange = useCallback(
    (val: string, plainText: string) => {
      setRawText(val);
      onUpdateBlock({ content: val });

      // Slash menu trigger
      if (plainText.endsWith('/')) {
        setShowSlashMenu(true);
        setSlashMenuIndex(0);
        const el = elementRef.current;
        if (el) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const parentRect = el.getBoundingClientRect();
            setSlashMenuCoords({
              top: rect.bottom - parentRect.top + 4,
              left: Math.min(rect.left - parentRect.left, 400),
            });
          }
        }
      } else {
        setShowSlashMenu(false);
      }

      // Markdown shortcut detection: "# ", "## ", "### ", "> "
      detectMarkdownShortcut(plainText, val, onUpdateBlock, setShowSlashMenu);
    },
    [setRawText, onUpdateBlock, elementRef],
  );

  // ------------------------------------------------------------------
  // Slash command execution
  // ------------------------------------------------------------------
  const executeSlashCommand = useCallback(
    (type: BlockType) => {
      const sanitized = rawText.replace(/\/(\s*)$/, '');
      setRawText(sanitized);
      onUpdateBlock({ content: sanitized });

      const isEmpty = sanitized.replace(/<[^>]*>/g, '').trim() === '';
      if (isEmpty) {
        onUpdateBlock({ type, content: '', properties: getDefaultProperties(type) });
      } else {
        onInsertBlockBelow(type);
      }
      setShowSlashMenu(false);
    },
    [rawText, setRawText, onUpdateBlock, onInsertBlockBelow],
  );

  // ------------------------------------------------------------------
  // Paste handler — detect images and insert as image blocks
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
          await saveImageToDoc(blob, blockId);
          return;
        }
      }
      // Let default paste happen for text/html
    },
    [saveImageToDoc, blockId],
  );

  // ------------------------------------------------------------------
  // KeyDown — unified handler
  // ------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const el = e.currentTarget;

      // — Slash menu navigation (takes priority) —
      if (showSlashMenu) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashMenuIndex((p) => (p > 0 ? p - 1 : SLASH_COMMANDS.length - 1));
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashMenuIndex((p) => (p < SLASH_COMMANDS.length - 1 ? p + 1 : 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          executeSlashCommand(SLASH_COMMANDS[slashMenuIndex].type as BlockType);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowSlashMenu(false);
          return;
        }
      }

      // — Inline formatting shortcuts —
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'b') {
          e.preventDefault();
          document.execCommand('bold');
          return;
        }
        if (key === 'i') {
          e.preventDefault();
          document.execCommand('italic');
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          document.execCommand('insertHTML', false, '<code>$&</code>');
          return;
        }
      }

      // — Enter: create new text block (Shift+Enter = soft break) —
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Commit current content first
        onUpdateBlock({ content: el.innerHTML });
        onInsertBlockBelow('text');
        return;
      }

      // — Backspace at block start → merge with previous block —
      if (e.key === 'Backspace') {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onDeleteBlock('');
          return;
        }
        if (!el.isContentEditable) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(el);
        preRange.setEnd(range.startContainer, range.startOffset);
        if (preRange.toString().length === 0) {
          e.preventDefault();
          onDeleteBlock(el.innerHTML);
        }
        return;
      }

      // — ArrowUp at first line → focus previous block —
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        if (isAtFirstLine(el)) {
          if (onRequestFocusTitle && onRequestFocusTitle()) {
            e.preventDefault();
            return;
          }
          if (onRequestFocusBlock && onRequestFocusBlock(-1)) {
            e.preventDefault();
            return;
          }
        }
      }

      // — ArrowDown at last line → focus next block —
      if (e.key === 'ArrowDown' && !e.shiftKey) {
        if (isAtLastLine(el)) {
          if (onRequestFocusBlock && onRequestFocusBlock(1)) {
            e.preventDefault();
            return;
          }
        }
      }
    },
    [
      showSlashMenu,
      slashMenuIndex,
      executeSlashCommand,
      onUpdateBlock,
      onInsertBlockBelow,
      onDeleteBlock,
      onRequestFocusTitle,
      onRequestFocusBlock,
    ],
  );

  return {
    showSlashMenu,
    slashMenuIndex,
    slashMenuCoords,
    handleKeyDown,
    handleTextChange,
    handlePaste,
    executeSlashCommand,
    setShowSlashMenu,
  };
}

// ====================================================================
// Helpers
// ====================================================================

/** Check if the caret is on the first line of a contentEditable element. */
function isAtFirstLine(el: HTMLElement): boolean {
  if (!el.isContentEditable) return true;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  const caretRect = getCaretRect(range);
  if (!caretRect) return true;
  const elRect = el.getBoundingClientRect();
  const lineHeight = estimateLineHeight(el);
  return Math.abs(caretRect.top - elRect.top) <= lineHeight / 2 + 2;
}

/** Check if the caret is on the last line of a contentEditable element. */
function isAtLastLine(el: HTMLElement): boolean {
  if (!el.isContentEditable) return true;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  const caretRect = getCaretRect(range);
  if (!caretRect) return true;
  const elRect = el.getBoundingClientRect();
  const lineHeight = estimateLineHeight(el);
  return Math.abs(caretRect.bottom - elRect.bottom) <= lineHeight / 2 + 2;
}

function getCaretRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  return rects[0] ?? null;
}

function estimateLineHeight(el: HTMLElement): number {
  const computed = window.getComputedStyle(el);
  const lh = parseFloat(computed.lineHeight);
  if (Number.isFinite(lh) && lh > 0) return lh;
  const fs = parseFloat(computed.fontSize);
  return Number.isFinite(fs) && fs > 0 ? fs * 1.5 : 24;
}

/**
 * Detect markdown-style shortcuts at the start of a line:
 * `# ` → heading-1, `## ` → heading-2, `### ` → heading-3
 * `> ` → callout
 */
function detectMarkdownShortcut(
  _plainText: string,
  _html: string,
  _onUpdateBlock: (fields: Record<string, unknown>) => void,
  _setShowSlashMenu: (v: boolean) => void,
) {
  // This is handled via the keydown event for space key in the component.
  // Kept as a stub for potential future use.
}
