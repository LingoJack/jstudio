import type { SlashCommandItem } from '../types';

/** Link — 网页链接 */
export const linkCommand: SlashCommandItem = {
  title: '链接',
  description: '嵌入网页链接并显示预览',
  icon: 'LINK',
  aliases: ['link', 'url', 'bookmark', 'web', '链接', '网页'],
  command: ({ editor, range }) => {
    // Insert an empty linkBlock node (placeholder). The user pastes a URL
    // in the placeholder input to fetch metadata.
    editor.chain().focus().deleteRange(range).insertLinkBlock().run();
  },
};
