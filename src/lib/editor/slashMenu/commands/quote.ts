import type { SlashCommandItem } from '../types';

/** Quote — capture a quote (blockquote). */
export const quoteCommand: SlashCommandItem = {
  title: 'Quote',
  description: 'Capture a quote',
  icon: '❝',
  aliases: ['quote', 'blockquote', '引用'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
};
