import {
  ImageBox,
  EllipseShape,
  RectangleShape,
  Rectangle,
  CellState,
  ConnectionConstraint,
  Point,
} from '@maxgraph/core';
import type {
  ConnectionHandler,
  CellStyle,
  InternalMouseEvent,
} from '@maxgraph/core';
import {
  createConnectionPointSVG,
  createLifelineConnectionPointSVG,
  getConnectionPointColor,
  getFontColor,
  getLabelBackgroundColor,
  ARROW_END_SIZE,
  SHAPE_FONT_SIZE,
  CONNECTION_POINT_SIZE,
} from '../graphTheme';
import { styleForShape } from '../graphCanvasStyle';
import { attachSequenceInteraction } from '../sequenceInteraction';
import type { GraphSetupFn } from './types';

export const setupConnectionHandlers: GraphSetupFn = (ctx) => {
  const { graph, container } = ctx;
  const dark = ctx.darkModeRef.current;

  // 连接点样式：跟随主题（悬停边缘时显示）
  // maxGraph 中 pointImage / highlightColor 是 ConstraintHandler 实例属性（非静态），需取实例设置。
  const connectionHandler = graph.getPlugin<ConnectionHandler>('ConnectionHandler');
  if (connectionHandler?.constraintHandler) {
    const defaultPointImage = new ImageBox(
      createConnectionPointSVG(dark),
      CONNECTION_POINT_SIZE,
      CONNECTION_POINT_SIZE,
    );
    // lifeline 专用半透明小锚点（2px 半透明蓝点）：生命线段锚点密集（每 10px 一个），
    // 完全透明的图片会导致 constraintHandler 无法识别 hover，鼠标按下时 fallback 到
    // getCellAt() 返回错误的 cell（比如 actor）。改成半透明小点，既能被识别，又不太突兀。
    // hover 时的视觉反馈由 sequenceInteraction.ts 的自定义 SVG overlay（整条线高亮）提供。
    const lifelinePointImage = new ImageBox(
      createLifelineConnectionPointSVG(dark),
      2,
      2,
    );
    connectionHandler.constraintHandler.pointImage = defaultPointImage;
    connectionHandler.constraintHandler.highlightColor = getConnectionPointColor(dark);

    // 按 shape 返回不同的锚点图：lifeline 用透明点，其他 shape 用默认尺寸
    connectionHandler.constraintHandler.getImageForConstraint = (
      state: CellState,
      _constraint: ConnectionConstraint,
      _point: Point,
    ) => {
      const shape = (state.style as CellStyle)?.shape;
      if (shape === 'lifeline' || shape === 'umlActor' || shape === 'umlActivation') {
        return lifelinePointImage;
      }
      return defaultPointImage;
    };

    // 关键：缩小连接点判定容差，让拉线判定不那么灵敏。
    // getTolerance 控制"鼠标离连接点多近才算悬停在连接点上"进而进入拉线模式。
    // 默认逻辑返回较大值（基于连接点图像尺寸），导致边缘附近按下容易误判为拉线而非拖动图形。
    // 覆写该方法返回固定 4 像素，只有鼠标几乎精确落在连接点上才触发连线（优先判定为拖动图形）。
    // lifeline 用小锚点 + 密集分布，tolerance 放宽到 6px 让用户更容易命中。
    connectionHandler.constraintHandler.getTolerance = (me: InternalMouseEvent) => {
      // 通过 me.getCell() 判断当前悬停的 cell
      const cell = me.getCell();
      if (cell) {
        const state = graph.getView().getState(cell);
        const shape = state ? (state.style as CellStyle)?.shape : undefined;
        if (shape === 'lifeline' || shape === 'umlActor' || shape === 'umlActivation') {
          return 6;
        }
      }
      return 2;
    };
    // 重写 createHighlightShape：悬停连接点时显示一个比锚点略大的半透明填充圆，
    // 与飞书风格一致，避免默认矩形高亮造成的"方形边框"感。
    const ch = connectionHandler.constraintHandler;
    ch.createHighlightShape = () => {
      const color = getConnectionPointColor(dark);
      const hl = new EllipseShape(
        new Rectangle(),
        color,
        color,
        0,
      );
      hl.opacity = 0.25;
      return hl as RectangleShape;
    };
  }

  // 飞书风格：连线预览改为蓝色虚线 + 箭头，使用实际路由样式（而非直线）
  if (connectionHandler) {
    // 开启 livePreview，让预览线使用 edgeState 渲染（包含路由样式）
    connectionHandler.livePreview = true;

    // 覆盖 createEdgeState：返回带有实际 edge 样式的状态，让预览线显示正确的路由。
    // 注意：不要在这里设置 dashed，否则连接完成后的实际边也会变成虚线；
    // 预览的虚线效果由 drawPreview 单独控制。
    connectionHandler.createEdgeState = function () {
      const edgeStyle: Record<string, unknown> = {
        edgeStyle: 'obstacleEdgeStyle',
        strokeColor: getConnectionPointColor(dark),
        strokeWidth: 2,
        endArrow: 'classic',
        endSize: ARROW_END_SIZE,
        fontSize: SHAPE_FONT_SIZE,
        fontColor: getFontColor(dark),
        labelBackgroundColor: getLabelBackgroundColor(dark),
      };
      const edge = this.graph.createEdge(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        edgeStyle,
      );
      return new CellState(
        this.graph.view,
        edge,
        this.graph.getCellStyle(edge),
      );
    };

    // 颜色：有效连接时蓝色，无效时红色
    // 使用类型断言绕过 maxGraph 的严格类型定义
    connectionHandler.getEdgeColor = ((valid: boolean) => {
      return valid ? getConnectionPointColor(dark) : '#EF4444';
    }) as (valid: boolean) => "#00FF00" | "#FF0000";

    // 覆盖 drawPreview：确保预览线样式正确（蓝色虚线）
    connectionHandler.drawPreview = function () {
      if (this.shape) {
        this.shape.stroke = this.getEdgeColor(this.error === null);
        this.shape.strokeWidth = 2;
        this.shape.isDashed = true;
        this.shape.redraw();
      }
    };
  }

  // 时序图手绘体验增强：
  //  - 消息线强制水平（Y 锁定起点）
  //  - 从 lifeline 拖消息到 lifeline 后自动生成 activation
  //  - 悬停 lifeline 时显示跟随鼠标的圆点
  // 这些逻辑集中在 sequenceInteraction 模块，便于维护和独立测试。
  let detachSequenceInteraction: (() => void) | null = null;
  if (connectionHandler) {
    detachSequenceInteraction = attachSequenceInteraction(
      graph,
      connectionHandler,
      container,
      () => styleForShape('activation', ctx.darkModeRef.current),
      () => ctx.autoActivationRef.current,
    );
  }

  return () => detachSequenceInteraction?.();
};
