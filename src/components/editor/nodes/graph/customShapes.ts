/**
 * 自定义形状：用于用例图、时序图等 UML 图表
 *
 * maxGraph 内置的 `actor` 形状是云朵/气泡，不是用例图的"小人"。
 * 这里自定义：
 * - `umlActor` - 用例图角色（小人图标）
 * - `lifeline` - 时序图生命线（矩形头部 + 底部虚线延伸）
 */

import { Shape, ShapeRegistry, type AbstractCanvas2D } from '@maxgraph/core';

/**
 * 用例图角色形状（小人图标）
 * 绘制：头（圆）+ 身体（线）+ 手臂（线）+ 腿（线）
 */
class UMLActorShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number): void {
    // 头部：圆，直径为宽度的 1/3
    // maxGraph 用 ellipse(x, y, w, h) 绘制椭圆，圆形是 w=h 的椭圆
    const headR = w / 6;
    const headD = headR * 2;
    const headX = x + w / 2 - headR;
    const headY = y + 2;

    // 绘制头部圆（用 ellipse）
    c.ellipse(headX, headY, headD, headD);
    c.fillAndStroke();

    // 身体：从头部下方到中部
    const bodyTop = headY + headD;
    const bodyBottom = y + h * 0.55;
    const cx = x + w / 2;

    c.begin();
    c.moveTo(cx, bodyTop);
    c.lineTo(cx, bodyBottom);
    c.stroke();

    // 手臂：从身体中部向两侧
    const armY = bodyTop + (bodyBottom - bodyTop) * 0.3;
    c.begin();
    c.moveTo(x + w * 0.1, armY);
    c.lineTo(cx, armY);
    c.lineTo(x + w * 0.9, armY);
    c.stroke();

    // 腿：从身体底部向下
    const legTop = bodyBottom;
    const legBottom = y + h - 2;
    c.begin();
    c.moveTo(cx, legTop);
    c.lineTo(x + w * 0.2, legBottom);
    c.moveTo(cx, legTop);
    c.lineTo(x + w * 0.8, legBottom);
    c.stroke();
  }
}

/**
 * 时序图生命线形状
 * 绘制：矩形头部框 + 底部延伸的虚线（表示对象存在时间）
 */
class LifelineShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number): void {
    // 头部矩形（圆角）
    const headH = Math.min(30, h * 0.15);
    const arc = 8;

    // 绘制头部圆角矩形
    c.roundrect(x, y, w, headH, arc, arc);
    c.fillAndStroke();

    // 底部虚线延伸
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
 * 注册自定义形状到全局 ShapeRegistry
 */
export function registerCustomShapes(): void {
  ShapeRegistry.add('umlActor', UMLActorShape);
  ShapeRegistry.add('lifeline', LifelineShape);
}

export { UMLActorShape, LifelineShape };