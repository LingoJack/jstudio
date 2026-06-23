import type { SlashCommandItem } from '../types';

/** Link — embed a web link with preview. */
export const linkCommand: SlashCommandItem = {
  title: 'Link',
  description: 'Embed a web link with preview',
  icon: 'LINK',
  aliases: ['link', 'url', 'bookmark', 'web', '链接', '网页'],
  command: ({ editor, range }) => {
    // Insert an empty linkBlock node (placeholder). The user pastes a URL
    // in the placeholder input to fetch metadata.
    editor.chain().focus().deleteRange(range).insertLinkBlock().run();
  },
};
