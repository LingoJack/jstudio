/**
 * DiagramExtension — custom block node for excalidraw diagrams.
 *
 * Stores a serialized excalidraw scene (JSON string) as a node attribute so the
 * drawing data is self-contained and travels with the document. The visual
 * rendering and window editing are handled by DiagramBlockView.
 *
 * Supported attributes:
 *   snapshot — serialized excalidraw scene JSON (empty string = blank canvas)
 *   width    — display width in px (null = auto, defaults to ~520px)
 *   height   — canvas height in px (null = auto, defaults to ~320px)
 *   align    — 'left' | 'center' (default 'center')
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import DiagramBlockView from '../../../components/editor/nodes/DiagramBlockView';

export interface DiagramNodeAttributes {
  id?: string | null;
  snapshot: string;
  /** Legacy pixel width (kept for backward-compat migration). */
  width: number | null;
  /** Width as a percentage of the editor surface width (0-100). Preferred. */
  widthPct?: number | null;
  height: number | null;
  /** Height as a percentage of the editor surface width (0-100). Preferred. */
  heightPct?: number | null;
  align: 'left' | 'center';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagramBlock: {
      /** Insert a diagram (excalidraw) block. */
      setDiagram: (attrs?: Partial<DiagramNodeAttributes>) => ReturnType;
    };
  }
}

export const DiagramExtension = Node.create({
  name: 'diagramBlock',

  group: 'block',

  atom: true,

  allowGapCursor: false,

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
                height: null,
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
    return ReactNodeViewRenderer(DiagramBlockView);
  },
});

export default DiagramExtension;
