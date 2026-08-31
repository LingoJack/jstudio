import { ConnectionConstraint, Point, CellState } from '@maxgraph/core';
import {
  paletteFor,
  getFontColor,
  getEdgeColor,
  getLabelBackgroundColor,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  ARROW_END_SIZE,
} from '../graphTheme';
import { CONNECTION_POINTS } from '../graphConstants';
import { HEAD_HEIGHT } from '../customShapes';
import type { GraphSetupFn } from './types';

export const setupDefaultStyles: GraphSetupFn = (ctx) => {
  const { graph } = ctx;
  const dark = ctx.darkModeRef.current;

  const defaultPal = paletteFor('rectangle', dark);
  const vertexDefault = graph.getStylesheet().getDefaultVertexStyle();
  vertexDefault.fillColor = defaultPal.fill;
  vertexDefault.strokeColor = defaultPal.stroke;
  vertexDefault.fontColor = getFontColor(dark);
  vertexDefault.strokeWidth = SHAPE_STROKE_WIDTH;
  vertexDefault.fontSize = SHAPE_FONT_SIZE;

  // 全局默认走正交连线（飞书手感：圆角折线 + 小箭头），蓝色细线 + 圆点流动。
  const edgeDefault = graph.getStylesheet().getDefaultEdgeStyle();
  edgeDefault.edgeStyle = 'obstacleEdgeStyle';
  edgeDefault.rounded = true;
  edgeDefault.endArrow = 'classic';
  edgeDefault.endSize = ARROW_END_SIZE;
  edgeDefault.strokeColor = getEdgeColor(dark);
  edgeDefault.strokeWidth = SHAPE_STROKE_WIDTH;
  // 边标签：字号 / 字色 / 背景色（与画布底色一致，遮挡标签下方连线，
  // 解决双击边写文字时文字与线重叠、不明显的问题）。
  edgeDefault.fontSize = SHAPE_FONT_SIZE;
  edgeDefault.fontColor = getFontColor(dark);
  edgeDefault.labelBackgroundColor = getLabelBackgroundColor(dark);

  // 为每个节点提供固定连接点：悬停边缘时高亮圆点锚点，
  // 从精确点位拖出连线，而非只能从整体边缘任意点连。
  // 针对时序图生命线/激活框做了专门分布，让消息箭头水平贴合。
  graph.getAllConnectionConstraints = (terminal: CellState | null) => {
    if (!terminal?.cell?.isVertex()) return null;

    const cellStyle = graph.getCellStyle(terminal.cell);
    const shapeStyle = cellStyle?.shape;

    // 时序图生命线 / 用例图角色：
    // 头部矩形保留 4 个中点，供 actor->lifeline 关联使用。
    // 生命线段：给密集锚点（每 10px 一个），让任意 Y 都能拉出消息。
    // 视觉上用 hover 圆点（sequenceInteraction）提示"任意位置可起线"，
    // 密集锚点本身尺寸调小（4px）不显突兀。
    if (shapeStyle === 'lifeline' || shapeStyle === 'umlActor') {
      const nodeHeight = terminal.height ?? 150;
      const constraints: ConnectionConstraint[] = [];
      // 头部矩形连接点：顶部中点、左中、右中、底部中点（头部和生命线段的衔接点）
      constraints.push(new ConnectionConstraint(new Point(0.5, 0), true));
      const headMidY = (HEAD_HEIGHT / 2) / nodeHeight;
      constraints.push(new ConnectionConstraint(new Point(0, headMidY), true));
      constraints.push(new ConnectionConstraint(new Point(1, headMidY), true));
      constraints.push(new ConnectionConstraint(new Point(0.5, HEAD_HEIGHT / nodeHeight), true));

      // 生命线段：每 10px 一个锚点，从头部下方 8px 开始，直到节点底部 8px 前
      const SPACING = 10;
      const startY = HEAD_HEIGHT + 8;
      const endY = nodeHeight - 8;
      for (let absY = startY; absY <= endY; absY += SPACING) {
        constraints.push(new ConnectionConstraint(new Point(0.5, absY / nodeHeight), true));
      }
      return constraints;
    }

    // 时序图激活框：左右边缘密集锚点（每 8px 一个），
    // 让用户可以从活动块任意高度拉出消息线（含返回消息）。
    if (shapeStyle === 'umlActivation') {
      const nodeHeight = terminal.height ?? 40;
      const constraints: ConnectionConstraint[] = [];
      const SPACING = 8;
      for (let absY = 0; absY <= nodeHeight; absY += SPACING) {
        const ry = absY / nodeHeight;
        constraints.push(new ConnectionConstraint(new Point(0, ry), true));
        constraints.push(new ConnectionConstraint(new Point(1, ry), true));
      }
      // 顶部/底部中点
      constraints.push(new ConnectionConstraint(new Point(0.5, 0), true));
      constraints.push(new ConnectionConstraint(new Point(0.5, 1), true));
      return constraints;
    }

    // 普通节点：四边中点连接点
    return CONNECTION_POINTS.map(
      ([x, y]) => new ConnectionConstraint(new Point(x, y), true),
    );
  };
};
