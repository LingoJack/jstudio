import type { SlashCommandItem } from '../types';

/** Heading 6 - smallest section heading. */
export const heading6Command: SlashCommandItem = {
  title: 'Heading 6',
  description: 'Smallest section heading',
  icon: 'H6',
  aliases: ['heading6', 'h6'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('heading', { level: 6 }).run(),
};
