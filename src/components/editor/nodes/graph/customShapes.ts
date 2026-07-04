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
  type Point,
} from '@maxgraph/core';

/** 头部固定高度 —— 与 lifeline 协调一致
 *  50px 足够容纳小人图标（头+身体+手臂+腿）
 */
export const HEAD_HEIGHT = 50;

/**
 * 生命线连接点计算函数
 *
 * 与普通矩形不同，生命线的连接点只落在中心虚线上（一条垂直线）。
 * 这样时序图的消息线会水平连接到生命线的中心，符合 UML 规范。
 *
 * 原理：
 * - 连接点的 x 坐标始终是中心线位置
 * - 连接点的 y 坐标根据连线方向动态计算，落在 [headHeight, bounds.height] 范围内
 * - 通过 getAllConnectionConstraints 提供多个等间距连接点（每 20px 一个），
 *   用户可以从生命线上的任意位置拉线连接到其他生命线
 */
export const LifelinePerimeter = (bounds: Rectangle, _vertex: CellState, next: Point, _orthogonal = false) => {
  // 中心线 x 坐标
  const cx = bounds.getCenterX();
  
  // 生命线有效范围：从头部底部到节点底部
  const lineTop = bounds.y + HEAD_HEIGHT;
  const lineBottom = bounds.y + bounds.height;
  
  // y 坐标根据 next 点（连线方向参考）计算，限制在生命线范围内
  let y = next.y;
  if (y < lineTop) {
    y = lineTop;
  } else if (y > lineBottom) {
    y = lineBottom;
  }
  
  // 正交模式下，如果 next.x 在节点范围内，使用 next.x 作为 x 坐标
  // 但生命线的连接点始终在中心线上，所以这里忽略 orthogonal 的 x 调整
  
  return new Point(cx, y);
};

/**
 * 用例图角色形状（小人图标 + 底部生命线）
 * 绘制：头（圆）+ 身体（线）+ 手臂（线）+ 腿（线）+ 底部虚线延伸（生命线）
 * 
 * 头部高度固定 50px，用户调整高度只影响生命线长度。
 */
class UMLActorShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number): void {
    // 头部高度固定 50px，与 lifeline 协调
    const headH = HEAD_HEIGHT;
    const cx = x + w / 2;

    // 头部：圆，直径约 18px
    const headD = 18;
    const headR = headD / 2;
    const headX = cx - headR;
    const headY = y + 2;

    // 绘制头部圆
    c.ellipse(headX, headY, headD, headD);
    c.fillAndStroke();

    // 身体起点（头部下方）和终点（腰部）
    const bodyTop = headY + headD;
    const bodyMid = y + headH * 0.55;  // 腰部位置

    // 身体竖线
    c.begin();
    c.moveTo(cx, bodyTop);
    c.lineTo(cx, bodyMid);
    c.stroke();

    // 手臂：水平横线，在身体 1/3 处
    const armY = bodyTop + (bodyMid - bodyTop) * 0.3;
    c.begin();
    c.moveTo(x + 4, armY);
    c.lineTo(x + w - 4, armY);
    c.stroke();

    // 腿：V 形，从腰部向下延伸到头部底部
    c.begin();
    c.moveTo(cx, bodyMid);
    c.lineTo(x + 4, y + headH - 4);
    c.stroke();
    
    c.begin();
    c.moveTo(cx, bodyMid);
    c.lineTo(x + w - 4, y + headH - 4);
    c.stroke();

    // 底部生命线（虚线延伸）
    c.setDashed(true);
    const lifelineTop = y + headH;
    const lifelineBottom = y + h;
    c.begin();
    c.moveTo(cx, lifelineTop);
    c.lineTo(cx, lifelineBottom);
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
  ShapeRegistry.add('note', NoteShape);

  // 注册生命线连接点计算函数
  PerimeterRegistry.add('lifelinePerimeter', LifelinePerimeter);
}

export { UMLActorShape, LifelineShape, NoteShape };