/**
 * useNodeToolbarNav — keyboard navigation for NodeView floating toolbars.
 *
 * When a block node (image, file, etc.) is selected in the editor, its
 * floating toolbar should respond to keyboard input:
 *
 *   Tab / ArrowRight  → focus next button (wraps)
 *   Shift+Tab / ←    → focus previous button (wraps)
 *   Enter / Space     → click the focused button
 *   Escape            → deselect the node (collapse selection after it)
 *
 * Implementation registers a capture-phase `keydown` listener on the
 * editor DOM so that events are intercepted before ProseMirror processes
 * them (otherwise Tab would leave the editor, etc.).
 *
 * @param selected   Whether the parent node is currently selected.
 * @param editor     The TipTap editor instance (read from NodeViewProps).
 * @param buttonCount  Number of buttons in the toolbar.
 *
 * @returns activeIndex  (-1 when nothing is focused)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';

export interface NodeToolbarNav {
  /** Current focused button index (-1 = none). */
  activeIndex: number;
  /** Call this to register each toolbar button's ref: registerButton(0)(el). */
  registerButton: (index: number) => (el: HTMLButtonElement | null) => void;
}

export function useNodeToolbarNav(
  selected: boolean,
  editor: Editor | null,
  buttonCount: number,
): NodeToolbarNav {
  const [activeIndex, setActiveIndex] = useState(-1);

  // Keep a live ref to activeIndex so the capture-phase keydown listener
  // (registered once) always sees the latest value.
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Keep refs to button DOM nodes so we can trigger click().
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  buttonRefs.current.length = buttonCount;

  const registerButton = useCallback((index: number) => {
    return (el: HTMLButtonElement | null) => {
      buttonRefs.current[index] = el;
    };
  }, []);

  // Reset navigation when the node is deselected.
  useEffect(() => {
    if (!selected) {
      setActiveIndex(-1);
    }
  }, [selected]);

  // ---------------------------------------------------------------
  //  Capture-phase keyboard interception on the editor DOM.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!selected || !editor) return;

    const editorDom = editor.view.dom;

    const handleCaptureKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const isTab = key === 'Tab';
      const isEnter = key === 'Enter';
      const isSpace = key === ' ';
      const isEscape = key === 'Escape';
      const isArrowLeft = key === 'ArrowLeft';
      const isArrowRight = key === 'ArrowRight';

      if (!isTab && !isEnter && !isSpace && !isEscape && !isArrowLeft && !isArrowRight) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const itemCount = buttonCount;
      const current = activeIndexRef.current;

      if (isEscape) {
        // Deselect — move cursor just after the node
        const { to } = editor.state.selection;
        editor.chain().setTextSelection(to).focus().run();
        return;
      }

      if (itemCount === 0) return;

      if (isTab && !e.shiftKey) {
        const next = current >= itemCount - 1 ? 0 : current + 1;
        setActiveIndex(next);
      } else if (isTab && e.shiftKey) {
        const next = current <= 0 ? itemCount - 1 : current - 1;
        setActiveIndex(next);
      } else if (isArrowRight) {
        const next = current >= itemCount - 1 ? 0 : current + 1;
        setActiveIndex(next);
      } else if (isArrowLeft) {
        const next = current <= 0 ? itemCount - 1 : current - 1;
        setActiveIndex(next);
      } else if (isEnter || isSpace) {
        // Click the focused button (if any)
        if (current >= 0 && current < itemCount) {
          buttonRefs.current[current]?.click();
        }
      }
    };

    editorDom.addEventListener('keydown', handleCaptureKeyDown, true);

    return () => {
      editorDom.removeEventListener('keydown', handleCaptureKeyDown, true);
    };
  }, [selected, editor, buttonCount]);

  return { activeIndex, registerButton };
}
