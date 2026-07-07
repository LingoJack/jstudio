import type { SlashCommandItem } from '../types';

/** Image — 图片 */
export const imageCommand: SlashCommandItem = {
  title: '图片',
  description: '插入图片',
  icon: 'IMG',
  aliases: ['image', 'img', 'picture', 'photo'],
  command: ({ editor, range }) => {
    // Insert an empty image node (placeholder). The user clicks the
    // placeholder afterwards to pick a file.
    editor.chain().focus().deleteRange(range).setImage({ src: '' }).run();
  },
};
