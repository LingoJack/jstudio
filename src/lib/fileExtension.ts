/**
 * FileExtension — custom block node for file attachments.
 *
 * Supports uploading any file type. The React NodeView (`FileView`) renders
 * either a compact card (file name / size / type) or an inline preview
 * (HTML, PDF, DOCX, plain text, images).
 *
 * Supported attributes:
 *   src         — data URL or asset path of the file content
 *   fileName    — original file name
 *   fileSize    — file size in bytes
 *   fileType    — MIME type
 *   displayMode — 'card' | 'preview'
 *   width       — display width in px (null = auto)
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import FileView from '../components/FileView';

export interface FileNodeAttributes {
  src: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  displayMode: 'card' | 'preview';
  width: number | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileBlock: {
      /** Insert a file attachment block. */
      setFile: (attrs?: Partial<FileNodeAttributes>) => ReturnType;
    };
  }
}

export const FileExtension = Node.create({
  name: 'fileBlock',

  group: 'block',

  atom: true,

  draggable: false,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-src') || '',
        renderHTML: (attrs) => {
          if (!attrs.src) return {};
          return { 'data-src': attrs.src };
        },
      },
      fileName: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-file-name') || '',
        renderHTML: (attrs) => {
          if (!attrs.fileName) return {};
          return { 'data-file-name': attrs.fileName };
        },
      },
      fileSize: {
        default: 0,
        parseHTML: (el) => {
          const s = el.getAttribute('data-file-size');
          return s ? Number(s) : 0;
        },
        renderHTML: (attrs) => {
          if (!attrs.fileSize) return {};
          return { 'data-file-size': attrs.fileSize };
        },
      },
      fileType: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-file-type') || '',
        renderHTML: (attrs) => {
          if (!attrs.fileType) return {};
          return { 'data-file-type': attrs.fileType };
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
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-type': 'file-block', ...HTMLAttributes },
    ];
  },

  addCommands() {
    return {
      setFile:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent([
            {
              type: 'fileBlock',
              attrs: {
                src: '',
                fileName: '',
                fileSize: 0,
                fileType: '',
                displayMode: 'card',
                width: null,
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
    return ReactNodeViewRenderer(FileView);
  },
});

export default FileExtension;
