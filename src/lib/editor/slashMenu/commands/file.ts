import type { SlashCommandItem } from '../types';

/** File — 文件附件 */
export const fileCommand: SlashCommandItem = {
  title: '文件',
  description: '上传文件附件',
  icon: 'FILE',
  aliases: ['file', 'attachment', 'upload', 'doc', 'pdf', 'document'],
  command: ({ editor, range }) => {
    // Insert an empty fileBlock node (placeholder). The user clicks the
    // placeholder afterwards to pick a file.
    editor.chain().focus().deleteRange(range).setFile().run();
  },
};
