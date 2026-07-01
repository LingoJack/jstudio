/**
 * useNodeToolbarNav — unified keyboard state machine for NodeView blocks.
 *
 * Every atom block (image, file, diagram, link) shares the same two-state
 * keyboard model:
 *
 *   ┌── selected ──────────────────────────────────────────────────────┐
 *   │  ProseMirror owns the keyboard.                                    │
 *   │    Tab             → focus next toolbar button (wraps)             │
 *   │    Shift+Tab       → focus previous toolbar button (wraps)         │
 *   │    Enter / Space  → click focused button; or, for an interactive   │
 *   │                     block with no button focused, ENTER editing.   │
 *   │    Escape         → deselect the node (collapse after it).         │
 *   │    ← / →           → let through to ProseMirror (caret exits the  │
 *   │                     node selection, moving to adjacent text).      │
 *   │    printable key  → SWALLOWED, so ProseMirror does not replace the │
 *   │                     atom node with the typed character.            │
 *   └────────────────────────────────────────────────────────────────────┘
 *   ┌── editing (interactive blocks only) ───────────────────────────────┐
 *   │  The inner widget (Excalidraw, <iframe>, <video>, …) owns the      │
 *   │  keyboard.  We move DOM focus into the widget and shield every     │
 *   │  keystroke from ProseMirror (so e.g. Backspace deletes a shape     │
 *   │  inside Excalidraw instead of deleting the whole block).           │
 *   │    Escape         → leave editing, back to `selected`.             │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Implementation:
 *   - A capture-phase `keydown` listener on the editor DOM intercepts the
 *     `selected`-state keys before ProseMirror sees them.
 *   - A bubble-phase `keydown` listener on the widget host (`interactiveRef`)
 *     shields the `editing`-state keys from ProseMirror.  It must be a native
 *     listener so it runs *before* ProseMirror's own bubble handler on
 *     `view.dom` (React's synthetic onKeyDown fires too late — after PM).
 *
 * @param selected     Whether the parent node is currently selected.
 * @param editor       The TipTap editor instance (read from NodeViewProps).
 * @param buttonCount  Number of buttons in the toolbar.
 * @param interactive  Whether this block has an inner widget that can take
 *                     over the keyboard (diagram, file preview). Defaults to
 *                     false (image, link card) — those blocks only get the
 *                     printable-key swallow protection, no editing state.
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type HTMLAttributes,
} from 'react';
import type { Editor } from '@tiptap/react';

export interface NodeToolbarNav {
  /** Current focused button index (-1 = none). */
  activeIndex: number;
  /** Call this to register each toolbar button's ref: registerButton(0)(el). */
  registerButton: (index: number) => (el: HTMLButtonElement | null) => void;
  /** True when the inner widget owns the keyboard (interactive blocks only). */
  editing: boolean;
  /** Programmatically enter editing mode (interactive blocks only). */
  enterEditing: () => void;
  /** Programmatically leave editing mode and return focus to the editor. */
  exitEditing: () => void;
  /**
   * Ref to attach to the widget host element (the contentEditable={false}
   * island wrapping the inner widget). Required for keyboard shielding while
   * editing. Only meaningful for interactive blocks.
   */
  interactiveRef: (el: HTMLElement | null) => void;
  /**
   * Props to spread onto the widget host element. Provides double-click entry
   * and a `data-editing` marker for styling. Only meaningful for interactive
   * blocks.
   */
  interactiveProps: HTMLAttributes<HTMLElement>;
}

/** A printable single character that, with no command modifier, would cause
 *  ProseMirror to replace the selected atom node with the typed text.
 *  Returns false during IME composition to avoid swallowing input. */
