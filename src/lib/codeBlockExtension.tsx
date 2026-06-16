/**
 * CodeBlockWithChrome — CodeBlockLowlight extension with a React NodeView.
 *
 * Adds a language selector (top-right) and a copy button (bottom-right,
 * hover-only) on top of CodeBlockLowlight's syntax highlighting.
 */

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CodeBlockView from '../components/CodeBlockView';

export const CodeBlockWithChrome = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
