/**
 * CollapsibleView - React NodeView for the collapsible block.
 *
 * Layout:
 *
 *   ┌───────────────────────────────────────────────┐
 *   │  ▶  [Summary title input ........................]  │  ← header
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
 * blocks keyboard input to ALL form controls inside that island - the
 * `<input>` can receive focus but no characters are inserted. This is a
 * browser-level behavior that JavaScript event shielding cannot override.
 *
 * Without `contentEditable={false}`, TipTap's `NodeView.stopEvent` handles
 * everything correctly:
 *   - Events from `<input>` (outside contentDOM): stopEvent returns true ->
 *     ProseMirror ignores them -> browser handles input normally.
 *   - Clicks on header background (isContentEditable=true): stopEvent returns
 *     false -> ProseMirror handles -> places NodeSelection (desired).
 *   - ProseMirror's mousedown handler calls preventDefault() -> no stray
 *     text caret appears in the header.
 *
 * ── Toggle button ──
 *
 * The collapse chevron is a real <button> (reusing CodeBlockView's
 * `.editor-toolbar-btn` / `.code-collapse-toggle` styling). A <button> is a
 * form control: TipTap's stopEvent returns true for it (ProseMirror ignores
 * the event) AND the browser focuses the button instead of placing a stray
 * text caret in the contentEditable header - which is what previously
 * happened when the chevron was a bare <svg> and the caret landed at the
 * right edge of the title bar.
 *
 * The mousedownShield also calls preventDefault() on <button> mousedowns.
 * Without this, when a NodeSelection (e.g. an image) is active inside the
 * collapsible, the browser's first click on the button is consumed by
 * selection handling (clearing the non-text NodeSelection), so the toggle
 * silently fails and the user must click again. preventDefault stops the
 * browser's selection handling; button.focus() restores focus manually.
 *
 * ── Event shields (safety net) ──
 *
 * Native bubble-phase listeners on the wrapper provide defense-in-depth.
 * They fire before events bubble to ProseMirror's listeners on view.dom.
 * For form-control events we stopPropagation so ProseMirror never sees them.
 * This covers edge cases where pmViewDesc might not be set correctly.
 */

import { useEffect, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper, NodeViewContent, type Editor } from '@tiptap/react';
import { ChevronRight, Copy, Check } from 'lucide-react';
import { handleNativeSelectAll } from '../../../lib/shortcuts/nativeSelectAll';
import { useI18n } from '../../../lib/core/i18n';
import { COLLAPSIBLE_HEADER_CLASS } from '../../ui/Collapsible';
import { useNodeSelected } from '../hooks/useNodeSelected';
import { useCursorTrailHostRef } from '../CursorTrailContext';

/** Tags that should be shielded from ProseMirror's event interception. */
const SHIELD_TAGS = new Set(['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);

export default function CollapsibleView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const open = (node.attrs['open'] as boolean) ?? true;
  const summary = (node.attrs['summary'] as string) ?? '';

  // 是否真正被选中（NodeSelection 指向本节点）。
  // 用 useNodeSelected 而非 NodeViewProps.selected：后者在文本选择扫过本块时
  // 也会变 true，导致边框误高亮。与 CodeBlockView 保持一致。
  const selected = useNodeSelected((editor as Editor | null) ?? null, getPos);
  const { t } = useI18n();

  // Local state for editing - avoids ProseMirror re-render on every keystroke
  const [localSummary, setLocalSummary] = useState(summary);
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorTrailInputRef = useCursorTrailHostRef(inputRef);

  // Sync local state when node.attrs.summary changes from outside
  useEffect(() => {
    setLocalSummary(summary);
  }, [summary]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const toggleOpen = () => updateAttributes({ open: !open });

  // ── Copy all content inside the collapsible ──
  // node.textContent reads from ProseMirror state, so it works even when
  // the block is collapsed (NodeViewContent is `hidden` via CSS, not unmounted).
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const text = node.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Commit local edits to ProseMirror on blur or Enter
  const commitSummary = () => {
    if (localSummary !== summary) {
      updateAttributes({ summary: localSummary });
    }
  };

  /**
   * Native bubble-phase listeners - defense-in-depth safety net.
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
        // For <button> elements, also preventDefault to stop the browser
        // from placing a caret in the contentEditable. Without this, when a
        // NodeSelection (e.g., an image) is active inside the collapsible,
        // the first click on the toggle button is consumed by the browser's
        // selection handling (clearing the non-text selection), requiring a
        // second click to actually toggle. preventDefault on mousedown stops
        // this; we then manually focus the button (preventDefault suppresses
        // the browser's default focus behaviour).
        const button = (e.target as HTMLElement | null)?.closest('button');
        if (button) {
          e.preventDefault();
          button.focus();
        }
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

    // Shield beforeinput - prevents ProseMirror from calling preventDefault()
    // on text insertion events from the <input>.
    const beforeinputShield = (e: InputEvent) => {
      if (isFormControl(e.target)) {
        e.stopPropagation();
      }
    };

    // Shield composition events - protects CJK IME input.
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
    <NodeViewWrapper className="collapsible-block-wrapper my-3">
      <div
        ref={wrapperRef}
        className={`collapsible-block-figure ${selected ? 'is-selected' : ''} ${
          open ? '' : 'is-collapsed'
        }`}
      >
        {/* ── Header row ── */}
        {/* NO contentEditable={false} - WKWebView blocks keyboard input to
            form controls inside contentEditable={false} islands. TipTap's
            stopEvent + the native shields below handle ProseMirror isolation. */}
        <div className={`collapsible-block-header ${COLLAPSIBLE_HEADER_CLASS} !cursor-default`}>
          {/* Collapse toggle - real <button> so the browser focuses it (no
              stray caret in the contentEditable header) and ProseMirror ignores
              the click via stopEvent. Styling/logic mirror CodeBlockView. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleOpen();
            }}
            className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-collapse-toggle"
            title={open ? t('collapsible.collapse') : t('collapsible.expand')}
            aria-label={open ? t('collapsible.collapse') : t('collapsible.expand')}
            aria-expanded={open}
          >
            <ChevronRight
              size={14}
              className={`code-collapse-chevron ${open ? 'is-open' : ''}`}
            />
          </button>
          {/* Copy-all button — inline next to the chevron on the left,
              consistent with CodeBlockView's left-aligned action group.
              Subtle by default, brightens on hover/selection (see
              .collapsible-copy-btn in vscode-theme.css). */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm collapsible-copy-btn"
            title={t('collapsible.copy')}
            aria-label={t('collapsible.copy')}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <input
            ref={cursorTrailInputRef}
            type="text"
            value={localSummary}
            onChange={(e) => setLocalSummary(e.target.value)}
            onBlur={commitSummary}
            onKeyDown={(e) => {
              if (handleNativeSelectAll(e)) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                commitSummary();
              }
            }}
            placeholder="折叠块标题..."
            className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-sm font-medium text-[var(--vscode-editor-foreground)] placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-50"
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
