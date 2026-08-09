/**
 * Shape menu definitions for the GraphCanvas toolbar.
 *
 * Extracted as static data so the toolbar component can import it
 * without pulling in the entire GraphCanvas module.
 */

import type { GraphNodeShape } from './graphSnapshot';

export interface ShapeGroup {
  label: string;
  shapes: { shape: GraphNodeShape; title: string }[];
}

export const shapeGroups: ShapeGroup[] = [
  {
    label: '基础图形',
    shapes: [
      { shape: 'rectangle', title: '矩形' },
      { shape: 'rounded', title: '圆角矩形' },
      { shape: 'ellipse', title: '椭圆' },
      { shape: 'diamond', title: '菱形' },
      { shape: 'text', title: '文本' },
      { shape: 'note', title: '注释框' },
      { shape: 'database', title: '数据库' },
    ],
  },
  {
    label: '思维导图',
    shapes: [
      { shape: 'topic', title: '主题节点' },
    ],
  },
  {
    label: '泳道图',
    shapes: [
      { shape: 'swimlane-v', title: '垂直泳道' },
      { shape: 'swimlane-h', title: '水平泳道' },
    ],
  },
  {
    label: '时序图',
    shapes: [
      { shape: 'lifeline', title: '生命线' },
      { shape: 'actor', title: '角色' },
    ],
  },
  // activation 已从工具栏移除：手绘时序图时，从 lifelineA 拖消息到 lifelineB
  // 会自动在 B 上生成 activation（可用工具栏开关关闭）。shape 定义保留（AI 生成和旧数据仍能用）。
];

/** 形状 -> 中文标题 的扁平查找表，供 LRU 队列渲染标题用。 */
export const shapeTitleMap: Map<GraphNodeShape, string> = new Map(
  shapeGroups.flatMap((g) => g.shapes.map((s) => [s.shape, s.title] as const)),
);
