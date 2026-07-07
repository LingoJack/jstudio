import type { SlashCommandItem } from '../types';

/** Divider — 分割线 */
export const dividerCommand: SlashCommandItem = {
  title: '分割线',
  description: '插入水平分割线',
  icon: '—',
  aliases: ['divider', 'separator', 'horizontal', 'hr', '分割线', '分隔线'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
};
