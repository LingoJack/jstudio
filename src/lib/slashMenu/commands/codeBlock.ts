import type { SlashCommandItem } from '../types';

/** Code Block — display formatted code. */
export const codeBlockCommand: SlashCommandItem = {
  title: 'Code Block',
  description: 'Display formatted code',
  icon: '<>',
  aliases: ['code', 'codeblock', 'snippet'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setNode('codeBlock').run(),
};
