/**
 * CodeBlockWithChrome — CodeBlockLowlight extension with a React NodeView.
 *
 * Adds a language selector (top-right) and a copy button (bottom-right,
 * hover-only) on top of CodeBlockLowlight's syntax highlighting.
 *
 * Custom attribute:
 *   maxHeightPct — maximum body height as a percentage of the viewport height
 *                  (0-100). When set, the code body scrolls instead of growing
 *                  unbounded. The user can drag a resize handle to adjust this.
 */

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CodeBlockView from '../components/CodeBlockView';

export interface CodeBlockNodeAttributes {
  language?: string;
  /** Maximum body height as a percentage of viewport height (0-100). null = auto (no scroll). */
  maxHeightPct?: number | null;
}

export const CodeBlockWithChrome = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      maxHeightPct: {
        default: 60,
        parseHTML: (el) => {
          const v = el.getAttribute('data-max-height-pct');
          return v ? Number(v) : 60;
        },
        renderHTML: (attrs) => {
          if (attrs.maxHeightPct == null) return {};
          return { 'data-max-height-pct': attrs.maxHeightPct };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
