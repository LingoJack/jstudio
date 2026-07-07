import type { SlashCommandItem } from '../types';

/** Numbered List — create a list with numbering. */
export const numberedListCommand: SlashCommandItem = {
  title: 'Numbered List',
  description: 'Create a list with numbering',
  icon: '1.',
  aliases: ['numbered', 'ordered', 'ol', 'number', '有序'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
};
