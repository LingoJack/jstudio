import { useCallback } from 'react';
import type { BlockType } from '../../types';
import type { useCaretUtils } from './useCaretUtils';

interface Params {
  rawText: string;
  setRawText: (v: string) => void;
  onUpdateBlock: (fields: Record<string, unknown>) => void;
  onDeleteBlock: (mergeContent?: string) => void;
  onInsertBlockBelow: (type: BlockType) => void;
  onRequestFocusTitle?: () => boolean;
  onRequestFocusBlock?: (offset: number) => boolean;
  caretUtils: ReturnType<typeof useCaretUtils>;
}

/**
 * Keyboard navigation handler — arrow keys (move between blocks),
 * Enter (insert block below), Backspace (delete / merge blocks).
 */
export function useKeyboardNavigation({
  rawText,
  setRawText,
  onUpdateBlock,
  onDeleteBlock,
  onInsertBlockBelow,
  onRequestFocusTitle,
  onRequestFocusBlock,
  caretUtils,
}: Params) {
  const {
    tryEscapeInlineFormat,
    isCaretOnEdgeLine,
    moveFocusToSiblingBlock,
    findInlineFormatAncestor,
  } = caretUtils;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const el = e.currentTarget;

      // — Arrow left / right: escape inline format boundaries —
      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        el.isContentEditable
      ) {
        if (
          tryEscapeInlineFormat(el, e.key === 'ArrowLeft' ? 'left' : 'right')
        ) {
          e.preventDefault();
          return;
        }
      }

      // — Arrow up / down: navigate between blocks when at edge —
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
        const direction = e.key === 'ArrowUp' ? 'up' : 'down';
        if (
          isCaretOnEdgeLine(el, direction) &&
          moveFocusToSiblingBlock(
            el,
            direction,
            onRequestFocusTitle,
            onRequestFocusBlock,
          )
        ) {
          e.preventDefault();
          return;
        }
      }

      // — Enter: insert new text block below —
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onInsertBlockBelow('text');
        return;
      }

      // — Backspace: delete / merge blocks —
      if (e.key === 'Backspace') {
        // Cmd/Ctrl + Backspace: force delete entire block
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onDeleteBlock('');
          return;
        }

        // textarea / input at position 0
        if (
          (el instanceof HTMLTextAreaElement ||
            el instanceof HTMLInputElement) &&
          el.selectionStart === 0 &&
          el.selectionEnd === 0
        ) {
          e.preventDefault();
          onDeleteBlock(rawText);
          return;
        }

        // contentEditable
        if (el.isContentEditable) {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          if (!range.collapsed) return;

          // If caret is at the end of an inline format element, remove it
          const inline = findInlineFormatAncestor(range.startContainer);
          if (inline && el.contains(inline)) {
            const parent = inline.parentNode;
            if (parent) {
              const inlineRange = document.createRange();
              inlineRange.selectNodeContents(inline);
              inlineRange.collapse(false);
              const isAtInlineEnd =
                range.startContainer === inlineRange.endContainer &&
                range.startOffset === inlineRange.endOffset;
              if (isAtInlineEnd) {
                e.preventDefault();
                inline.remove();
                setRawText(el.innerHTML);
                onUpdateBlock({ content: el.innerHTML });
                return;
              }
            }
          }

          // If caret is at the very beginning of the block, delete/merge
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(el);
          preCaretRange.setEnd(range.startContainer, range.startOffset);
          if (preCaretRange.toString().length === 0) {
            e.preventDefault();
            onDeleteBlock(el.innerHTML);
          }
        }
      }
    },
    [
      tryEscapeInlineFormat,
      isCaretOnEdgeLine,
      moveFocusToSiblingBlock,
      onRequestFocusTitle,
      onRequestFocusBlock,
      onInsertBlockBelow,
      onDeleteBlock,
      rawText,
      findInlineFormatAncestor,
      setRawText,
      onUpdateBlock,
    ],
  );

  return { handleKeyDown };
}
