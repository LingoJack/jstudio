import type { SlashCommandItem } from '../types';

/** Heading 1 — big section heading. */
export const heading1Command: SlashCommandItem = {
  title: 'Heading 1',
  description: 'Big section heading',
  icon: 'H1',
  aliases: ['heading', 'h1', 'heading1'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
};
