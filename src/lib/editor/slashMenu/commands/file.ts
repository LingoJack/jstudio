import type { SlashCommandItem } from '../types';

/** File — upload a file attachment. */
export const fileCommand: SlashCommandItem = {
  title: 'File',
  description: 'Upload a file attachment',
  icon: 'FILE',
  aliases: ['file', 'attachment', 'upload', 'doc', 'pdf', 'document'],
  command: ({ editor, range }) => {
    // Insert an empty fileBlock node (placeholder). The user clicks the
    // placeholder afterwards to pick a file.
    editor.chain().focus().deleteRange(range).setFile().run();
  },
};
