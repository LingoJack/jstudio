/**
 * Shared TipTap extension factory for the SECTIONED editor POC.
 *
 * This deliberately MIRRORS the extension list in EditorPanel.tsx so each
 * section's independent editor behaves identically to the monolithic editor.
 * It is duplicated (rather than refactored out of EditorPanel) on purpose:
 * the POC must leave EditorPanel 100% untouched so we can A/B toggle and roll
 * back instantly.
 *
 * If the sectioned approach proves out, this becomes the single source of
 * truth and EditorPanel is migrated to use it too.
 */

import type { Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '../../../lib/editor/extensions/imageExtension';
import { FileExtension } from '../../../lib/editor/extensions/fileExtension';
import { LinkExtension } from '../../../lib/editor/extensions/linkExtension';
import { CollapsibleExtension } from '../../../lib/editor/extensions/collapsibleExtension';
import { DiagramExtension } from '../../../lib/editor/extensions/diagramExtension';
import Link from '@tiptap/extension-link';
import { customLinkAutolink } from '../../../lib/editor/extensions/customLinkAutolink';
import { TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TextAlign from '@tiptap/extension-text-align';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import Color from '@tiptap/extension-color';

import { CodeBlockWithChrome } from '../../../lib/editor/extensions/codeBlockExtension';
import { BlockIdExtension } from '../../../lib/editor/extensions/blockIdExtension';
import { lowlight } from '../../../lib/editor/extensions/lowlight';
import { SelectAllText } from '../../../lib/editor/extensions/selectAllText';
import { ImeCapsLockFix } from '../../../lib/editor/extensions/imeCapsLockFix';
import { TaskListMarkdown } from '../../../lib/editor/extensions/taskListMarkdown';
import { SlashMenuExtension } from '../../../lib/editor/slashMenu';
import { BlockNavigation } from '../../../lib/editor/blockNavigation';
import { SectionHighlightSelection } from '../../../lib/editor/extensions/sectionHighlightSelection';

export interface SectionExtensionOptions {
  placeholder: string;
  /** Called when the caret exits the top of the first block in this section
   *  (ArrowUp/Left at doc start). The parent uses this to focus the document
   *  title input. */
  onExitToTitle?: () => void;
}

export function createSectionExtensions(
  opts: SectionExtensionOptions,
): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      code: false,
      // StarterKit v3 bundles `Link` + `Underline`; disable StarterKit's link
      // (we configure our own below) and let StarterKit provide Underline.
      link: false,
    }),
    Code.extend({ excludes: '' }),
    CodeBlockWithChrome.configure({
      lowlight,
      defaultLanguage: 'plaintext',
      exitOnTripleEnter: false,
    }),
    Placeholder.configure({ placeholder: opts.placeholder }),
    Image.configure({ inline: false, allowBase64: true }),
    FileExtension,
    LinkExtension,
    CollapsibleExtension,
    DiagramExtension,
    Link.extend({
      addProseMirrorPlugins() {
        return [
          customLinkAutolink({
            type: this.type,
            defaultProtocol: 'https',
          }),
        ];
      },
    }).configure({ openOnClick: false, autolink: false }),
    // NOTE: `Underline` comes from StarterKit v3 — do not re-add it.
    TextStyle,
    Color,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    TaskListMarkdown,
    TextAlign.configure({ types: ['paragraph', 'heading', 'blockquote'] }),
    BlockIdExtension,
    SelectAllText,
    ImeCapsLockFix,
    SlashMenuExtension,
    BlockNavigation.configure({
      onExitToTitle: opts.onExitToTitle,
    }),
    SectionHighlightSelection,
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
  ];
}
