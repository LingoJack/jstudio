/**
 * CollapsibleView — React NodeView for the collapsible block.
 *
 * Layout:
 *
 *   ┌───────────────────────────────────────────────┐
 *   │  ▼  [Summary title input ........................]  │  ← header
 *   ├───────────────────────────────────────────────┤
 *   │  <NodeViewContent>                              │  ← editable body (TipTap content)
 *   │  • paragraphs, headings, images, etc.           │
 *   └───────────────────────────────────────────────┘
 *
 * Key constraints:
 *   - `NodeViewContent` MUST always be in the DOM tree (ProseMirror needs the
 *     contentDOM even when collapsed). We toggle visibility with `hidden`.
 *
 * ── Why contentEditable={false} is NOT on the header ──
 *
 * In WKWebView (Tauri/macOS), `contentEditable={false}` inside a
 * `contentEditable={true}` editor creates a "non-editable island". WebKit
 * blocks keyboard input to ALL form controls inside that island — the
 * `<input>` can receive focus but no characters are inserted. This is a
 * browser-level behavior that JavaScript event shielding cannot override.
 *
 * Without `contentEditable={false}`, TipTap's `NodeView.stopEvent` handles
 * everything correctly:
 *   - Events from `<input>` (outside contentDOM): stopEvent returns true →
 *     ProseMirror ignores them → browser handles input normally.
 *   - Clicks on header background (isContentEditable=true): stopEvent returns
 *     false → ProseMirror handles → places NodeSelection (desired).
 *   - ProseMirror's mousedown handler calls preventDefault() → no stray
 *     text caret appears in the header.
 *
 * ── Event shields (safety net) ──
 *
 * Native bubble-phase listeners on the wrapper provide defense-in-depth.
 * They fire before events bubble to ProseMirror's listeners on view.dom.
 * For form-control events we stopPropagation so ProseMirror never sees them.
 * This covers edge cases where pmViewDesc might not be set correctly.
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
   * Native bubble-phase listeners — defense-in-depth safety net.
   * Fires before events bubble to ProseMirror's listeners on view.dom.
   * For form-control events we stopPropagation so ProseMirror never sees them.
   */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const isFormControl = (target: EventTarget | null): boolean => {
      const t = target as HTMLElement | null;
      if (!t) return false;
      return SHIELD_TAGS.has(t.tagName) || !!t.closest('input, textarea, select, button');
    };

    const mousedownShield = (e: MouseEvent) => {
      if (isFormControl(e.target)) {
        e.stopPropagation();
      }
    };

    // Shield ALL keydown events from form controls (not just navigation keys).
    // In WKWebView, ProseMirror's keydown handler can interfere with input
    // even for printable characters in certain edge cases.
    const keydownShield = (e: KeyboardEvent) => {
      if (isFormControl(e.target)) {
        e.stopPropagation();
      }
    };

    // Shield beforeinput — prevents ProseMirror from calling preventDefault()
    // on text insertion events from the <input>.
    const beforeinputShield = (e: InputEvent) => {
      if (isFormControl(e.target)) {
        e.stopPropagation();
      }
    };

    // Shield composition events — protects CJK IME input.
    const compositionShield = (e: CompositionEvent) => {
      if (isFormControl(e.target)) {
        e.stopPropagation();
      }
    };

    el.addEventListener('mousedown', mousedownShield);
    el.addEventListener('keydown', keydownShield);
    el.addEventListener('beforeinput', beforeinputShield);
    el.addEventListener('compositionstart', compositionShield);
    el.addEventListener('compositionupdate', compositionShield);
    el.addEventListener('compositionend', compositionShield);
    return () => {
      el.removeEventListener('mousedown', mousedownShield);
      el.removeEventListener('keydown', keydownShield);
      el.removeEventListener('beforeinput', beforeinputShield);
      el.removeEventListener('compositionstart', compositionShield);
      el.removeEventListener('compositionupdate', compositionShield);
      el.removeEventListener('compositionend', compositionShield);
    };
  }, []);

  return (
    <NodeViewWrapper className="my-3">
      <div ref={wrapperRef} className={COLLAPSIBLE_WRAPPER_CLASS}>
        {/* ── Header row ── */}
        {/* NO contentEditable={false} — WKWebView blocks keyboard input to
            form controls inside contentEditable={false} islands. TipTap's
            stopEvent + the native shields below handle ProseMirror isolation. */}
        <div
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