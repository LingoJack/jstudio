import type { SlashCommandItem } from '../types';

/** Bullet List — create a simple bulleted list. */
export const bulletListCommand: SlashCommandItem = {
  title: 'Bullet List',
  description: 'Create a simple bulleted list',
  icon: '• —',
  aliases: ['bullet', 'ul', 'unordered', 'unorder', 'list', '无序'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).toggleBulletList().run(),
};
