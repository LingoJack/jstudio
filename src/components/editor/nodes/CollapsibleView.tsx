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
 */

import { useEffect, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { ChevronDown } from 'lucide-react';
import {
  COLLAPSIBLE_WRAPPER_CLASS,
  COLLAPSIBLE_HEADER_CLASS,
} from '../../ui/Collapsible';

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

    const mousedownShield = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (SHIELD_TAGS.has(target.tagName) || target.closest('input, textarea, select, button')) {
        e.stopPropagation();
      }
    };

    const keydownShield = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (SHIELD_TAGS.has(target.tagName) || target.closest('input, textarea, select, button')) {
        e.stopPropagation();
      }
    };

    const beforeinputShield = (e: InputEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (SHIELD_TAGS.has(target.tagName) || target.closest('input, textarea, select, button')) {
        e.stopPropagation();
      }
    };

    el.addEventListener('mousedown', mousedownShield);
    el.addEventListener('keydown', keydownShield);
    el.addEventListener('beforeinput', beforeinputShield as EventListener);
    return () => {
      el.removeEventListener('mousedown', mousedownShield);
      el.removeEventListener('keydown', keydownShield);
      el.removeEventListener('beforeinput', beforeinputShield as EventListener);
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
            onChange={(e) => setLocalSummary(e.target.value)}
            onBlur={commitSummary}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitSummary();
              }
            }}
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