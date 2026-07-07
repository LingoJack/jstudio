import type { SlashCommandItem } from '../types';

/** Heading 3 — small section heading. */
export const heading3Command: SlashCommandItem = {
  title: 'Heading 3',
  description: 'Small section heading',
  icon: 'H3',
  aliases: ['heading3', 'h3'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
};
