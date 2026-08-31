import type { SlashCommandItem } from '../types';

/** Table — insert an editable table via a grid picker. */
export const tableCommand: SlashCommandItem = {
  title: 'Table',
  description: 'Insert an editable table',
  icon: '⊞',
  aliases: ['table', 'grid', '矩阵'],
  command: ({ editor, range }) => {
    // Show a Notion-style grid picker so the user can choose dimensions.
    import('../../../../components/editor/nodes/TableSizeSelector').then(({ mountTableSizeSelector }) => {
      mountTableSizeSelector(editor, range);
    });
  },
};
