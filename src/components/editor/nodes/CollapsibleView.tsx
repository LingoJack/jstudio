/**
 * CollapsibleView — React NodeView for the collapsible block.
 *
 * Layout:
 *
 *   ┌───────────────────────────────────────────────┐
 *   │  ▼  [Summary title input ........................]  │  ← header (contentEditable=false)
 *   ├───────────────────────────────────────────────┤
 *   │  <NodeViewContent>                              │  ← editable body (TipTap content)
 *   │  • paragraphs, headings, images, etc.           │
 *   └───────────────────────────────────────────────┘
 *
 * Key constraints:
 *   - `NodeViewContent` MUST always be in the DOM tree (ProseMirror needs the
 *     contentDOM even when collapsed). We toggle visibility with `hidden`.
 *   - The header row is `contentEditable={false}` so ProseMirror never treats
 *     it as editable text.
 *   - Visual styles reuse the shared constants from `components/ui/Collapsible`.
 *
 * Critical WKWebView caret fix:
 *   ProseMirror registers its mousedown handler on `view.dom`, which is an
 *   ANCESTOR of this NodeView. React's synthetic onClick is delegated at the
 *   React root — also above view.dom — so a React-level stopPropagation runs
 *   *after* ProseMirror has already handled the event and called preventDefault()
 *   (to make a NodeSelection on this atom node). That cancels the browser's
 *   native "drop the caret where you clicked" action, so clicking inside an
 *   input no longer moves the caret.
 *
 *   The fix is a NATIVE, bubble-phase listener on the wrapper element (which
 *   sits *below* view.dom): it fires before the event bubbles up to ProseMirror.
 *   For clicks on form controls we stopPropagation, so ProseMirror never sees
 *   the mousedown and never calls preventDefault — the browser then runs its
 *   default action and places the caret exactly where the user clicked.
 *
 * Critical beforeinput fix (text entry — "can't type in the title" bug):
 *   ProseMirror ALSO registers a `beforeinput` handler on `view.dom`. Unlike
 *   the mousedown handler, it does NOT check whether event.target is a form
 *   control — it assumes every beforeinput bubbling up is editor-content
 *   input, calls `preventDefault()`, and tries to insert the text via its own
 *   transaction. That cancels the browser's native character insertion into
 *   the <input>, so the subsequent `input` event never fires and React's
 *   onChange never runs — the title field looks completely dead.
 *
 *   The fix uses the same pattern: a native bubble-phase `beforeinput`
 *   listener on the wrapper that stopPropagation's when the target is a form
 *   control, so ProseMirror never sees the event and the browser inserts the
 *   character normally. The `input` event then fires, bubbles past view.dom
 *   up to the React root, and onChange runs as expected. Composition events
 *   (CJK IME) are shielded the same way to keep Chinese/Japanese/Korean
 *   input working.
 */

