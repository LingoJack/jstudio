import type { SlashCommandItem } from '../types';

/** Bullet List — 创建无序列表 */
export const bulletListCommand: SlashCommandItem = {
  title: '无序列表',
  description: '创建无序列表',
  icon: '• —',
  aliases: ['bullet', 'ul', 'unordered', 'unorder', 'list', '无序'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).toggleBulletList().run(),
};
