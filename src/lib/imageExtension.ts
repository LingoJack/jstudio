/**
 * ImageExtension — custom Image node with React NodeView.
 *
 * Extends Tiptap's Image by adding an `align` attribute ('left' | 'center')
 * and delegating rendering to the React `ImageView` NodeView component.
 *
 * Supported attributes: src, alt, title, width, height, align.
 */

import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import ImageView from '../components/ImageView';

export interface ImageNodeAttributes {
  src: string;
  alt?: string | null;
  title?: string | null;
  /** Legacy pixel width (kept for backward-compat migration). */
  width?: number | null;
  /** Width as a percentage of the editor surface width (0-100). Preferred. */
  widthPct?: number | null;
  /** Legacy pixel height (kept for backward-compat migration). */
  height?: number | null;
  /** Height as a percentage of the editor surface width (0-100). Preferred. */
  heightPct?: number | null;
  align?: 'left' | 'center' | null;
}

export const ImageExtension = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: '',
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('width');
          return width ? Number(width) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
      widthPct: {
        default: null,
        parseHTML: (element) => {
          const v = element.getAttribute('data-width-pct');
          return v ? Number(v) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.widthPct == null) return {};
          return { 'data-width-pct': attributes.widthPct };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = element.getAttribute('height');
          return height ? Number(height) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        },
      },
      heightPct: {
        default: null,
        parseHTML: (element) => {
          const v = element.getAttribute('data-height-pct');
          return v ? Number(v) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.heightPct == null) return {};
          return { 'data-height-pct': attributes.heightPct };
        },
      },
      align: {
        default: 'center',
        parseHTML: (element) => {
          const align = element.getAttribute('data-align');
          if (align === 'left' || align === 'center') return align;
          return 'center';
        },
        renderHTML: (attributes) => {
          if (!attributes.align) return {};
          return { 'data-align': attributes.align };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

export default ImageExtension;
