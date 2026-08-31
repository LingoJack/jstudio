import type { SlashCommandItem } from '../types';

/** Collapsible — a foldable / expandable content region. */
export const collapsibleCommand: SlashCommandItem = {
  title: 'Collapsible',
  description: 'A foldable / expandable content region',
  icon: '▼',
  aliases: ['collapsible', 'collapse', 'toggle', 'fold', '折叠', '收起', '展开'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setCollapsible().run(),
};
