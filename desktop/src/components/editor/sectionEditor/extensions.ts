/**
 * Shared TipTap extension factory for the sectioned editor.
 *
 * Each section of a document gets its own independent TipTap editor
 * instance; this factory ensures every section's extension list is
 * identical so they all behave the same way.
 */

import type { Extensions } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '../../../lib/editor/extensions/imageExtension';
import { FileExtension } from '../../../lib/editor/extensions/fileExtension';
import { LinkExtension } from '../../../lib/editor/extensions/linkExtension';
import { CollapsibleExtension } from '../../../lib/editor/extensions/collapsibleExtension';
import { GapCursorClickFix } from '../../../lib/editor/extensions/gapCursorClickFix';
import { ModClickCaretFix } from '../../../lib/editor/extensions/modClickCaretFix';
import { DiagramExtension } from '../../../lib/editor/extensions/diagramExtension';
import { MathBlockExtension } from '../../../lib/editor/extensions/mathBlockExtension';
import Link from '@tiptap/extension-link';
import { customLinkAutolink } from '../../../lib/editor/extensions/customLinkAutolink';
import { LinkClickOpen } from '../../../lib/editor/extensions/linkClickOpen';
import { TextStyle } from '@tiptap/extension-text-style';
import { CollapsibleTable } from './tableExtension';
import TableRow from '@tiptap/extension-table-row';
import { TableHeaderWithVAlign as TableHeader } from './tableCellExtension';
import { TableCellWithVAlign as TableCell } from './tableCellExtension';
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
import { ListMarkerSelection } from '../../../lib/editor/extensions/listMarkerSelection';
import { SlashMenuExtension } from '../../../lib/editor/slashMenu';
import { BlockNavigation } from '../../../lib/editor/blockNavigation';
import { SectionHighlightSelection } from '../../../lib/editor/extensions/sectionHighlightSelection';
import { SectionSearchHighlight } from '../../../lib/editor/extensions/sectionSearchHighlight';

export interface SectionExtensionOptions {
  placeholder: string;
  /** Whole-document emptiness check (JStudio Block[] perspective), provided
   *  by DocumentPanel. TipTap's own `editor.isEmpty` is per-section and
   *  content-only — it treats a block with an empty body but meaningful
   *  attrs (e.g. a titled but empty code block) as "empty", and knows
   *  nothing about other sections. The placeholder text is only shown when
   *  BOTH this section's PM doc is empty AND this returns true. When
   *  omitted, falls back to the section-local check alone. */
  isDocEmpty?: () => boolean;
  /** Called when the caret exits the top of the first block in this section
   *  (ArrowUp/Left at doc start). The parent uses this to focus the document
   *  title input. */
  onExitToTitle?: () => void;
  /** Whether links should open on click. Used to enable link clicks in
   *  read-only mode. Defaults to false. */
  openOnClick?: boolean;
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
      // Disable TrailingNode: it auto-inserts an empty paragraph at the end of
      // each section via appendTransaction. In the sectioned editor architecture
      // (multiple TipTap instances stacked vertically), this creates undeletable
      // blank lines at section boundaries and gets persisted as spurious empty
      // blocks between headings.
      trailingNode: false,
    }),
    Code.extend({
      excludes: '',
      // Add Cmd/Ctrl+` as an inline code toggle (Markdown code-span mnemonic).
      // The Code extension's default Mod-e is kept via `this.parent?.()` —
      // but on macOS Mod-e is the accent-character dead key, making it nearly
      // unusable, so Mod-` is the practical primary binding.
      addKeyboardShortcuts() {
        return {
          'Mod-`': () => this.editor.commands.toggleCode(),
          ...this.parent?.(),
        };
      },
    }),
    // Strike (strikethrough) comes from StarterKit but the extension does NOT
    // register a default keyboard shortcut. Add Mod-Shift-S here so the
    // reference shortcut (Cmd+Shift+S) actually works. ShortcutManager's
    // FIXED_EDITOR_RESERVED_BINDINGS already reserves this binding for the
    // editor, so it reaches ProseMirror instead of being intercepted globally.
    Extension.create({
      name: 'strikeShortcut',
      addKeyboardShortcuts() {
        return {
          'Mod-Shift-s': () => this.editor.commands.toggleStrike(),
        };
      },
    }),
    CodeBlockWithChrome.configure({
      lowlight,
      defaultLanguage: 'plaintext',
      exitOnTripleEnter: false,
    }),
    // Placeholder text is only meaningful for a genuinely empty document.
    // Gate on both the section-local PM doc (editor.isEmpty) and the whole
    // JStudio document (opts.isDocEmpty) so a titled-but-empty code block
    // (or a lone empty section in a multi-section doc) doesn't trigger it.
    // Returning '' leaves the decoration attribute empty → CSS renders
    // nothing.
    Placeholder.configure({
      placeholder: ({ editor }) =>
        editor.isEmpty && (opts.isDocEmpty?.() ?? true) ? opts.placeholder : '',
    }),
    Image.configure({ inline: false, allowBase64: true }),
    FileExtension,
    LinkExtension,
    CollapsibleExtension,
    GapCursorClickFix,
    ModClickCaretFix,
    DiagramExtension,
    MathBlockExtension,
    Link.extend({
      addProseMirrorPlugins() {
        return [
          customLinkAutolink({
            type: this.type,
            defaultProtocol: 'https',
          }),
        ];
      },
    }).configure({ openOnClick: opts.openOnClick ?? false, autolink: false }),
    // NOTE: `Underline` comes from StarterKit v3 — do not re-add it.
    TextStyle,
    Color,
    CollapsibleTable.configure({ resizable: true, cellMinWidth: 100 }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    TaskListMarkdown,
    ListMarkerSelection,
    TextAlign.configure({ types: ['paragraph', 'heading', 'blockquote'] }),
    BlockIdExtension,
    SelectAllText,
    ImeCapsLockFix,
    SlashMenuExtension,
    BlockNavigation.configure({
      onExitToTitle: opts.onExitToTitle,
    }),
    SectionHighlightSelection,
    SectionSearchHighlight,
    LinkClickOpen,
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
  ];
}