import { useEffect, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { ChevronDown } from 'lucide-react';
import {
  COLLAPSIBLE_WRAPPER_CLASS,
  COLLAPSIBLE_HEADER_CLASS,
} from '../../ui/Collapsible';
import { useCursorTrail } from '../CursorTrailContext';

/** Tags that should be shielded from ProseMirror's event interception. */
const SHIELD_TAGS = new Set(['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);

export default function CollapsibleView({
  node,
  updateAttributes,
}: NodeViewProps) {
  const open = (node.attrs['open'] as boolean) ?? true;
  const summary = (node.attrs['summary'] as string) ?? '';

  // Local state for editing — avoids ProseMirror re-render on every keystroke
  const [localSummary, setLocalSummary] = useState(summary);
  const inputRef = useRef<HTMLInputElement>(null);

  // Register input with cursor trail for caret measurement
  const cursorTrail = useCursorTrail();
  useEffect(() => {
    if (!inputRef.current || !cursorTrail) return;
    return cursorTrail.registerInput(inputRef.current);
  }, [cursorTrail]);

  // Sync local state when node.attrs.summary changes from outside
  useEffect(() => {
    setLocalSummary(summary);
  }, [summary]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const toggleOpen = () => updateAttributes({ open: !open });

  // Commit local edits to ProseMirror on blur or Enter
  const commitSummary = () => {
    if (localSummary !== summary) {
      updateAttributes({ summary: localSummary });
    }
  };

  /**
   * Native bubble-phase listeners on the wrapper. Runs before the event
   * bubbles up to ProseMirror (on view.dom). When the click/keydown lands on a
   * form control, we stopPropagation so ProseMirror never sees it — letting
   * the browser handle the event normally.
   *
   * IMPORTANT: React's synthetic e.stopPropagation() only stops the React
   * synthetic event propagation, NOT the native DOM event. ProseMirror
   * registers native DOM listeners on view.dom, so we need native listeners
   * here to actually block the event from reaching ProseMirror.
   */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    /** True when the event landed on a form control we must shield. */
    const isFormControl = (target: EventTarget | null): boolean => {
      const t = target as HTMLElement | null;
      if (!t) return false;
      return SHIELD_TAGS.has(t.tagName) || !!t.closest('input, textarea, select, button');
    };

    /**
     * mousedown — prevent ProseMirror from placing its own caret / making a
     * NodeSelection when the user clicks a form control. Lets the browser
     * drop the native caret inside the <input>.
     */
    const mousedownShield = (e: MouseEvent) => {
      if (isFormControl(e.target)) {
        e.stopPropagation();
      }
    };

    /**
     * keydown — shield navigation keys so ProseMirror's keymap doesn't move
     * the editor selection / delete nodes while the user is navigating
     * inside the <input>. Modifier combos (Cmd+S, Ctrl+C …) are left alone
     * for global shortcuts. Ordinary character keys are NOT shielded here:
     * they are harmless at the keydown stage because ProseMirror handles
     * text insertion via the `beforeinput` event (see below), not keydown.
     */
    const keydownShield = (e: KeyboardEvent) => {
      if (!isFormControl(e.target)) return;
      const { key, metaKey, ctrlKey, altKey } = e;
      if (metaKey || ctrlKey || altKey) return;
      if (
        key.startsWith('Arrow') ||
        key === 'Backspace' ||
        key === 'Delete' ||
        key === 'Tab' ||
        key === 'Home' ||
        key === 'End'
      ) {
        e.stopPropagation();
      }
    };

    /**
     * beforeinput — THE critical fix for "can't type in the title".
     *
     * Modern browsers (incl. WKWebView) deliver text input through
     * `beforeinput` (InputEvent, inputType "insertText" etc.). ProseMirror's
     * beforeinput handler on view.dom does NOT check whether event.target is
     * an <input> — it assumes every beforeinput is editor-content input,
     * calls `event.preventDefault()`, and tries to insert the text via its
     * own transaction. The preventDefault() cancels the browser's native
     * character insertion into the <input>, so the subsequent `input` event
     * never fires and React's onChange never runs — the title looks dead.
     *
     * stopPropagation() here on the wrapper (which sits *below* view.dom)
     * fires before the event reaches ProseMirror, so ProseMirror never sees
     * it and never calls preventDefault. The browser then inserts the
     * character normally, the `input` event fires and bubbles past view.dom
     * up to the React root, and onChange runs as expected.
     *
     * Note: stopPropagation on `beforeinput` does NOT affect the separate
     * `input` event — they are different events, so React's onChange (which
     * listens for `input` at the React root) still fires.
     */
    const beforeinputShield = (e: InputEvent) => {
      if (!isFormControl(e.target)) return;
      e.stopPropagation();
    };

    /**
     * composition events — shield CJK IME sessions for the same reason as
     * beforeinput. ProseMirror's compositionstart/compositionend handlers on
     * view.dom would otherwise hijack the IME composition, breaking Chinese
     * / Japanese / Korean input in the title field.
     */
    const compositionShield = (e: CompositionEvent) => {
      if (!isFormControl(e.target)) return;
      e.stopPropagation();
    };

    el.addEventListener('mousedown', mousedownShield);
    el.addEventListener('keydown', keydownShield);
    el.addEventListener('beforeinput', beforeinputShield as EventListener);
    el.addEventListener('compositionstart', compositionShield);
    el.addEventListener('compositionupdate', compositionShield);
    el.addEventListener('compositionend', compositionShield);
    return () => {
      el.removeEventListener('mousedown', mousedownShield);
      el.removeEventListener('keydown', keydownShield);
      el.removeEventListener('beforeinput', beforeinputShield as EventListener);
      el.removeEventListener('compositionstart', compositionShield);
      el.removeEventListener('compositionupdate', compositionShield);
      el.removeEventListener('compositionend', compositionShield);
    };
  }, []);

  return (
    <NodeViewWrapper className="my-3">
      <div ref={wrapperRef} className={COLLAPSIBLE_WRAPPER_CLASS}>
        {/* ── Header row (non-editable) ── */}
        <div
          contentEditable={false}
          className={COLLAPSIBLE_HEADER_CLASS}
          onClick={(e) => {
            // Don't toggle when clicking the input itself.
            if ((e.target as HTMLElement).tagName === 'INPUT') return;
            toggleOpen();
          }}
        >
          <ChevronDown
            className={`w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
          <input
            ref={inputRef}
            type="text"
            value={localSummary}
            onChange={(e) => {
              setLocalSummary(e.target.value);
              // Notify cursor trail to re-measure caret position
              cursorTrail?.markDirty();
            }}
            onBlur={commitSummary}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitSummary();
              }
              // Arrow keys move caret — notify trail
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                cursorTrail?.markDirty();
              }
            }}
            onSelect={() => cursorTrail?.markDirty()}
            placeholder="折叠块标题..."
            className="flex-1 bg-transparent border-none focus:outline-none text-sm font-medium text-[var(--vscode-editor-foreground)] placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-50"
          />
        </div>

        {/* ── Editable body (always rendered, visibility toggled by CSS) ── */}
        {/* NodeViewContent provides the contentDOM that ProseMirror manages. */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <NodeViewContent as="div" className={`px-4 py-3 ${open ? '' : 'hidden'}`} />
      </div>
    </NodeViewWrapper>
  );
}