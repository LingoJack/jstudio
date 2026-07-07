import type { SlashCommandItem } from '../types';

/** Heading 3 — 小标题 */
export const heading3Command: SlashCommandItem = {
  title: '标题 3',
  description: '小标题',
  icon: 'H3',
  aliases: ['heading3', 'h3'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
};
