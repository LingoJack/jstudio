/**
 * TldrawExtension — custom block node for tldraw diagrams.
 *
 * Stores a serialized tldraw snapshot (JSON string) as a node attribute so the
 * drawing data is self-contained and travels with the document. The visual
 * rendering and full-screen modal editing are handled by TldrawView.
 *
 * Supported attributes:
 *   snapshot — serialized tldraw snapshot JSON (empty string = not started)
 *   width    — display width in px (null = auto, defaults to ~520px)
 *   align    — 'left' | 'center' (default 'center')
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import TldrawView from '../components/TldrawView';

export interface DiagramNodeAttributes {
  snapshot: string;
  width: number | null;
  align: 'left' | 'center';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagramBlock: {
      /** Insert a diagram (tldraw) block. */
      setDiagram: (attrs?: Partial<DiagramNodeAttributes>) => ReturnType;
    };
  }
}

export const TldrawExtension = Node.create({
  name: 'diagramBlock',

  group: 'block',

  atom: true,

  draggable: false,

  addAttributes() {
    return {
      snapshot: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-snapshot') || '',
        renderHTML: (attrs) => {
          if (!attrs.snapshot) return {};
          return { 'data-snapshot': attrs.snapshot };
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
      align: {
        default: 'center' as const,
        parseHTML: (el) => {
          const align = el.getAttribute('data-align');
          if (align === 'left' || align === 'center') return align;
          return 'center';
        },
        renderHTML: (attrs) => {
          if (!attrs.align) return {};
          return { 'data-align': attrs.align };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="diagram-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-type': 'diagram-block', ...HTMLAttributes },
    ];
  },

  addCommands() {
    return {
      setDiagram:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent([
            {
              type: 'diagramBlock',
              attrs: {
                snapshot: '',
                width: null,
                align: 'center',
                ...attrs,
              },
            },
            {
              type: 'paragraph',
            },
          ]);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TldrawView);
  },
});

export default TldrawExtension;
