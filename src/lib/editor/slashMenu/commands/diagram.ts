import type { SlashCommandItem } from '../types';

/** Diagram — 图表 */
export const diagramCommand: SlashCommandItem = {
  title: '图表',
  description: '绘制架构图、流程图、需求图',
  icon: '▦',
  aliases: ['diagram', 'draw', 'excalidraw', '画板', '架构图', '流程图', '需求图', '白板'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setDiagram().run(),
};
