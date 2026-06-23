import type { SlashCommandItem } from '../types';

/** Image — insert an image placeholder. */
export const imageCommand: SlashCommandItem = {
  title: 'Image',
  description: 'Insert image placeholder',
  icon: 'IMG',
  aliases: ['image', 'img', 'picture', 'photo'],
  command: ({ editor, range }) => {
    // Insert an empty image node (placeholder). The user clicks the
    // placeholder afterwards to pick a file.
    editor.chain().focus().deleteRange(range).setImage({ src: '' }).run();
  },
};
