import type { SlashCommandItem } from '../types';

/** Code Block — 代码块 */
export const codeBlockCommand: SlashCommandItem = {
  title: '代码块',
  description: '插入格式化代码块',
  icon: '<>',
  aliases: ['code', 'codeblock', 'snippet'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('codeBlock').run(),
};
