import type { SlashCommandItem } from '../types';

/** Diagram — draw architecture, flow, or requirement diagrams. */
export const diagramCommand: SlashCommandItem = {
  title: 'Diagram',
  description: '绘制架构图、流程图、需求图',
  icon: '▦',
  aliases: ['diagram', 'draw', 'excalidraw', '画板', '架构图', '流程图', '需求图', '白板'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setDiagram().run(),
};
