/**
 * Headless Markdown → Block[] converter.
 *
 * For the "Import Markdown" file flow there is no active editor instance,
 * so we can't call `editor.markdown.parse()`.  Instead we spin up a
 * lightweight headless Tiptap Editor with the same extensions (including
 * `@tiptap/markdown`), parse the Markdown string into a ProseMirror doc,
 * then reuse the existing `tiptapJSONToOurBlocks()` adapter to produce our
 * native `Block[]`.
 *
 * The headless editor is created once and cached for subsequent imports.
 */

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import { tiptapJSONToOurBlocks } from './tiptapAdapter';
import type { Block } from '../../types';
import type { JSONContent } from '@tiptap/core';

// Lazily-created headless editor used purely for Markdown parsing.
let _headless: Editor | null = null;

function getHeadlessEditor(): Editor {
  if (_headless && !_headless.isDestroyed) return _headless;

  _headless = new Editor({
    // No DOM element — headless mode.
    element: undefined,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        code: false, // replaced by custom Code (see comment in BlockEditor.tsx)
      }),
      Code.extend({ excludes: '' }),
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      // Register TaskList/TaskItem so Markdown task lists (`- [ ] item`) parse
      // into `taskList` nodes instead of being dropped/downgraded to plain
      // bullet lists. Must mirror BlockEditor's config (`nested: true`).
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: true },
      }),
    ],
    content: '',
  });

  return _headless;
}

/**
 * Parse a Markdown string into our native `Block[]` format.
 *
 * Uses a headless Tiptap editor with the `@tiptap/markdown` extension to
 * convert Markdown → ProseMirror doc → our `Block[]`.
 *
 * Returns at least one empty text block if the input produces no content.
 */
export function markdownToBlocks(md: string): Block[] {
  if (!md || !md.trim()) {
    return [{ id: `block-${Date.now()}`, type: 'text', content: [] }];
  }

  const editor = getHeadlessEditor();

  // Parse Markdown → Tiptap JSON document
  editor.commands.setContent(md, { contentType: 'markdown' });
  const json = editor.getJSON();

  // Tiptap JSON → our native Block[]
  // `json.content` is the array of top-level child nodes (doc → blocks).
  const children: JSONContent[] = Array.isArray(json.content)
    ? json.content
    : [];
  return tiptapJSONToOurBlocks(children);
}
