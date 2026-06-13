import { useCallback } from 'react';

const INLINE_FORMATTED_TAGS = [
  'CODE',
  'B',
  'STRONG',
  'A',
  'I',
  'EM',
  'U',
  'SPAN',
];

/**
 * Pure DOM caret / selection utilities shared across block editor hooks.
 * None of these functions depend on React state — they operate solely
 * on the DOM elements passed to them.
 */
export function useCaretUtils() {
  const getCaretRect = useCallback(
    (el: HTMLElement): DOMRect | null => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      if (!el.contains(range.startContainer)) return null;
      if (!range.collapsed) return null;

      const probe = range.cloneRange();
      probe.collapse(true);
      const rects = probe.getClientRects();
      let rect = rects[0] ?? null;
      if (rect && (rect.width > 0 || rect.height > 0)) return rect;

      const marker = document.createElement('span');
      marker.appendChild(document.createTextNode('\u200b'));
      marker.setAttribute('data-caret-probe', '1');
      const originalStyles = marker.style.cssText;
      marker.style.cssText =
        'display:inline-block;width:0;height:1em;line-height:inherit;vertical-align:baseline;';
      try {
        probe.insertNode(marker);
        rect = marker.getBoundingClientRect();
      } finally {
        marker.remove();
        marker.style.cssText = originalStyles;
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return rect;
    },
    [],
  );

  const estimateLineHeight = useCallback((el: HTMLElement): number => {
    const computed = window.getComputedStyle(el);
    const lh = parseFloat(computed.lineHeight);
    if (Number.isFinite(lh) && lh > 0) return lh;
    const fs = parseFloat(computed.fontSize);
    if (Number.isFinite(fs) && fs > 0) return fs * 1.5;
    return 24;
  }, []);

  const isCaretOnEdgeLine = useCallback(
    (el: HTMLElement, direction: 'up' | 'down'): boolean => {
      if (
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLInputElement
      ) {
        const value = el.value;
        const cursor = el.selectionStart ?? 0;
        const currentLineStart =
          value.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
        const currentLineEndIndex = value.indexOf('\n', cursor);
        const currentLineEnd =
          currentLineEndIndex === -1 ? value.length : currentLineEndIndex;
        const before = value.slice(0, currentLineStart);
        const after = value.slice(currentLineEnd);
        return direction === 'up'
          ? !before.includes('\n')
          : !after.includes('\n');
      }

      if (!el.isContentEditable) return true;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;
      const range = selection.getRangeAt(0);
      if (!el.contains(range.startContainer)) return false;
      if (!range.collapsed) return false;

      const caretRect = getCaretRect(el);
      if (!caretRect) return true;

      const elRect = el.getBoundingClientRect();
      if (elRect.height === 0) return true;

      const lineHeight = estimateLineHeight(el);
      const slack = Math.max(2, lineHeight / 2);

      if (direction === 'up') {
        return Math.abs(caretRect.top - elRect.top) <= slack;
      }
      return Math.abs(caretRect.bottom - elRect.bottom) <= slack;
    },
    [getCaretRect, estimateLineHeight],
  );

  const findInlineFormatAncestor = useCallback(
    (node: Node | null): HTMLElement | null => {
      let cur: Node | null = node;
      while (cur && cur.nodeType === Node.ELEMENT_NODE) {
        const el = cur as HTMLElement;
        if (INLINE_FORMATTED_TAGS.includes(el.tagName)) return el;
        cur = el.parentElement;
      }
      return null;
    },
    [],
  );

  const tryEscapeInlineFormat = useCallback(
    (el: HTMLElement, direction: 'left' | 'right'): boolean => {
      if (!el.isContentEditable) return false;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;
      const range = selection.getRangeAt(0);
      if (!range.collapsed) return false;

      const inline = findInlineFormatAncestor(range.startContainer);
      if (!inline) return false;
      if (!el.contains(inline)) return false;

      if (direction === 'right') {
        if (
          range.endContainer === inline.lastChild &&
          range.endOffset ===
            (inline.lastChild?.nodeType === Node.TEXT_NODE
              ? (inline.lastChild as Text).data.length
              : inline.childNodes.length)
        ) {
          const parent = inline.parentNode;
          if (!parent) return false;
          const after = document.createRange();
          const idx =
            Array.prototype.indexOf.call(parent.childNodes, inline) + 1;
          after.setStart(parent, idx);
          after.collapse(true);
          selection.removeAllRanges();
          selection.addRange(after);
          return true;
        }
      } else {
        if (
          range.startContainer === inline.firstChild &&
          range.startOffset === 0
        ) {
          const parent = inline.parentNode;
          if (!parent) return false;
          const before = document.createRange();
          const idx = Array.prototype.indexOf.call(parent.childNodes, inline);
          before.setStart(parent, idx);
          before.collapse(true);
          selection.removeAllRanges();
          selection.addRange(before);
          return true;
        }
      }
      return false;
    },
    [findInlineFormatAncestor],
  );

  const moveFocusToSiblingBlock = useCallback(
    (
      current: HTMLElement,
      direction: 'up' | 'down',
      onRequestFocusTitle?: () => boolean,
      onRequestFocusBlock?: (offset: number) => boolean,
    ): boolean => {
      const blockEl = current.closest<HTMLElement>('[data-block-id]');
      const sibling =
        direction === 'up'
          ? (blockEl?.previousElementSibling as HTMLElement | null)
          : (blockEl?.nextElementSibling as HTMLElement | null);
      const target = sibling?.querySelector<HTMLElement>(
        "[data-block-editable='true']",
      );

      if (target) {
        target.focus();
        requestAnimationFrame(() => {
          if (
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLInputElement
          ) {
            const pos = direction === 'up' ? target.value.length : 0;
            try {
              target.setSelectionRange(pos, pos);
            } catch {
              /* ignore */
            }
          } else if (target.isContentEditable) {
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            range.selectNodeContents(target);
            range.collapse(direction === 'down');
            selection.removeAllRanges();
            selection.addRange(range);
          }
        });
        return true;
      }

      if (direction === 'up' && onRequestFocusTitle) {
        return onRequestFocusTitle();
      }
      if (direction === 'up' && onRequestFocusBlock) {
        return onRequestFocusBlock(-1);
      }
      if (direction === 'down' && onRequestFocusBlock) {
        return onRequestFocusBlock(1);
      }
      return false;
    },
    [],
  );

  const captureCaretOffset = useCallback(
    (el: HTMLElement): number | null => {
      if (!el.isContentEditable) {
        if (
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLInputElement
        ) {
          return el.selectionStart ?? 0;
        }
        return null;
      }
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      if (!el.contains(range.startContainer)) return null;
      const pre = range.cloneRange();
      pre.selectNodeContents(el);
      pre.setEnd(range.startContainer, range.startOffset);
      return pre.toString().length;
    },
    [],
  );

  const restoreCaretOffset = useCallback(
    (el: HTMLElement, offset: number) => {
      if (
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLInputElement
      ) {
        const pos = Math.min(offset, el.value.length);
        try {
          el.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
        return;
      }
      if (!el.isContentEditable) return;
      const selection = window.getSelection();
      if (!selection) return;

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let remaining = offset;
      let target: Text | null = null;
      let targetOffset = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const len = node.data.length;
        if (remaining <= len) {
          target = node;
          targetOffset = remaining;
          break;
        }
        remaining -= len;
      }
      if (!target) {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        selection.removeAllRanges();
        selection.addRange(r);
        return;
      }
      const r = document.createRange();
      r.setStart(target, targetOffset);
      r.collapse(true);
      selection.removeAllRanges();
      selection.addRange(r);
    },
    [],
  );

  return {
    getCaretRect,
    estimateLineHeight,
    isCaretOnEdgeLine,
    findInlineFormatAncestor,
    tryEscapeInlineFormat,
    moveFocusToSiblingBlock,
    captureCaretOffset,
    restoreCaretOffset,
  };
}
