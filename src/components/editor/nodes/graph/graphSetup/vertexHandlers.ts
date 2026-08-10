import {
  HandleConfig,
  VertexHandlerConfig,
  EdgeHandlerConfig,
  VertexHandler,
  EllipseShape,
  RectangleShape,
  RhombusShape,
  Rectangle,
  InternalEvent,
  type CellState,
  type Graph,
  type SelectionHandler,
  type InternalMouseEvent,
} from "@maxgraph/core";
import {
  getHandleFillColor,
  getHandleStrokeColor,
  getSelectionColor,
  HANDLE_SIZE,
  SELECTION_STROKE_WIDTH,
  SELECTION_DASHED,
} from "../graphTheme";
import type { GraphSetupFn } from "./types";
import { ResizeGuide } from "./resizeGuide";

/**
 * 是否已安装 resize guide 覆盖（prototype 全局只需装一次）。
 * setupVertexHandlers 可能在主题刷新时被多次调用，用此标志避免重复覆盖。
 */
let resizeGuideInstalled = false;

export const setupVertexHandlers: GraphSetupFn = (ctx) => {
  const { graph } = ctx;
  const dark = ctx.darkModeRef.current;

  // 飞书风格选中手柄配置：小巧圆点 + 蓝色选中框（颜色跟随主题）
  HandleConfig.size = HANDLE_SIZE;
  HandleConfig.fillColor = getHandleFillColor(dark);
  HandleConfig.strokeColor = getHandleStrokeColor(dark);
  VertexHandlerConfig.selectionColor = getSelectionColor(dark);
  VertexHandlerConfig.selectionStrokeWidth = SELECTION_STROKE_WIDTH;
  VertexHandlerConfig.selectionDashed = SELECTION_DASHED;

  // 连线选中态：maxGraph 默认是亮绿（#00FF00）虚线 + 方形拐点手柄，与白板风格冲突。
  // 统一为跟随主题 accent 的实线高亮 + 圆形小手柄（与节点手柄一致）。
  EdgeHandlerConfig.selectionColor = getSelectionColor(dark);
  EdgeHandlerConfig.selectionStrokeWidth = SELECTION_STROKE_WIDTH;
  EdgeHandlerConfig.selectionDashed = SELECTION_DASHED;
  EdgeHandlerConfig.handleShape = "circle";
  // 连线端点手柄默认用亮蓝填充（CONNECT_HANDLE_FILLCOLOR）表示可拖拽重连，
  // 与其他手柄风格冲突；统一为 accent 实心小圆点（hover 时光标变为 pointer，仍有可拖拽提示）。
  EdgeHandlerConfig.connectFillColor = getHandleFillColor(dark);

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
      return new EllipseShape(bounds, fillColor, strokeColor, 1.25);
    }
    // 所有缩放手柄都用圆形（飞书风格）
    return new EllipseShape(
      bounds,
      fillColor,
      strokeColor,
      1.25,
    ) as RectangleShape;
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
    if (shapeStyle === "rhombus") {
      shape = new RhombusShape(
        Rectangle.fromRectangle(bounds),
        "none",
        color,
        strokeWidth,
      );
    } else if (shapeStyle === "ellipse") {
      shape = new EllipseShape(
        Rectangle.fromRectangle(bounds),
        "none",
        color,
        strokeWidth,
      );
    } else {
      // rectangle / rounded 默认用矩形选中框
      shape = new RectangleShape(
        Rectangle.fromRectangle(bounds),
        "none",
        color,
        strokeWidth,
      );
    }
    shape.isDashed = dashed;
    return shape as RectangleShape;
  };

  installResizeGuide(graph, dark);
};

/**
 * 安装 resize 时的对齐引导线。
 *
 * 覆盖 VertexHandler.prototype.resizeVertex：先调原方法计算 this.bounds，
 * 再用 ResizeGuide 检测可移动边与其它 shape 的边/中心对齐，命中则吸附
 * 并画 accent 色实线引导线。reset（mouseUp / destroy）时清理。
 *
 * `dark` 在 setup 时捕获；guide 颜色用 getSelectionColor(dark) 运行时读
 * --vscode-focusBorder CSS var，主题切换即生效。
 */
function installResizeGuide(graph: Graph, dark: boolean): void {
  if (resizeGuideInstalled) return;
  resizeGuideInstalled = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Proto: any = VertexHandler.prototype;
  const originalResizeVertex = Proto.resizeVertex;
  const originalReset = Proto.reset;

  Proto.resizeVertex = function (me: InternalMouseEvent): void {
    originalResizeVertex.call(this, me);

    // 仅对 8 个标准缩放手柄生效（0..7）；旋转/标签/自定义手柄跳过
    if (
      this.index == null ||
      this.index < 0 ||
      this.index > 7 ||
      !this.bounds ||
      !this.state
    ) {
      return;
    }

    // 懒创建：本次 resize 手势首次 mouseMove 时建立，reset 时销毁
    if (!this._resizeGuide) {
      const sh = graph.getPlugin<SelectionHandler>("SelectionHandler");
      const allStates = sh ? sh.getGuideStates() : [];
      const guideStates = allStates.filter(
        (s: CellState) => s.cell !== this.state.cell,
      );
      this._resizeGuide = new ResizeGuide(graph, guideStates, dark);
    }

    const guide = this._resizeGuide as ResizeGuide;
    const snapped = guide.snap(this.bounds, this.index);
    if (!snapped) {
      guide.hide();
      return;
    }

    // 把吸附后的 bounds 写回 handler，并同步 unscaledBounds
    this.bounds = snapped.bounds;
    syncUnscaledBounds(this);

    // 重绘 preview（livePreview / preview 两种路径）
    if (this.livePreviewActive) {
      this.updateLivePreview(me);
    } else if (this.preview != null) {
      this.drawPreview();
    }

    guide.drawGuides(snapped.guides);
  };

  Proto.reset = function (): void {
    originalReset.call(this);
    if (this._resizeGuide) {
      this._resizeGuide.destroy();
      this._resizeGuide = null;
    }
  };
}

/**
 * 把 this.bounds（已吸附）回写到 this.unscaledBounds，保证 mouseUp 时
 * resizeCell 拿到正确的几何。换算公式来自 VertexHandler.resizeVertex 原实现。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syncUnscaledBounds(handler: any): void {
  if (!handler.unscaledBounds || !handler.bounds) return;
  const scale = handler.graph.view.scale;
  const tr = handler.graph.view.translate;
  const ps = handler.parentState;
  const originX = ps ? ps.x : tr.x * scale;
  const originY = ps ? ps.y : tr.y * scale;
  handler.unscaledBounds.x = (handler.bounds.x - originX) / scale;
  handler.unscaledBounds.y = (handler.bounds.y - originY) / scale;
  handler.unscaledBounds.width = handler.bounds.width / scale;
  handler.unscaledBounds.height = handler.bounds.height / scale;
}
