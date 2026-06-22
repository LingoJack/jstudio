/**
 * HelpSection — rendered as a read-only JStudio document.
 *
 * Instead of hand-writing HTML, we define the help content as a `Block[]`
 * (the exact same data model as any user-created document) in
 * `data/helpDocument.ts`, then render it with a TipTap editor in read-only
 * mode. This guarantees visual 100% parity with a real document.
 */

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TextAlign from '@tiptap/extension-text-align';
import { Markdown } from '@tiptap/markdown';
import Color from '@tiptap/extension-color';

import { ourBlocksToTiptapJSON } from '../../lib/tiptapAdapter';
import { CodeBlockWithChrome } from '../../lib/codeBlockExtension';
import { BlockIdExtension } from '../../lib/blockIdExtension';
import { lowlight } from '../../lib/extensions/lowlight';
import { getHelpBlocks } from '../../data/helpDocument';
import { useI18n } from '../../lib/i18n';

export default function HelpSection() {
  const { t } = useI18n();

  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        code: false,
      }),
      Code.extend({ excludes: '' }),
      CodeBlockWithChrome.configure({
        lowlight,
        defaultLanguage: 'plaintext',
        exitOnTripleEnter: false,
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Underline,
      TextStyle,
      Color,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({
        types: ['paragraph', 'heading', 'blockquote'],
      }),
      BlockIdExtension,
      Markdown.configure({
        markedOptions: { gfm: true, breaks: true },
      }),
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: {
        class: 'help-doc max-w-none',
        style: 'outline: none',
      },
    },
  });

  // Load the help content once the editor is ready
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!editor || loadedRef.current) return;
    loadedRef.current = true;

    const blocks = getHelpBlocks();
    const tiptapContent = ourBlocksToTiptapJSON(blocks);
    editor.commands.setContent(tiptapContent);

    // Inject anchor IDs onto <h2> headings so Settings sidebar nav works.
    // Map heading text → anchor id (must match Settings.tsx subItems).
    const anchorMap: Record<string, string> = {
      编辑器与块: 'settings-help-editor',
      终端: 'settings-help-terminal',
      快速上手: 'settings-help-quickstart',
      数据与存储: 'settings-help-storage',
      常见问题: 'settings-help-faq',
    };
    requestAnimationFrame(() => {
      const headings = editor.view.dom.querySelectorAll('h2');
      headings.forEach((h2) => {
        const text = h2.textContent?.trim() ?? '';
        const anchorId = anchorMap[text];
        if (anchorId) {
          h2.id = anchorId;
          h2.classList.add('scroll-mt-8');
        }
      });
    });
  }, [editor]);

  return (
    <div className="select-text">
      {/* Read-only badge */}
      <div className="flex justify-end mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-yellow)]" />
          只读文档
        </span>
      </div>

      {/* Document Title (static, not editable) */}
      <div className="pb-4">
        <h1 className="text-4xl font-bold text-[var(--vscode-editor-foreground)] pb-1">
          {t('about.helpGuide')}
        </h1>
      </div>

      {/* TipTap Editor (read-only) */}
      <div className="tiptap-editor-container min-h-[50vh]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
