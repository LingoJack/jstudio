import { useState, useCallback } from 'react';
import type { BlockType } from '../../types';
import { SLASH_COMMANDS, getDefaultProperties } from './shared';

/**
 * Manages slash menu state (visibility, selection index, coordinates)
 * and the text-change / command-execution logic.
 */
export function useSlashCommand(
  rawText: string,
  setRawText: (v: string) => void,
  onUpdateBlock: (fields: Record<string, unknown>) => void,
  onInsertBlockBelow: (type: BlockType) => void,
) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [slashMenuCoords, setSlashMenuCoords] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const handleTextChange = useCallback(
    (val: string, element?: HTMLElement, plainText?: string) => {
      setRawText(val);
      onUpdateBlock({ content: val });

      const checkText = plainText !== undefined ? plainText : val;
      if (checkText.replace(/\n$/, '').endsWith('/')) {
        setShowSlashMenu(true);
        setSlashMenuIndex(0);
        if (element) {
          if (
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLInputElement
          ) {
            const cursorPos = element.selectionEnd ?? element.value.length;
            const lineHeight = 20;
            const charWidth = 7;
            const beforeCursor = element.value.substring(0, cursorPos);
            const lines = beforeCursor.split('\n');
            const top = (lines.length - 1) * lineHeight;
            const left = lines[lines.length - 1].length * charWidth;
            setSlashMenuCoords({ top: top + 24, left: Math.min(left, 400) });
          } else {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              const parentRect = element.getBoundingClientRect();
              setSlashMenuCoords({
                top: rect.bottom - parentRect.top + 24,
                left: Math.min(rect.left - parentRect.left, 400),
              });
            }
          }
        }
      } else {
        setShowSlashMenu(false);
      }
    },
    [setRawText, onUpdateBlock],
  );

  const executeSlashCommand = useCallback(
    (type: BlockType) => {
      const sanitized = rawText.replace(/\/((?:\s*<[^>]+>)*\s*)$/, '$1');
      setRawText(sanitized);

      if (
        sanitized === '' ||
        sanitized.replace(/<[^>]*>/g, '').trim() === ''
      ) {
        onUpdateBlock({
          type,
          content: '',
          properties: getDefaultProperties(type),
        });
      } else {
        onUpdateBlock({ content: sanitized });
        onInsertBlockBelow(type);
      }
      setShowSlashMenu(false);
    },
    [rawText, setRawText, onUpdateBlock, onInsertBlockBelow],
  );

  /** Handle keyboard navigation inside the slash menu. Returns true if handled. */
  const handleSlashMenuKeys = useCallback(
    (e: React.KeyboardEvent<HTMLElement>): boolean => {
      if (!showSlashMenu) return false;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenuIndex((prev) =>
          prev > 0 ? prev - 1 : SLASH_COMMANDS.length - 1,
        );
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenuIndex((prev) =>
          prev < SLASH_COMMANDS.length - 1 ? prev + 1 : 0,
        );
        return true;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSlashCommand(SLASH_COMMANDS[slashMenuIndex].type as BlockType);
        return true;
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
        return true;
      }
      return false;
    },
    [showSlashMenu, slashMenuIndex, executeSlashCommand],
  );

  return {
    showSlashMenu,
    slashMenuIndex,
    slashMenuCoords,
    handleTextChange,
    executeSlashCommand,
    handleSlashMenuKeys,
    setShowSlashMenu,
  };
}
