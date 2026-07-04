/**
 * LinkExtension — custom block node for web link embeds.
 *
 * Supports two display modes (mirroring the File block pattern):
 *   - `card`   — compact bookmark card (title, description, favicon, OG image)
 *   - `preview`— inline web page preview (fetched via Rust proxy with Chrome cookies)
 *
 * Supported attributes:
 *   url         — target URL
 *   title       — page title (from OG/title meta)
 *   description — meta description
 *   favicon     — favicon URL
 *   ogImage     — OpenGraph image URL
 *   siteName    — site name from OG metadata
 *   displayMode — 'card' | 'preview'
 *   width       — display width in px (null = auto)
 *   align       — 'left' | 'center' (default 'center')
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import LinkView from '../../../components/editor/nodes/LinkView';

export interface LinkNodeAttributes {
  url: string;
  title: string;
  description: string;
  favicon: string;
  ogImage: string;
  siteName: string;
  displayMode: 'card' | 'preview';
  /** Legacy pixel width (kept for backward-compat migration). */
  width: number | null;
  /** Width as a percentage of the editor surface width (0-100). Preferred. */
  widthPct?: number | null;
  align: 'left' | 'center';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    linkBlock: {
      /** Insert a link block. */
      insertLinkBlock: (attrs?: Partial<LinkNodeAttributes>) => ReturnType;
    };
  }
}

export const LinkExtension = Node.create({
  name: 'linkBlock',

  group: 'block',

  atom: true,

  draggable: false,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-url') || '',
        renderHTML: (attrs) => {
          if (!attrs.url) return {};
          return { 'data-url': attrs.url };
        },
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') || '',
        renderHTML: (attrs) => {
          if (!attrs.title) return {};
          return { 'data-title': attrs.title };
        },
      },
      description: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-description') || '',
        renderHTML: (attrs) => {
          if (!attrs.description) return {};
          return { 'data-description': attrs.description };
        },
      },
      favicon: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-favicon') || '',
        renderHTML: (attrs) => {
          if (!attrs.favicon) return {};
          return { 'data-favicon': attrs.favicon };
        },
      },
      ogImage: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-og-image') || '',
        renderHTML: (attrs) => {
          if (!attrs.ogImage) return {};
          return { 'data-og-image': attrs.ogImage };
        },
      },
      siteName: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-site-name') || '',
        renderHTML: (attrs) => {
          if (!attrs.siteName) return {};
          return { 'data-site-name': attrs.siteName };
        },
      },
      displayMode: {
        default: 'card' as const,
        parseHTML: (el) => {
          const m = el.getAttribute('data-display-mode');
          return m === 'preview' ? 'preview' : 'card';
        },
        renderHTML: (attrs) => ({
          'data-display-mode': attrs.displayMode ?? 'card',
        }),
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
        tag: 'div[data-type="link-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-type': 'link-block', ...HTMLAttributes },
    ];
  },

  addCommands() {
    return {
      insertLinkBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent([
            {
              type: 'linkBlock',
              attrs: {
                url: '',
                title: '',
                description: '',
                favicon: '',
                ogImage: '',
                siteName: '',
                displayMode: 'card',
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
    return ReactNodeViewRenderer(LinkView);
  },
});

export default LinkExtension;