function isPrintableKey(e: KeyboardEvent): boolean {
  if (e.isComposing || e.keyCode === 229) return false;
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

export function useNodeToolbarNav(
  selected: boolean,
  editor: Editor | null,
  buttonCount: number,
  interactive = false,
): NodeToolbarNav {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [editing, setEditing] = useState(false);

  // Live refs so the (registered-once) native listeners always read the
  // latest state.
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  // Toolbar button DOM nodes, so Enter/Space can trigger click().
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  buttonRefs.current.length = buttonCount;

  const registerButton = useCallback((index: number) => {
    return (el: HTMLButtonElement | null) => {
      buttonRefs.current[index] = el;
    };
  }, []);

  // The widget host element (interactive blocks only).
  const hostElRef = useRef<HTMLElement | null>(null);
  const interactiveRef = useCallback((el: HTMLElement | null) => {
    hostElRef.current = el;
  }, []);

  // ---------------------------------------------------------------
  //  State transitions
  // ---------------------------------------------------------------
  const enterEditing = useCallback(() => {
    if (!interactive) return;
    setActiveIndex(-1);
    setEditing(true);
  }, [interactive]);

  const exitEditing = useCallback(() => {
    setEditing(false);
    // Return focus to the editor; the NodeSelection is still in PM state,
    // so the block re-shows its `selected` ring and arrow/Backspace work.
    editor?.commands.focus();
  }, [editor]);

  // Reset everything when the node is deselected.
  useEffect(() => {
    if (!selected) {
      setActiveIndex(-1);
      setEditing(false);
    }
  }, [selected]);

  // ---------------------------------------------------------------
  //  Capture-phase keyboard interception on the editor DOM.
  //  Active only in the `selected` (non-editing) state.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!selected || !editor) return;

    const editorDom = editor.view.dom;

    const handleCaptureKeyDown = (e: KeyboardEvent) => {
      // While editing, the inner widget owns the keyboard — never intercept
      // here (the widget-host listener handles shielding instead).
      if (editingRef.current) return;

      // Never intercept during IME composition — preventDefault() would
      // cancel the composition and lose the character.
      if (e.isComposing || e.keyCode === 229) return;

      const key = e.key;
      const isTab = key === 'Tab';
      const isEnter = key === 'Enter';
      const isSpace = key === ' ';
      const isEscape = key === 'Escape';
      const printable = isPrintableKey(e);

      // Let everything else through: Backspace/Delete (delete the node),
      // ArrowUp/ArrowDown (block navigation), ArrowLeft/ArrowRight (ProseMirror
      // moves the caret out of the NodeSelection), and command shortcuts.
      // ArrowLeft/ArrowRight are deliberately NOT toolbar-cycle keys: only
      // Tab/Shift+Tab cycles the toolbar buttons.
      if (
        !isTab &&
        !isEnter &&
        !isSpace &&
        !isEscape &&
        !printable
      ) {
        return;
      }

      const itemCount = buttonCount;
      const current = activeIndexRef.current;

      // Escape — deselect, move caret just after the node.
      if (isEscape) {
        e.preventDefault();
        e.stopPropagation();
        const { to } = editor.state.selection;
        editor.chain().setTextSelection(to).focus().run();
        return;
      }

      // Tab / Shift+Tab — cycle toolbar buttons (the only toolbar-cycle keys;
      // arrow keys fall through to ProseMirror above).
      if (isTab && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (itemCount > 0) setActiveIndex(current >= itemCount - 1 ? 0 : current + 1);
        return;
      }
      if (isTab && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (itemCount > 0) setActiveIndex(current <= 0 ? itemCount - 1 : current - 1);
        return;
      }

      // Enter / Space — activate the focused button, else enter editing.
      if (isEnter || isSpace) {
        e.preventDefault();
        e.stopPropagation();
        if (current >= 0 && current < itemCount) {
          buttonRefs.current[current]?.click();
        } else if (interactive) {
          enterEditing();
        }
        return;
      }

      // Any other printable key on a selected block: swallow it so
      // ProseMirror does not replace the atom node with the character.
      // (We deliberately do NOT auto-enter editing here — entry is explicit
      // via the toolbar icon / double-click / Enter, so a stray keypress
      // never silently flips the block into edit mode.)
      if (printable) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    editorDom.addEventListener('keydown', handleCaptureKeyDown, true);
    return () => {
      editorDom.removeEventListener('keydown', handleCaptureKeyDown, true);
    };
  }, [selected, editor, buttonCount, interactive, enterEditing]);

  // ---------------------------------------------------------------
  //  Escape-to-exit while editing.
  //
  //  IMPORTANT: we must NOT blanket-stopPropagation keydown events here.
  //  Inner widgets like Excalidraw bind their keyboard handler as a React
  //  synthetic `onKeyDown`, which React 19 dispatches via a single delegated
  //  listener on the React ROOT.  A native `stopPropagation()` on this host
  //  (a descendant of the root) would prevent the event from ever reaching
  //  the root — so the widget's onKeyDown would never fire and shortcuts
  //  like "2" (tool switch) would break.
  //
  //  ProseMirror already ignores keydown whose target sits inside this
  //  NodeView (its NodeView.stopEvent returns true), so we don't need to
  //  shield PM manually.  We only intercept Escape to leave edit mode.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!editing) return;
    const host = hostElRef.current;
    if (!host) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        exitEditing();
      }
      // All other keys: leave untouched so they reach the inner widget
      // (via React root delegation) and never reach ProseMirror (via the
      // NodeView's own stopEvent).
    };

    host.addEventListener('keydown', onKeyDown);
    return () => host.removeEventListener('keydown', onKeyDown);
  }, [editing, exitEditing]);

  // ---------------------------------------------------------------
  //  Props for the widget host element.
  // ---------------------------------------------------------------
  const interactiveProps = useMemo<HTMLAttributes<HTMLElement>>(
    () => ({
      onDoubleClick: (e) => {
        if (!interactive) return;
        e.stopPropagation();
        enterEditing();
      },
      // `data-editing` lets CSS show a distinct ring while editing.
      ...(editing ? { 'data-editing': 'true' } : {}),
    }),
    [interactive, enterEditing, editing],
  );

  return {
    activeIndex,
    registerButton,
    editing,
    enterEditing,
    exitEditing,
    interactiveRef,
    interactiveProps,
  };
}
