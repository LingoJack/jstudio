import type { SlashCommandItem } from '../types';

/** Collapsible — 折叠区域 */
export const collapsibleCommand: SlashCommandItem = {
  title: '折叠区域',
  description: '可折叠/展开的内容区域',
  icon: '▼',
  aliases: ['collapsible', 'collapse', 'toggle', 'fold', '折叠', '收起', '展开'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setCollapsible().run(),
};
