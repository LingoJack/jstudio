import type { SlashCommandItem } from '../types';

/** Heading 1 — 大标题 */
export const heading1Command: SlashCommandItem = {
  title: '标题 1',
  description: '大标题',
  icon: 'H1',
  aliases: ['heading', 'h1', 'heading1'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
};
