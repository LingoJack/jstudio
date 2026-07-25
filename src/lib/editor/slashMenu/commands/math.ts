import type { SlashCommandItem } from '../types';

/** Formula - insert a LaTeX math formula block. */
export const mathCommand: SlashCommandItem = {
  title: 'Formula',
  description: 'Insert a LaTeX math formula',
  icon: '∑',
  aliases: ['formula', 'math', 'equation', 'latex', 'katex', '公式', '数学', '方程', '公式块'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setMathBlock().run(),
};
