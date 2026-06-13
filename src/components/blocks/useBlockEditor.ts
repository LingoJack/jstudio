import { useCallback } from 'react';
import { formatMarkdown } from './shared';
import { useCaretUtils } from './useCaretUtils';
import { useSlashCommand } from './useSlashCommand';
import { useKeyboardNavigation } from './useKeyboardNavigation';

interface UseBlockEditorParams {
  rawText: string;
  setRawText: (v: string) => void;
  documents: { id: string; title: string }[];
  onUpdateBlock: (fields: Record<string, unknown>) => void;
  onDeleteBlock: (mergeContent?: string) => void;
  onInsertBlockBelow: (type: import('../../types').BlockType) => void;
  elementRef: React.MutableRefObject<HTMLElement | null>;
  onRequestFocusTitle?: () => boolean;
  onRequestFocusBlock?: (offset: number) => boolean;
}

/**
 * The block editing engine — composes three focused hooks:
 *
 *  - useCaretUtils:          pure DOM caret / selection helpers
 *  - useSlashCommand:        slash menu state, text-change, command execution
 *  - useKeyboardNavigation:  arrow-key navigation, Enter / Backspace handling
 *
 * This wrapper adds the blur-formatting pass (markdown → HTML on focus loss).
 */
export function useBlockEditor({
  rawText,
  setRawText,
  documents,
  onUpdateBlock,
  onDeleteBlock,
  onInsertBlockBelow,
  elementRef,
  onRequestFocusTitle,
  onRequestFocusBlock,
}: UseBlockEditorParams) {
  const caretUtils = useCaretUtils();

  const slash = useSlashCommand(
    rawText,
    setRawText,
    onUpdateBlock,
    onInsertBlockBelow,
  );

  const { handleKeyDown } = useKeyboardNavigation({
    rawText,
    setRawText,
    onUpdateBlock,
    onDeleteBlock,
    onInsertBlockBelow,
    onRequestFocusTitle,
    onRequestFocusBlock,
    caretUtils,
  });

  // ------------------------------------------------------------------
  // Blur: run markdown formatting pass, preserve caret position
  // ------------------------------------------------------------------
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      const caretOffset = caretUtils.captureCaretOffset(
        e.currentTarget as HTMLElement,
      );

      const hasRawAngleBracket = /[<>]/.test(rawText);
      if (hasRawAngleBracket) return;

      const formatted = formatMarkdown(rawText, documents);
      if (formatted !== rawText) {
        setRawText(formatted);
        onUpdateBlock({ content: formatted });
        if (caretOffset != null) {
          requestAnimationFrame(() => {
            const host = elementRef.current;
            if (host) caretUtils.restoreCaretOffset(host, caretOffset);
          });
        }
      }
    },
    [
      rawText,
      documents,
      setRawText,
      onUpdateBlock,
      caretUtils,
      elementRef,
    ],
  );

  // ------------------------------------------------------------------
  // Wrap keyDown: slash menu keys take priority, then navigation
  // ------------------------------------------------------------------
  const handleKeyDownWrapped = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (slash.handleSlashMenuKeys(e)) return;
      handleKeyDown(e);
    },
    [slash, handleKeyDown],
  );

  return {
    showSlashMenu: slash.showSlashMenu,
    slashMenuIndex: slash.slashMenuIndex,
    slashMenuCoords: slash.slashMenuCoords,
    handleKeyDown: handleKeyDownWrapped,
    handleTextChange: slash.handleTextChange,
    handleBlur,
    executeSlashCommand: slash.executeSlashCommand,
    setShowSlashMenu: slash.setShowSlashMenu,
  };
}
