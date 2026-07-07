import type { SlashCommandItem } from '../types';

/** Quote — 引用块 */
export const quoteCommand: SlashCommandItem = {
  title: '引用',
  description: '插入引用块',
  icon: '❝',
  aliases: ['quote', 'blockquote', '引用'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
};
