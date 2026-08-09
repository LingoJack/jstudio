import {
  HandleConfig,
  VertexHandlerConfig,
  VertexHandler,
  EllipseShape,
  RectangleShape,
  RhombusShape,
  Rectangle,
  InternalEvent,
} from '@maxgraph/core';
import {
  getHandleFillColor,
  getHandleStrokeColor,
  getSelectionColor,
  HANDLE_SIZE,
  SELECTION_STROKE_WIDTH,
  SELECTION_DASHED,
} from '../graphTheme';
import type { GraphSetupFn } from './types';

export const setupVertexHandlers: GraphSetupFn = (ctx) => {
  const dark = ctx.darkModeRef.current;

  // 飞书风格选中手柄配置：小巧圆点 + 蓝色选中框（颜色跟随主题）
  HandleConfig.size = HANDLE_SIZE;
  HandleConfig.fillColor = getHandleFillColor(dark);
  HandleConfig.strokeColor = getHandleStrokeColor(dark);
  VertexHandlerConfig.selectionColor = getSelectionColor(dark);
  VertexHandlerConfig.selectionStrokeWidth = SELECTION_STROKE_WIDTH;
  VertexHandlerConfig.selectionDashed = SELECTION_DASHED;

  // 飞书风格：将缩放手柄从方形改为圆形（覆盖 VertexHandler.createSizerShape）
  VertexHandler.prototype.createSizerShape = function (
    this: VertexHandler,
    bounds: Rectangle,
    index: number,
    fillColor: string = HandleConfig.fillColor,
  ): RectangleShape {
    const strokeColor = HandleConfig.strokeColor;
    // 旋转手柄保持椭圆形（更明显）
    if (index === InternalEvent.ROTATION_HANDLE) {
      return new EllipseShape(bounds, fillColor, strokeColor, 1.5);
    }
    // 所有缩放手柄都用圆形（飞书风格）
    return new EllipseShape(bounds, fillColor, strokeColor, 1.5) as RectangleShape;
  };

  // 自定义选中框形状：按节点形状显示对应选中框（菱形->菱形选中框，椭圆->椭圆选中框，其余->矩形）。
  // maxGraph 中选中框由 VertexHandler.createSelectionShape 创建（不再有 graph.createSelectionShape）。
  // 覆盖原型方法；颜色/线宽/虚线统一从 VertexHandlerConfig 读取，自动跟随主题。
  VertexHandler.prototype.createSelectionShape = function (
    this: VertexHandler,
    bounds: Rectangle,
  ): RectangleShape {
    const shapeStyle = this.state?.style?.shape;
    const color = this.getSelectionColor();
    const strokeWidth = this.getSelectionStrokeWidth();
    const dashed = this.isSelectionDashed();

    let shape: RectangleShape | RhombusShape | EllipseShape;
    if (shapeStyle === 'rhombus') {
      shape = new RhombusShape(Rectangle.fromRectangle(bounds), 'none', color, strokeWidth);
    } else if (shapeStyle === 'ellipse') {
      shape = new EllipseShape(Rectangle.fromRectangle(bounds), 'none', color, strokeWidth);
    } else {
      // rectangle / rounded 默认用矩形选中框
      shape = new RectangleShape(Rectangle.fromRectangle(bounds), 'none', color, strokeWidth);
    }
    shape.isDashed = dashed;
    return shape as RectangleShape;
  };
};
