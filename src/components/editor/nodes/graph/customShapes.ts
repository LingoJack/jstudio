/**
 * 自定义形状：用于用例图、时序图等 UML 图表
 *
 * maxGraph 内置的 `actor` 形状是云朵/气泡，不是用例图的"小人"。
 * 这里自定义：
 * - `umlActor` - 用例图角色（小人图标）
 * - `lifeline` - 时序图生命线（矩形头部 + 底部虚线延伸）
 * - `LifelinePerimeter` - 生命线连接点计算（只在中心虚线上）
 */

import {
  Shape,
  ShapeRegistry,
  PerimeterRegistry,
  Point,
  type AbstractCanvas2D,
  type Rectangle,
  type CellState,
} from '@maxgraph/core';

/** 头部固定高度 —— 与 lifeline 协调一致
 *  50px 足够容纳小人图标（头+身体+手臂+腿）
 */
export const HEAD_HEIGHT = 50;

/**
 * 生命线连接点计算函数
 *
 * 连接点分两段处理：
 *
 * 1. 头部矩形区域（y < bounds.y + HEAD_HEIGHT）：
 *    "服务"/"参与者"块本身也要能被连接（创建消息、外部引用等）。
 *    按 next 点相对头部矩形的方向，投影到头部框最近的边（上/下/左/右），
 *    让连线端点落在头部框边缘而非强制到中心线底部。
 *
 * 2. 头部下方的虚线生命线区域：
 *    连接点 x 始终为中心线，y 限制在 [headHeight, bounds.height] 内。
 *    时序图的消息线会水平连接到生命线中心，符合 UML 规范。
 *
 * 配合 getAllConnectionConstraints：头部矩形提供四边中点连接点，
 * 生命线提供中心垂直线等间距连接点（每 40px 一个）。
 */
export const LifelinePerimeter = (bounds: Rectangle, _vertex: CellState, next: Point, _orthogonal = false) => {
  const cx = bounds.getCenterX();
  const headH = HEAD_HEIGHT;
  const lineTop = bounds.y + headH;
  const lineBottom = bounds.y + bounds.height;

  // 头部矩形区域：投影到头部框最近边，让"服务"块可被连接到任意边
  if (next.y < lineTop) {
    const headLeft = bounds.x;
    const headRight = bounds.x + bounds.width;
    const headTop = bounds.y;
    const headBottom = lineTop;
    const clampX = (v: number) => Math.max(headLeft, Math.min(headRight, v));
    const clampY = (v: number) => Math.max(headTop, Math.min(headBottom, v));
    // 取 next 到头部矩形四边的最近距离，投影到该边
    const dTop = Math.abs(next.y - headTop);
    const dBottom = Math.abs(next.y - headBottom);
    const dLeft = Math.abs(next.x - headLeft);
    const dRight = Math.abs(next.x - headRight);
    const minDist = Math.min(dTop, dBottom, dLeft, dRight);
    if (minDist === dTop) return new Point(clampX(next.x), headTop);
    if (minDist === dBottom) return new Point(clampX(next.x), headBottom);
    if (minDist === dLeft) return new Point(headLeft, clampY(next.y));
    return new Point(headRight, clampY(next.y));
  }

  // 生命线区域：连接点固定在中心线上，y 限制在生命线范围内
  let y = next.y;
  if (y < lineTop) {
    y = lineTop;
  } else if (y > lineBottom) {
    y = lineBottom;
  }
  return new Point(cx, y);
};

/**
 * 时序图激活框连接点计算函数
 *
 * 激活框是贴在生命线上的窄矩形，UML 时序图的消息箭头主要水平出入其左右边缘，
 * 开始/结束激活时也会连接到上下边缘。因此 perimeter 将连接点投影到矩形边界：
 *
 * - 若 next 靠近左/右边界，投影到对应垂直边（水平消息）。
 * - 若 next 靠近上/下边界，投影到对应水平边（激活开始/结束）。
 * - 其余情况按 x 位置默认落到左/右边缘，保证消息箭头优先水平。
 */
export const ActivationPerimeter = (bounds: Rectangle, _vertex: CellState, next: Point, _orthogonal = false) => {
  const tolerance = 2;
  const clampX = (v: number) => Math.max(bounds.x, Math.min(bounds.x + bounds.width, v));
  const clampY = (v: number) => Math.max(bounds.y, Math.min(bounds.y + bounds.height, v));

  const nearLeft = Math.abs(next.x - bounds.x) <= tolerance;
  const nearRight = Math.abs(next.x - (bounds.x + bounds.width)) <= tolerance;
  const nearTop = Math.abs(next.y - bounds.y) <= tolerance;
  const nearBottom = Math.abs(next.y - (bounds.y + bounds.height)) <= tolerance;

  if (nearLeft) return new Point(bounds.x, clampY(next.y));
  if (nearRight) return new Point(bounds.x + bounds.width, clampY(next.y));
  if (nearTop) return new Point(clampX(next.x), bounds.y);
  if (nearBottom) return new Point(clampX(next.x), bounds.y + bounds.height);

  // 默认按 x 位置投影到左或右边缘，让水平消息箭头自然贴合
  const x = next.x < bounds.getCenterX() ? bounds.x : bounds.x + bounds.width;
  return new Point(x, clampY(next.y));
};

/**
 * 用例图角色形状（小人图标 + 底部生命线）
 * 绘制：头（圆）+ 身体（线）+ 手臂（线）+ 腿（线）+ 底部虚线延伸（生命线）
 * 
 * 头部高度固定 50px，用户调整高度只影响生命线长度。
 */
class UMLActorShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number): void {
    // 头部高度固定 50px，与工具栏 actor 图标保持同比例
    // 工具栏图标 viewBox 为 16x20，因此按 headH / 20 缩放后居中绘制
    const headH = HEAD_HEIGHT;
    const scale = headH / 20;
    const iconW = 16 * scale;
    const ox = x + (w - iconW) / 2;
    const oy = y;

    // 四肢交汇处用圆角线帽，避免生硬十字
    c.setLineCap('round');
    c.setLineJoin('round');

    // 头部：圆，(8, 3.5), r=3
    const headR = 3 * scale;
    c.ellipse(ox + 8 * scale - headR, oy + 3.5 * scale - headR, headR * 2, headR * 2);
    c.fillAndStroke();

    // 身体：竖线 (8,7) -> (8,11)
    c.begin();
    c.moveTo(ox + 8 * scale, oy + 7 * scale);
    c.lineTo(ox + 8 * scale, oy + 11 * scale);
    c.stroke();

    // 手臂：从身体中点向两侧略向下倾斜 (8,8) -> (3,10) / (13,10)
    c.begin();
    c.moveTo(ox + 8 * scale, oy + 8 * scale);
    c.lineTo(ox + 3 * scale, oy + 10 * scale);
    c.stroke();

    c.begin();
    c.moveTo(ox + 8 * scale, oy + 8 * scale);
    c.lineTo(ox + 13 * scale, oy + 10 * scale);
    c.stroke();

    // 腿：从身体底部向两侧下方 (8,11) -> (4,17) / (12,17)
    c.begin();
    c.moveTo(ox + 8 * scale, oy + 11 * scale);
    c.lineTo(ox + 4 * scale, oy + 17 * scale);
    c.stroke();

    c.begin();
    c.moveTo(ox + 8 * scale, oy + 11 * scale);
    c.lineTo(ox + 12 * scale, oy + 17 * scale);
    c.stroke();

    // 恢复默认线帽，避免影响底部生命线
    c.setLineCap('flat');
    c.setLineJoin('miter');

    // 底部生命线（虚线延伸）
    c.setDashed(true);
    c.begin();
    c.moveTo(ox + 8 * scale, y + headH);
    c.lineTo(ox + 8 * scale, y + h);
    c.stroke();
    c.setDashed(false);
  }
}

/**
 * 时序图生命线形状
 * 绘制：矩形头部框 + 底部延伸的虚线（表示对象存在时间）
 * 
 * 头部高度固定 50px，用户调整高度只影响生命线长度。
 */
class LifelineShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number): void {
    // 头部矩形（圆角），高度固定 50px
    const headH = HEAD_HEIGHT;
    const arc = 8;

    // 绘制头部圆角矩形
    c.roundrect(x, y, w, headH, arc, arc);
    c.fillAndStroke();

    // 底部虚线延伸（生命线）
    c.setDashed(true);
    const lineX = x + w / 2;
    const lineTop = y + headH;
    const lineBottom = y + h;
    c.begin();
    c.moveTo(lineX, lineTop);
    c.lineTo(lineX, lineBottom);
    c.stroke();
    c.setDashed(false);
  }
}

/**
 * 时序图激活框形状
 * 绘制：实心填充的窄高矩形，贴在生命线上表示对象处于激活状态。
 * 填充色/描边色由 graphTheme 的 activation 配色控制，使其在深浅主题下都可见。
 */
class ActivationShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number): void {
    c.rect(x, y, w, h);
    c.fillAndStroke();
  }
}

/**
 * 注释框形状（便利贴风格）
 * 绘制：矩形 + 右上角折角（像便利贴被折起一角的效果）
 * 
 * 形状轮廓：
 *   左上角 → 顶边 → 折角起点 → 折角顶点 → 折角终点 → 右边 → 底边 → 左边 → 闭合
 * 
 * 折角大小约为宽度的 15%，高度按比例但最小 8px
 */
class NoteShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number): void {
    // 折角尺寸：宽度 15%，高度按比例但最小 8px
    const foldW = Math.max(8, w * 0.15);
    const foldH = Math.max(8, h * 0.12);
    
    // 绘制主体轮廓（带折角）
    c.begin();
    // 左上角
    c.moveTo(x, y);
    // 顶边 → 折角起点
    c.lineTo(x + w - foldW, y);
    // 折角顶点（右上角的折痕交点）
    c.lineTo(x + w, y + foldH);
    // 右边
    c.lineTo(x + w, y + h);
    // 底边
    c.lineTo(x, y + h);
    // 左边（闭合）
    c.lineTo(x, y);
    c.close();
    c.fillAndStroke();
    
    // 绘制折角线（折痕）
    c.begin();
    c.moveTo(x + w - foldW, y);
    c.lineTo(x + w - foldW, y + foldH);
    c.lineTo(x + w, y + foldH);
    c.stroke();
  }
}

/**
 * 注册自定义形状和连接点到全局 Registry
 */
export function registerCustomShapes(): void {
  // 注册形状
  ShapeRegistry.add('umlActor', UMLActorShape);
  ShapeRegistry.add('lifeline', LifelineShape);
  ShapeRegistry.add('umlActivation', ActivationShape);
  ShapeRegistry.add('note', NoteShape);

  // 注册连接点计算函数
  PerimeterRegistry.add('lifelinePerimeter', LifelinePerimeter);
  PerimeterRegistry.add('activationPerimeter', ActivationPerimeter);
}

export { UMLActorShape, LifelineShape, ActivationShape, NoteShape };