import type { SlashCommandItem } from '../types';

/** Heading 4 - smaller section heading. */
export const heading4Command: SlashCommandItem = {
  title: 'Heading 4',
  description: 'Smaller section heading',
  icon: 'H4',
  aliases: ['heading4', 'h4'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('heading', { level: 4 }).run(),
};
