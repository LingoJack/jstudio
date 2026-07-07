import type { SlashCommandItem } from '../types';

/** To-do List — 待办列表 */
export const todoListCommand: SlashCommandItem = {
  title: '待办列表',
  description: '带复选框的待办列表',
  icon: '☐',
  aliases: ['todo', 'task', 'checklist', 'checkbox', '待办', '清单', '任务'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).toggleTaskList().run(),
};
