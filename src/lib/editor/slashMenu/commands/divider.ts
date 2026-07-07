import type { SlashCommandItem } from '../types';

/** Divider — visual separator between blocks. */
export const dividerCommand: SlashCommandItem = {
  title: 'Divider',
  description: 'Visual separator between blocks',
  icon: '—',
  aliases: ['divider', 'separator', 'horizontal', 'hr', '分割线', '分隔线'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
};
