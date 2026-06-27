import type { SlashCommandItem } from '../types';

/** To-do List — track tasks with a checkbox list. */
export const todoListCommand: SlashCommandItem = {
  title: 'To-do List',
  description: 'Track tasks with a checkbox list',
  icon: '☐',
  aliases: ['todo', 'task', 'checklist', 'checkbox', '待办', '清单', '任务'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).toggleTaskList().run(),
};
