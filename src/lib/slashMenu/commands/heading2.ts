import type { SlashCommandItem } from '../types';

/** Heading 2 — medium section heading. */
export const heading2Command: SlashCommandItem = {
  title: 'Heading 2',
  description: 'Medium section heading',
  icon: 'H2',
  aliases: ['heading2', 'h2'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
};
