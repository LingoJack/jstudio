import type { GraphNodeShape } from './graphSnapshot';
import {
  paletteFor,
  getFontColor,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  SHAPE_ARC_SIZE,
  mindmapStyleForDepth,
  MINDMAP_ARC_SIZE,
  DEFAULT_MINDMAP_SCHEME,
  type MindmapScheme,
} from './graphTheme';

/* ------------------------------------------------------------------ */
/* 默认模具尺寸 —— 对齐 draw.io 出厂默认值                             */
/* ------------------------------------------------------------------ */

const DEFAULT_SIZE: Record<GraphNodeShape, { w: number; h: number }> = {
  rectangle: { w: 120, h: 60 },
  rounded: { w: 120, h: 60 },
  ellipse: { w: 120, h: 80 },
  diamond: { w: 80, h: 80 },
  text: { w: 60, h: 30 },
  actor: { w: 50, h: 150 },      // 小人：宽度 50，高度 150（头部 50 + 生命线 100）
  'swimlane-v': { w: 200, h: 300 },
  'swimlane-h': { w: 300, h: 200 },
  lifeline: { w: 100, h: 150 },   // 生命线：宽度 100，高度 150（头部 50 + 生命线 100）
  activation: { w: 16, h: 60 },
  note: { w: 100, h: 60 },
  database: { w: 120, h: 80 },
  topic: { w: 100, h: 36 },       // 思维导图节点：紧凑圆角矩形
  'edge-line': { w: 100, h: 20 },
  'edge-ortho': { w: 100, h: 20 },
  'edge-dashed': { w: 100, h: 20 },
  'edge-no-arrow': { w: 100, h: 20 },
};

const SHAPE_LABEL: Record<GraphNodeShape, string> = {
  rectangle: '处理',
  rounded: '起止',
  ellipse: '节点',
  diamond: '判定',
  text: '文本',
  actor: '',
  'swimlane-v': '泳道',
  'swimlane-h': '泳道',
  lifeline: '',
  activation: '',
  note: '注释',
  database: '数据库',
  topic: '主题',
  'edge-line': '',
  'edge-ortho': '',
  'edge-dashed': '',
  'edge-no-arrow': '',
};

/**
 * shape → maxGraph 样式对象（白板风格：无填充 + 中性灰描边）。
 * 注意：text 形状无填充无边框。
 *
 * topic 形状可选传入 scheme（默认 'mono'），用于决定根节点配色 + 写入
 * mmScheme/mmBranch/mmDepth 标记，供主题刷新反查。
 */
function styleForShape(
  shape: GraphNodeShape,
  dark: boolean,
  scheme: MindmapScheme = DEFAULT_MINDMAP_SCHEME,
): Record<string, unknown> {
  const pal = paletteFor(shape, dark);
  const base: Record<string, unknown> = {
    fillColor: pal.fill,
    strokeColor: pal.stroke,
    strokeWidth: SHAPE_STROKE_WIDTH,
    fontSize: SHAPE_FONT_SIZE,
    fontColor: getFontColor(dark),
    // 无填充时内部可穿透点击，仅边框可选中/拖动；有填充色时自动失效。
    pointerEvents: false,
  };
  switch (shape) {
    case 'rounded':
      return { ...base, shape: 'rectangle', rounded: true, absoluteArcSize: true, arcSize: SHAPE_ARC_SIZE };
    case 'diamond':
      return { ...base, shape: 'rhombus' };
    case 'ellipse':
      return { ...base, shape: 'ellipse' };
    case 'text':
      return { shape: 'text', fillColor: 'none', strokeColor: 'none', fontColor: getFontColor(dark), fontSize: SHAPE_FONT_SIZE };
    case 'actor':
      // 用例图角色：使用自定义的 umlActor 形状（小人图标 + 生命线）
      // 使用 lifelinePerimeter，连接点只落在中心虚线上
      return { ...base, shape: 'umlActor', perimeter: 'lifelinePerimeter' };
    case 'swimlane-v':
      return { ...base, shape: 'swimlane', swimlaneLine: true, startSize: 30, horizontal: false };
    case 'swimlane-h':
      return { ...base, shape: 'swimlane', swimlaneLine: true, startSize: 30, horizontal: true };
    case 'lifeline':
      // 时序图生命线：使用自定义的 lifeline 形状（矩形头部 + 虚线延伸）
      // 使用 lifelinePerimeter，连接点只落在中心虚线上
      return { ...base, shape: 'lifeline', perimeter: 'lifelinePerimeter' };
    case 'activation':
      // 时序图激活框：使用专用 umlActivation 形状，左右边缘优先连接消息线
      return { ...base, shape: 'umlActivation', perimeter: 'activationPerimeter' };
    case 'note':
      // 注释框：使用自定义 note 形状（右上角折角的便利贴风格）
      return { ...base, shape: 'note' };
    case 'database':
      // 数据库：使用自定义 database 形状（圆柱体）
      return { ...base, shape: 'database' };
    case 'topic':
      // 思维导图根节点：按 scheme 给配色 + 写入 mmScheme/mmBranch/mmDepth 标记。
      // Tab/Enter 生发子节点时由 mindmapSpawn 按 depth 重新配色并更新标记。
      // 通过 isTopic 标记区分（支持 Tab/Enter 生发子节点/兄弟节点）。
      return {
        shape: 'rectangle',
        rounded: true,
        absoluteArcSize: true,
        arcSize: MINDMAP_ARC_SIZE,
        ...mindmapStyleForDepth(0, dark, scheme, 0),
        isTopic: 1,
        mmScheme: scheme,
        mmBranch: 0,
        mmDepth: 0,
      };
    // 连线类型：统一实线 + 圆点流动（流动由 CSS 动画驱动，见 vscode-theme.css）。
    // 箭头 marker 由 ConnectorShape.setDashed(false) 渲染为实线，不受流动影响。
    case 'edge-line':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: 'classic', endSize: 8 };
    case 'edge-ortho':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, edgeStyle: 'obstacleEdgeStyle', endArrow: 'classic', endSize: 8 };
    case 'edge-dashed':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: 'classic', endSize: 8 };
    case 'edge-no-arrow':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: 'none' };
    case 'rectangle':
    default:
      return { ...base, shape: 'rectangle' };
  }
}

/** 网格步长（draw.io 同款 10px）。 */
const GRID_SIZE = 10;

/** 事件容差：鼠标按下后移动超过该值才算"拖动"（拉线/拖节点）。
 *  maxGraph 默认很小导致一碰就触发拉线，调大让按下后小幅抖动不误触。
 *  值越大，越不容易误触发连线；建议 15-20 像素。 */
const EVENT_TOLERANCE = 18;

/** 缩放上下限，防止用户缩到不可用。 */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

/** 拖拽绘制时的最小尺寸（低于此值视为"点击"，用默认尺寸落点）。 */
const MIN_DRAW_SIZE = 12;

/**
 * 连接点：仅保留四边中点（4 个），而非八点。
 * 点位更稀疏 → 悬停时高亮范围更小、更"定点"，降低误触发拉线。
 */
const CONNECTION_POINTS: Array<[number, number]> = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];

export {
  DEFAULT_SIZE,
  SHAPE_LABEL,
  styleForShape,
  GRID_SIZE,
  EVENT_TOLERANCE,
  ZOOM_MIN,
  ZOOM_MAX,
  MIN_DRAW_SIZE,
  CONNECTION_POINTS,
};
