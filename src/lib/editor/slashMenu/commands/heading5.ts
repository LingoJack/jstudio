import type { SlashCommandItem } from '../types';

/** Heading 5 - minor section heading. */
export const heading5Command: SlashCommandItem = {
  title: 'Heading 5',
  description: 'Minor section heading',
  icon: 'H5',
  aliases: ['heading5', 'h5'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('heading', { level: 5 }).run(),
};
