import type { SlashCommandItem } from '../types';

/** Table — 表格 */
export const tableCommand: SlashCommandItem = {
  title: '表格',
  description: '插入可编辑表格',
  icon: '⊞',
  aliases: ['table', 'grid', '矩阵'],
  command: ({ editor, range }) => {
    // Show a Notion-style grid picker so the user can choose dimensions.
    import('../../../../components/editor/nodes/TableSizeSelector').then(({ mountTableSizeSelector }) => {
      mountTableSizeSelector(editor, range);
    });
  },
};
