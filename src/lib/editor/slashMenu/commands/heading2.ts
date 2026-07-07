import type { SlashCommandItem } from '../types';

/** Heading 2 — 中标题 */
export const heading2Command: SlashCommandItem = {
  title: '标题 2',
  description: '中标题',
  icon: 'H2',
  aliases: ['heading2', 'h2'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
};
