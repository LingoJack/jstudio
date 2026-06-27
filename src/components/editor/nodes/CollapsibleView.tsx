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
 *   - The summary <input> stops click propagation so typing doesn't toggle.
 *   - Visual styles reuse the shared constants from `components/ui/Collapsible`.
 */

import { type NodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { ChevronDown } from 'lucide-react';
import {
  COLLAPSIBLE_WRAPPER_CLASS,
  COLLAPSIBLE_HEADER_CLASS,
} from '../../ui/Collapsible';

export default function CollapsibleView({
  node,
  updateAttributes,
}: NodeViewProps) {
  const open = (node.attrs['open'] as boolean) ?? true;
  const summary = (node.attrs['summary'] as string) ?? '';

  const toggleOpen = () => updateAttributes({ open: !open });

  return (
    <NodeViewWrapper className="my-3">
      <div className={COLLAPSIBLE_WRAPPER_CLASS}>
        {/* ── Header row (non-editable) ── */}
        <div
          contentEditable={false}
          className={COLLAPSIBLE_HEADER_CLASS}
          onClick={toggleOpen}
        >
          <ChevronDown
            className={`w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
          <input
            type="text"
            value={summary}
            onChange={(e) => updateAttributes({ summary: e.target.value })}
            onClick={(e) => e.stopPropagation()}
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
