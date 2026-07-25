/**
 * MathBlockExtension - custom block node for LaTeX math formulas.
 *
 * Stores a LaTeX source string as a node attribute. The visual rendering
 * (KaTeX) and editing are handled by MathBlockView.
 *
 * Markdown integration:
 *   - Parsing:  a custom marked block tokenizer recognises `$$ ... $$`
 *     blocks and converts them to `mathBlock` nodes.
 *   - Rendering: the node serialises back to `$$ ... $$` so documents
 *     round-trip through markdown losslessly.
 *
 * Supported attributes:
 *   latex - the LaTeX source string (empty string = placeholder)
 */

import { Node, type JSONContent } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import MathBlockView from '../../../components/editor/nodes/MathBlockView';

export interface MathBlockNodeAttributes {
  id?: string | null;
  latex: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathBlock: {
      /** Insert a math formula block. */
      setMathBlock: (attrs?: Partial<MathBlockNodeAttributes>) => ReturnType;
    };
  }
}

export const MathBlockExtension = Node.create({
  name: 'mathBlock',

  group: 'block',

  atom: true,

  draggable: false,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') || '',
        renderHTML: (attrs) => {
          if (!attrs.latex) return {};
          return { 'data-latex': attrs.latex };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'math-block', ...HTMLAttributes }];
  },

  /* ------------------------------------------------------------------ */
  /* Markdown integration                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Custom marked block tokenizer that recognises `$$ ... $$` math blocks.
   *
   * The `start` function tells marked where the next potential match begins,
   * which is critical for interrupting paragraphs that contain `$$` on a
   * new line.
   */
  markdownTokenizer: {
    name: 'mathBlock',
    level: 'block',
    start(src: string) {
      return src.indexOf('$$');
    },
    tokenize(src: string) {
      // Match $$ ... $$ (single-line or multi-line) at the start of the source.
      const match = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src);
      if (match) {
        return {
          type: 'mathBlock',
          raw: match[0],
          text: match[1].trim(),
          tokens: [],
        };
      }
      return undefined;
    },
  },

  parseMarkdown(token) {
    const latex = token.text || '';
    const node: JSONContent = {
      type: 'mathBlock',
      attrs: { latex },
    };
    return node;
  },

  renderMarkdown(node: JSONContent) {
    const latex = (node.attrs?.latex ?? '').trim();
    return `$$\n${latex}\n$$\n\n`;
  },

  /* ------------------------------------------------------------------ */
  /* Commands & NodeView                                                 */
  /* ------------------------------------------------------------------ */

  addCommands() {
    return {
      setMathBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent([
            {
              type: 'mathBlock',
              attrs: { latex: '', ...attrs },
            },
            {
              type: 'paragraph',
            },
          ]);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },
});

export default MathBlockExtension;
