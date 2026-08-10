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
 *   align - 'left' | 'center' (default: 'center')
 *
 * Keyboard:
 *   Enter when selected -> enter edit mode (handled by useNodeToolbarNav
 *   in MathBlockView, not by a keyboard shortcut here).
 */

import { Node, InputRule, type JSONContent } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import MathBlockView from '../../../components/editor/nodes/MathBlockView';

export interface MathBlockNodeAttributes {
  id?: string | null;
  latex: string;
  align?: 'left' | 'center' | null;
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

  // Allow GapCursor so users can click in the margin between two adjacent
  // math blocks to place a cursor and type to insert a paragraph.
  // The earlier "hollow dot" visual glitch (a 0x0 GapCursor div rendered by
  // some browsers) is now handled by CSS: .ProseMirror-gapcursor is
  // display:none unless the editor is focused, so the dot no longer appears
  // during transient focus changes (e.g. pressing Backspace).
  allowGapCursor: true,

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
      align: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-align') || 'center',
        renderHTML: (attrs) => {
          const a = attrs.align ?? 'center';
          return a === 'center' ? {} : { 'data-align': a };
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
        ({ chain }) => {
          return chain()
            .insertContent([
              {
                type: 'mathBlock',
                attrs: { latex: '', ...attrs },
              },
              {
                type: 'paragraph',
              },
            ])
            .selectNodeBackward()
            .run();
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  /* ------------------------------------------------------------------ */
  /* Input rules - typing `$$ ... $$` creates a math block              */
  /* ------------------------------------------------------------------ */

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$([\s\S]+?)\$\$$/,
        handler: ({ state, range, match }) => {
          const latex = (match[1] || '').trim();
          if (!latex) return;
          const { tr } = state;
          const $from = state.doc.resolve(range.from);
          const paraStart = $from.before(1);
          const paraEnd = $from.after(1);
          const mathBlock = state.schema.nodes.mathBlock.create({ latex });
          const paragraph = state.schema.nodes.paragraph.create();
          tr.replaceWith(paraStart, paraEnd, [mathBlock, paragraph]);
          tr.setSelection(
            TextSelection.near(tr.doc.resolve(paraStart + mathBlock.nodeSize + 1)),
          );
        },
      }),
    ];
  },
});

export default MathBlockExtension;
