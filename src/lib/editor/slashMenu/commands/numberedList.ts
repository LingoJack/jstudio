import type { SlashCommandItem } from '../types';

/** Numbered List — 创建有序列表 */
export const numberedListCommand: SlashCommandItem = {
  title: '有序列表',
  description: '创建有序列表',
  icon: '1.',
  aliases: ['numbered', 'ordered', 'ol', 'number', '有序'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
};
