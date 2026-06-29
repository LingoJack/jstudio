/**
 * CodeBlockWithChrome — CodeBlockLowlight extension with a React NodeView.
 *
 * Adds a language selector (top-right) and a copy button (bottom-right,
 * hover-only) on top of CodeBlockLowlight's syntax highlighting.
 *
 * Resize model (unified with File / Image / Diagram blocks):
 *   width / widthPct  — figure width (px legacy / percentage of editor width)
 *   height / heightPct — body (or HTML preview) height (px legacy / pct of editor width)
 *
 * `maxHeightPct` is kept only for backward-compatible parsing of older
 * documents; the NodeView no longer applies it.
 */

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CodeBlockView from '../../components/editor/nodes/CodeBlockView';

export interface CodeBlockNodeAttributes {
  language?: string;
  /** HTML code blocks: whether the rendered (iframe) preview is shown instead of the source. */
  htmlPreview?: boolean;
  /** Legacy: maximum body height as a percentage of viewport height (0-100). Parsed for backward-compat only. */
  maxHeightPct?: number | null;
  /** Legacy pixel width (kept for backward-compat migration). */
  width?: number | null;
  /** Width as a percentage of the editor surface width (0-100). Preferred. */
  widthPct?: number | null;
  /** Legacy pixel height (kept for backward-compat migration). */
  height?: number | null;
  /** Height as a percentage of the editor surface width (0-100). Preferred. */
  heightPct?: number | null;
}

export const CodeBlockWithChrome = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      htmlPreview: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-html-preview') === 'true',
        renderHTML: (attrs) => {
          if (!attrs.htmlPreview) return {};
          return { 'data-html-preview': 'true' };
        },
      },
      maxHeightPct: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-max-height-pct');
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => {
          if (attrs.maxHeightPct == null) return {};
          return { 'data-max-height-pct': attrs.maxHeightPct };
        },
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('data-width');
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { 'data-width': attrs.width };
        },
      },
      widthPct: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-width-pct');
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => {
          if (attrs.widthPct == null) return {};
          return { 'data-width-pct': attrs.widthPct };
        },
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const h = el.getAttribute('data-height');
          return h ? Number(h) : null;
        },
        renderHTML: (attrs) => {
          if (!attrs.height) return {};
          return { 'data-height': attrs.height };
        },
      },
      heightPct: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-height-pct');
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => {
          if (attrs.heightPct == null) return {};
          return { 'data-height-pct': attrs.heightPct };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
