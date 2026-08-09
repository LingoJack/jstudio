/**
 * useGraphInit - 从 GraphCanvas 提取的 maxGraph 初始化逻辑（最高风险单元）。
 *
 * 职责：
 *   - Graph 实例创建 + 插件注册（RubberBandHandler）
 *   - 自定义形状注册 + 障碍路由 + 思维导图边样式
 *   - VertexHandler / ConnectionHandler 覆写
 *   - 连接点约束逻辑
 *   - UndoManager 绑定 + 模型变化/选中变化/视口变化监听
 *   - 拖拽绘制（mousedown/mousemove/mouseup）
 *   - 滚轮缩放/平移
 *   - ResizeObserver
 *   - 初始快照灌入
 *   - cleanup 函数（destroy + flush + removeEventListener）
 *
 * 注意：effect 依赖数组为 []（仅挂载时运行），所有动态值通过 ref 读取。
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import {
  Graph,
  InternalEvent,
  RubberBandHandler,
  UndoManager,
  ConnectionConstraint,
  Point,
  getDefaultPlugins,
  HandleConfig,
  VertexHandlerConfig,
  ImageBox,
  Rectangle,
  RectangleShape,
  RhombusShape,
  EllipseShape,
  VertexHandler,
  CellState,
  styleUtils,
  eventUtils,
} from '@maxgraph/core';
import type {
  ConnectionHandler,
  SelectionHandler,
  FitPlugin,
  PanningHandler,
  Cell,
  CellStyle,
  InternalMouseEvent,
  EventObject,
} from '@maxgraph/core';
import { RubberBandHandler as RubberBandHandlerType } from '@maxgraph/core';

import { registerCustomShapes, HEAD_HEIGHT } from './customShapes';
import { registerObstacleEdgeStyle } from './obstacleRouting';
import { registerMindmapEdgeStyle } from './mindmapLayout';
import {
  paletteFor,
  getSelectionColor,
  getHandleFillColor,
  getHandleStrokeColor,
  getConnectionPointColor,
  getEdgeColor,
  getFontColor,
  getLabelBackgroundColor,
  createConnectionPointSVG,
  createLifelineConnectionPointSVG,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  SHAPE_ARC_SIZE,
  ARROW_END_SIZE,
  HANDLE_SIZE,
  SELECTION_STROKE_WIDTH,
  SELECTION_DASHED,
  CONNECTION_POINT_SIZE,
} from './graphTheme';
import {
  styleForShape,
  DEFAULT_SIZE,
  SHAPE_LABEL,
  GRID_SIZE,
  EVENT_TOLERANCE,
  ZOOM_MIN,
  ZOOM_MAX,
  MIN_DRAW_SIZE,
  CONNECTION_POINTS,
} from './graphCanvasStyle';
import { attachSequenceInteraction, owningLifeline } from './sequenceInteraction';
import { isOnBorder, FLOW_ANIMATION_THRESHOLD, BORDER_TOLERANCE_PX } from './graphHelpers';
import { parseGraphSnapshot } from './graphSnapshot';
import type { GraphNodeShape } from './graphSnapshot';
import { applySnapshotToGraph } from './graphModel';
import { logger } from '../../../../lib/core/logger';

export interface UseGraphInitParams {
  containerRef: RefObject<HTMLDivElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  graphRef: RefObject<Graph | null>;
  undoManagerRef: RefObject<UndoManager | null>;
  updateFlowAnimationRef: RefObject<(() => void) | null>;
  darkModeRef: RefObject<boolean>;
  autoActivationRef: RefObject<boolean>;
  applyingRef: RefObject<boolean>;
  initialSnapshotRef: RefObject<string>;
  showGridRef: RefObject<boolean>;
  pendingShapeRef: RefObject<GraphNodeShape | null>;
  debounceRef: RefObject<ReturnType<typeof setTimeout> | null>;
  scheduleEmit: () => void;
  emitSnapshot: () => void;
  setShowGrid: (v: boolean) => void;
  setAutoActivation: (v: boolean) => void;
  setSelectedLabelAlign: (v: 'left' | 'center' | 'right' | null) => void;
  setSelectedFillColor: (v: string | null) => void;
  setSelectedSeqEdge: (v: 'call' | 'return' | null) => void;
  setFillPickerOpen: (v: boolean) => void;
  setPending: (shape: GraphNodeShape | null) => void;
}

export function useGraphInit(params: UseGraphInitParams) {
  const {
    containerRef,
    rootRef,
    graphRef,
    undoManagerRef,
    updateFlowAnimationRef,
    darkModeRef,
    autoActivationRef,
    applyingRef,
    initialSnapshotRef,
    showGridRef,
    pendingShapeRef,
    debounceRef,
    scheduleEmit,
    emitSnapshot,
    setShowGrid,
    setAutoActivation,
    setSelectedLabelAlign,
    setSelectedFillColor,
    setSelectedSeqEdge,
    setFillPickerOpen,
    setPending,
  } = params;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    InternalEvent.disableContextMenu(container);

    // 用默认插件 + 框选。传入 plugins 会替换默认列表，故需展开默认再追加。
    // 注：ConstraintHandler 不是插件，它是 ConnectionHandler 内部使用的 handler，
    // ConnectionHandler 已包含在 getDefaultPlugins() 中，会自动创建 ConstraintHandler。
    const graph = new Graph(container, undefined, [
      ...getDefaultPlugins(),
      RubberBandHandler,
    ]);
    graphRef.current = graph;

    // 连线流动效果：在 cellRenderer.initializeShape（shape 创建唯一入口）处打标记，
    // 给每条 edge 的 SVG <g> 加 .jgraph-edge 类，并创建圆点流动 <path>。
    // 关键：Shape.redraw() 内部调用 clear() 移除所有子节点再重建 path，
    // 所以圆点元素会被清除。解决：重写 shape.redraw()，在原逻辑执行完毕后
    // 重新追加圆点 path 并同步 d 属性。圆点元素本身只创建一次，重复 append 即可。
    // CSS 控制圆点样式与动画（stroke-dasharray + round linecap + animation）。
    {
      const cellRenderer = graph.cellRenderer;
      const origInitializeShape = cellRenderer.initializeShape.bind(cellRenderer);
      cellRenderer.initializeShape = (state: CellState) => {
        origInitializeShape(state);
        const cell = state.cell;
        const shape = state.shape;
        if (
          cell &&
          cell.isEdge() &&
          shape?.node &&
          !(shape as { _jgraphDotInit?: boolean })._jgraphDotInit
        ) {
          (shape as { _jgraphDotInit?: boolean })._jgraphDotInit = true;
          shape.node.classList.add('jgraph-edge');

          // 圆点 <path>：仅创建一次，每次 redraw() 后重新追加并同步 d。
          const dotPath = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path',
          );
          dotPath.classList.add('jgraph-edge-dot');

          const origRedraw = shape.redraw.bind(shape);
          shape.redraw = () => {
            origRedraw();
            const pathEl = shape.node.querySelector('path');
            if (pathEl) {
              dotPath.setAttribute('d', pathEl.getAttribute('d') ?? '');
              shape.node.appendChild(dotPath);
            }
          };
        }
      };
    }

    // 流动动画阈值控制：边数超过阈值时给容器加 .jgraph-flow-off 类，
    // CSS 自动关闭 stroke-dashoffset 动画，保证大图流畅。
    updateFlowAnimationRef.current = () => {
      const g = graphRef.current;
      const container = containerRef.current;
      if (!g || !container) return;
      const edgeCount = g.getChildEdges(g.getDefaultParent()).length;
      container.classList.toggle('jgraph-flow-off', edgeCount > FLOW_ANIMATION_THRESHOLD);
    };

    // 注册自定义形状到全局 ShapeRegistry（UML 图表：用例图角色、时序图生命线等）
    registerCustomShapes();
    // 注册避障正交边路由样式（A* 网格寻路，避免连线穿过已有图形）
    registerObstacleEdgeStyle();
    // 注册思维导图贝塞尔曲线边样式（topic 生发连线专用）
    registerMindmapEdgeStyle();

    // 基本交互能力。
    graph.setPanning(true);
    graph.setConnectable(true); // 允许从节点边缘拖出连线
    graph.setCellsEditable(true); // 双击节点 / 连线编辑文本
    graph.setAllowDanglingEdges(false); // 不允许悬空连线（必须连到节点）
    graph.setHtmlLabels(true);
    // 选中图形后显示八向缩放手柄，可鼠标拖拽改大小（VertexHandler 内置）。
    graph.setCellsResizable(true);
    graph.setCellsMovable(true);
    // 降低拉线灵敏度：按下后移动超过 tolerance 像素才算"开始拉线/拖动"，
    // 默认很小导致轻点边缘就误触发连线。
    graph.setEventTolerance(EVENT_TOLERANCE);

    // 节点默认配色：取矩形（淡蓝）作为兜底默认；具体每种形状在创建时
    // 由 styleForShape 带上各自配色，覆盖此默认。
    const dark = darkModeRef.current;

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

    // 自定义选中框形状：按节点形状显示对应选中框（菱形→菱形选中框，椭圆→椭圆选中框，其余→矩形）。
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
        () => styleForShape('activation', darkModeRef.current),
        () => autoActivationRef.current,
      );
    }

    // Cmd/Ctrl + 拖动 = 复制拖动（让 Alt/Option 空出来给"平移画布"用）。
    graph.isCloneEvent = (evt: MouseEvent) => {
      const r = evt.metaKey || evt.ctrlKey;
      // 诊断日志：确认 isCloneEvent 是否被调用、返回什么。排查复制不生效问题。
      // eslint-disable-next-line no-console
      logger.debug('GraphCanvas', 'isCloneEvent → metaKey|ctrlKey: ' + r);
      return r;
    };
    // 必须启用 cellsCloneable，否则 isCloneEvent 返回 true 也不会触发复制
    graph.setCellsCloneable(true);

    // 禁用 RubberBandHandler 的 Alt 强制框选行为（否则 Alt+拖动会变成框选而非平移画布）
    const rubberBandHandler = graph.getPlugin<RubberBandHandlerType>('RubberBandHandler');
    if (rubberBandHandler) {
      rubberBandHandler.isForceRubberbandEvent = () => false;
    }

    // Alt/Option + 拖动 = 平移画布（即使按在图形上也平移，而非移动图形）。
    const panningHandler = graph.getPlugin<PanningHandler>('PanningHandler');
    if (panningHandler) {
      panningHandler.isForcePanningEvent = (me) => {
        const evt = me.getEvent() as MouseEvent;
        return evt.altKey;
      };
    }

    // 网格 + 吸附（draw.io 同款：拖拽/缩放对齐到 10px 网格）。
    graph.setGridEnabled(false); // 默认不显示网格
    graph.setGridSize(GRID_SIZE);
    // 缩放以视口中心为锚点（而非左上角），更符合直觉。
    graph.centerZoom = true;

    // 拖动时显示与其他图形的对齐参考线（SelectionHandler 内置能力）。
    const selectionHandler = graph.getPlugin<SelectionHandler>('SelectionHandler');
    if (selectionHandler) {
      selectionHandler.guidesEnabled = true;
      // 拖动预览颜色：跟随主题 accent 色（--vscode-focusBorder）
      selectionHandler.previewColor = getSelectionColor(dark);
      // 启用 livePreview：移动图形时显示实际图形预览（而非矩形框）
      // maxLivePreview 默认为 0，需要设置一个较大值才能启用
      selectionHandler.maxLivePreview = 100;
      selectionHandler.allowLivePreview = true;
    }

    // ── 边框命中检测：点击图形内部时穿透选中下层图形 ──────────────────
    // 覆写 updateMouseEvent，仅对 MOUSE_DOWN / MOUSE_UP 生效。
    // 当点击落在顶层 vertex 的内部（非边框）时，用 getCellAt 查找下层
    // 图形并更新 me.state，使选中/移动穿透到下层。若无下层图形则保持
    // 原选择（保证孤立图形仍可正常选中移动）。不影响双击编辑和连线。
    const originalUpdateMouseEvent = graph.updateMouseEvent.bind(graph);
    graph.updateMouseEvent = function (me, evtName) {
      const result = originalUpdateMouseEvent(me, evtName);
      if (evtName === InternalEvent.MOUSE_DOWN || evtName === InternalEvent.MOUSE_UP) {
        const originalCell = me.getCell();
        if (originalCell && originalCell.isVertex()) {
          const state = me.getState();
          if (state) {
            const tol = BORDER_TOLERANCE_PX / this.getView().scale;
            if (!isOnBorder(state, me.graphX, me.graphY, tol)) {
              // 点击在内部 → 查找下层图形（跳过当前顶层图形）
              const cellBelow = this.getCellAt(
                me.graphX,
                me.graphY,
                null,
                true,
                true,
                (s: CellState) => s.cell === originalCell,
              );
              if (cellBelow) {
                me.state = this.getView().getState(cellBelow);
              }
              // 无下层图形 → 保持原选择，不做修改
            }
          }
        }
      }
      return result;
    };

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
      // 头部矩形保留 4 个中点，供 actor→lifeline 关联使用。
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

    // Undo / Redo。
    const undoManager = new UndoManager();
    undoManagerRef.current = undoManager;
    const undoListener = (_sender: unknown, evt: EventObject) => {
      undoManager.undoableEditHappened(evt.getProperty('edit'));
    };
    graph.getDataModel().addListener(InternalEvent.UNDO, undoListener);
    graph.getView().addListener(InternalEvent.UNDO, undoListener);

    // 模型变化 → 防抖序列化回传。
    graph.getDataModel().addListener(InternalEvent.CHANGE, () => {
      scheduleEmit();
      updateFlowAnimationRef.current?.();
    });

    // 选中变化 -> 更新对齐按钮高亮状态 + 填充色状态 + 时序消息切换按钮。
    graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
      const cell = graph.getSelectionCell();
      if (cell) {
        const style = graph.getCurrentCellStyle(cell);
        const a = style.align;
        setSelectedLabelAlign(a === 'left' || a === 'right' ? a : 'center');
        // 仅 vertex 显示填充色按钮；边线不显示。
        const fc = style.fillColor;
        setSelectedFillColor(
          cell.isVertex()
            ? (typeof fc === 'string' && fc ? fc : 'none')
            : null,
        );
        // 两端都能解析到生命线（lifeline 或贴在 lifeline 上的 ac）的边
        // 才是时序图消息，显示"调用/返回"切换按钮。
        if (
          cell.isEdge() &&
          owningLifeline(graph, cell.getTerminal(true)) &&
          owningLifeline(graph, cell.getTerminal(false))
        ) {
          setSelectedSeqEdge(style.dashed === true ? 'return' : 'call');
        } else {
          setSelectedSeqEdge(null);
        }
      } else {
        setSelectedLabelAlign(null);
        setSelectedFillColor(null);
        setSelectedSeqEdge(null);
      }
      setFillPickerOpen(false);
    });

    // 视口变化（缩放/平移/自适应）-> 防抖序列化回传，确保 fitCenter、zoomIn/Out
    // 等操作后的视口比例能被持久化，下次打开文档时恢复正确比例。
    // 注：初始灌入快照时 applyingRef.current===true，scheduleEmit 会直接 return，无副作用。
    const view = graph.getView();
    view.addListener(InternalEvent.SCALE, () => scheduleEmit());
    view.addListener(InternalEvent.TRANSLATE, () => scheduleEmit());
    view.addListener(InternalEvent.SCALE_AND_TRANSLATE, () => scheduleEmit());

    // 文本框 resize -> 字号按比例缩放（仅 text 形状）。
    // resizeCells 在 batchUpdate 内执行，此处 setStyle 会被合并到同一个 undo batch，
    // undo 一步即可同时撤销尺寸和字号变化。
    graph.addListener(InternalEvent.CELLS_RESIZED, (_s: unknown, evt: EventObject) => {
      if (applyingRef.current) return;
      const cells = evt.getProperty('cells') as Cell[] | undefined;
      if (!cells || cells.length === 0) return;
      const model = graph.getDataModel();
      for (const cell of cells) {
        if (!cell.isVertex()) continue;
        const style = (cell.getStyle() as CellStyle) ?? {};
        if (style.shape !== 'text') continue;
        const geo = cell.getGeometry();
        if (!geo) continue;
        const def = DEFAULT_SIZE['text']; // 默认 { w: 60, h: 30 }
        const scale = Math.sqrt((geo.width / def.w) * (geo.height / def.h));
        const newFontSize = Math.max(6, Math.round(SHAPE_FONT_SIZE * scale));
        if (style.fontSize === newFontSize) continue;
        model.setStyle(cell, { ...style, fontSize: newFontSize });
      }
    });

    // 双击空白（未命中任何 cell）→ 自适应全图（draw.io 同款）。
    graph.addListener(InternalEvent.DOUBLE_CLICK, (_s: unknown, evt: EventObject) => {
      let cell = evt.getProperty('cell') as Cell | undefined;
      if (!cell) {
        const nativeEvt = evt.getProperty('event') as MouseEvent | null;
        if (nativeEvt) {
          const pt = styleUtils.convertPoint(
            graph.getContainer(),
            eventUtils.getClientX(nativeEvt),
            eventUtils.getClientY(nativeEvt),
          );
          cell = graph.getCellAt(pt.x, pt.y) ?? undefined;
        }
      }
      if (cell && graph.isCellEditable(cell)) {
        graph.startEditingAtCell(cell, evt.getProperty('event'));
        evt.consume();
      } else if (!cell) {
        const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
        if (hasCells) graph.getPlugin<FitPlugin>('fit')?.fitCenter({ margin: 24 });
        evt.consume();
      }
    });

    // 灌入初始快照。
    const parsedInit = parseGraphSnapshot(initialSnapshotRef.current);
    applyingRef.current = true;
    try {
      graph.batchUpdate(() => {
        applySnapshotToGraph(graph, parsedInit, darkModeRef.current);
      });
    } finally {
      applyingRef.current = false;
    }
    // 同步组件 showGrid 态（applySnapshotToGraph 已设引擎 gridEnabled，
    // 但组件 state 仍是默认 true，需对齐，否则下次 emit 会把 showGrid 写回 true）。
    if (typeof parsedInit.showGrid === 'boolean') {
      setShowGrid(parsedInit.showGrid);
      showGridRef.current = parsedInit.showGrid;
    }
    // 同步组件 autoActivation 态（缺省保持默认 true）。
    if (typeof parsedInit.autoActivation === 'boolean') {
      setAutoActivation(parsedInit.autoActivation);
      autoActivationRef.current = parsedInit.autoActivation;
    }
    // 初始灌入产生的 edit 不应进 undo 历史。
    undoManager.clear();
    // 根据边数决定是否开启动画。
    updateFlowAnimationRef.current();

    /* ------------------------------------------------------------ */
    /* 拖拽绘制：点了工具栏图形后，在画布上按住拖拽划出位置与大小      */
    /* （飞书 / draw.io 手感）。只点不拖 → 用默认尺寸落在点击处。      */
    /* ------------------------------------------------------------ */

    // 绘制预览（SVG，跟随当前形状画出真实轮廓，所见即所绘）。
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const preview = document.createElementNS(SVG_NS, 'svg');
    preview.classList.add('jgraph-draw-preview');
    preview.style.display = 'none';
    container.appendChild(preview);

    // 当前预览内部的形状元素。切换形状时重建，移动时只更新坐标/尺寸。
    let previewShapeEl: SVGElement | null = null;

    /** 按当前待绘制形状，在预览 SVG 内创建对应几何元素。 */
    const ensurePreviewShape = (shape: GraphNodeShape) => {
      if (previewShapeEl && previewShapeEl.dataset.shape === shape) return;
      preview.innerHTML = '';
      let el: SVGElement;
      switch (shape) {
        case 'ellipse':
          el = document.createElementNS(SVG_NS, 'ellipse');
          break;
        case 'diamond':
          el = document.createElementNS(SVG_NS, 'polygon');
          break;
        case 'rounded':
        case 'rectangle':
        case 'text':
        default:
          el = document.createElementNS(SVG_NS, 'rect');
          break;
      }
      el.classList.add('jgraph-draw-preview-shape');
      if (shape === 'text') {
        // text 形状实际无边框，预览用虚线表示"文本区域"而非真实边框。
        el.classList.add('is-text-region');
      }
      preview.appendChild(el);
      previewShapeEl = el;
      previewShapeEl.dataset.shape = shape;
    };

    /** 把拖拽划定的区域（屏幕像素 w/h）应用到当前预览形状上。 */
    const applyPreviewSize = (w: number, h: number, shape: GraphNodeShape) => {
      const el = previewShapeEl;
      if (!el) return;
      switch (shape) {
        case 'ellipse': {
          const e = el as SVGEllipseElement;
          e.setAttribute('cx', String(w / 2));
          e.setAttribute('cy', String(h / 2));
          e.setAttribute('rx', String(Math.max(0, w / 2)));
          e.setAttribute('ry', String(Math.max(0, h / 2)));
          break;
        }
        case 'diamond': {
          const p = el as SVGPolygonElement;
          const pts = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
          p.setAttribute('points', pts);
          break;
        }
        case 'rounded': {
          const r = el as SVGRectElement;
          r.setAttribute('width', String(w));
          r.setAttribute('height', String(h));
          // 圆角随尺寸缩放但封顶，太小则无圆角，避免挤压变形。
          const arc = Math.min(SHAPE_ARC_SIZE, Math.min(w, h) / 3);
          r.setAttribute('rx', String(arc));
          r.setAttribute('ry', String(arc));
          break;
        }
        case 'rectangle':
        case 'text':
        default: {
          const r = el as SVGRectElement;
          r.setAttribute('width', String(w));
          r.setAttribute('height', String(h));
          break;
        }
      }
    };

    let drawing = false;
    let startClient = { x: 0, y: 0 }; // 相对 container 的屏幕坐标
    let startGraph = { x: 0, y: 0 }; // 对应的图坐标

    const clientToContainer = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

    const onMouseDown = (e: MouseEvent) => {
      const shape = pendingShapeRef.current;
      if (!shape) return; // 未处于待绘制态，交给引擎正常处理
      if (e.button !== 0) return;
      // 拦截，阻止 maxGraph 的框选/平移接管本次拖拽。
      e.preventDefault();
      e.stopPropagation();
      drawing = true;
      startClient = clientToContainer(e);
      const p = graph.getPointForEvent(e, false);
      startGraph = { x: p.x, y: p.y };
      ensurePreviewShape(shape);
      applyPreviewSize(0, 0, shape);
      preview.style.left = `${startClient.x}px`;
      preview.style.top = `${startClient.y}px`;
      preview.style.width = '0px';
      preview.style.height = '0px';
      preview.style.display = 'block';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!drawing) return;
      const shape = pendingShapeRef.current;
      if (!shape) return;
      const cur = clientToContainer(e);
      const x = Math.min(cur.x, startClient.x);
      const y = Math.min(cur.y, startClient.y);
      const w = Math.abs(cur.x - startClient.x);
      const h = Math.abs(cur.y - startClient.y);
      preview.style.left = `${x}px`;
      preview.style.top = `${y}px`;
      preview.style.width = `${w}px`;
      preview.style.height = `${h}px`;
      applyPreviewSize(w, h, shape);
    };

    const finishDraw = (e: MouseEvent) => {
      if (!drawing) return;
      drawing = false;
      // 绘制完成后确保 root 获得焦点，使键盘快捷键（Tab/Enter 等）生效。
      // onMouseDown(capture) 在待绘制态会 stopPropagation，导致 onCanvasMouseDown 不触发，
      // 这里补一次 focus。
      rootRef.current?.focus({ preventScroll: true });
      preview.style.display = 'none';
      const shape = pendingShapeRef.current;
      if (!shape) return;

      const endPoint = graph.getPointForEvent(e, false);
      const rawW = Math.abs(endPoint.x - startGraph.x);
      const rawH = Math.abs(endPoint.y - startGraph.y);

      // 连线类型：不创建节点，直接退出，让用户手动从节点拖拽连线
      // 连线工具只是改变 ConnectionHandler 的默认连线样式
      if (shape.startsWith('edge-')) {
        const connectionHandler = graph.getPlugin<ConnectionHandler>('ConnectionHandler');
        if (connectionHandler) {
          // 设置默认连线样式，用户拖拽连线时会使用这个样式
          const edgeStyle = styleForShape(shape, darkModeRef.current);
          connectionHandler.createEdgeState = function () {
            const edge = this.graph.createEdge(undefined, undefined, undefined, undefined, undefined, edgeStyle);
            return new CellState(this.graph.view, edge, this.graph.getCellStyle(edge));
          };
        }
        setPending(null);
        return;
      }

      let x: number;
      let y: number;
      let w: number;
      let h: number;
      if (rawW < MIN_DRAW_SIZE && rawH < MIN_DRAW_SIZE) {
        // 只点不拖 → 用默认尺寸，以点击处为中心。
        const size = DEFAULT_SIZE[shape];
        w = size.w;
        h = size.h;
        x = snap(startGraph.x - w / 2);
        y = snap(startGraph.y - h / 2);
      } else {
        // 拖拽划定的实际区域，对齐网格。
        x = snap(Math.min(startGraph.x, endPoint.x));
        y = snap(Math.min(startGraph.y, endPoint.y));
        w = Math.max(GRID_SIZE, snap(rawW));
        h = Math.max(GRID_SIZE, snap(rawH));
      }

      const parent = graph.getDefaultParent();
      const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      graph.batchUpdate(() => {
        const cell = graph.insertVertex({
          parent,
          id,
          value: SHAPE_LABEL[shape],
          position: [x, y],
          size: [w, h],
          style: styleForShape(shape, darkModeRef.current),
        });
        graph.setSelectionCell(cell);
      });
      // 绘制完自动退出待绘制态（单次绘制，符合飞书手感）。
      setPending(null);
    };

    container.addEventListener('mousedown', onMouseDown, true);
    container.addEventListener('mousemove', onMouseMove, true);
    container.addEventListener('mouseup', finishDraw, true);

    // 诊断：mouseup 时打印 altKey 与选中数，用于排查 Option+拖动复制不生效。
    // 仅在非绘制态记录（绘制态由 finishDraw 处理）。
    const onMouseUpDiag = (e: MouseEvent) => {
      if (pendingShapeRef.current) return;
      const g = graphRef.current;
      if (!g) return;
      const sel = g.getSelectionCells();
      // eslint-disable-next-line no-console
      logger.debug('GraphCanvas', 'mouseup | metaKey|ctrlKey: ' + (e.metaKey || e.ctrlKey) + ' | selCount: ' + sel.length + ' | isCloneEvent: ' + g.isCloneEvent(e));
    };
    container.addEventListener('mouseup', onMouseUpDiag, true);

    // 滚轮交互（draw.io / 飞书手感）：
    //   - Ctrl/Cmd + 滚轮 → 缩放
    //   - 普通滚轮 → 平移视图（垂直滚 → 上下平移；水平滚轮 / Shift+滚轮 → 左右平移）
    // view.setTranslate 会触发 TRANSLATE 事件，上方已注册 listener 持久化视口。
    // 方向约定：滚轮向下 (deltaY > 0) → 看下方内容 → translate.y 减小
    //          （translate.y 是视口左上角对应的图坐标的相反数）
    const onWheel = (e: WheelEvent) => {
      const g = graphRef.current;
      if (!g) return;

      // 缩放分支（macOS 双指捏合 / Ctrl+滚轮）
      // 使用指数缩放 + 以光标为锚点，步进细腻连续，手感与 draw.io 一致。
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const view = g.getView();
        const oldScale = view.scale;
        // 指数缩放：deltaY 越大缩放越多，但每步变化小且连续。
        // macOS 双指捏合每帧 deltaY 约 ±2~±20，0.005 系数使每步仅 ~1%~5% 变化。
        const factor = Math.exp(-e.deltaY * 0.005);
        const newScale = Math.min(Math.max(oldScale * factor, ZOOM_MIN), ZOOM_MAX);
        if (newScale === oldScale) return;
        // 以光标位置为锚点缩放：保持光标下的图坐标点不变，缩放手感更自然。
        const rect = container.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const ratio = 1 / newScale - 1 / oldScale;
        view.scaleAndTranslate(
          newScale,
          view.translate.x + cx * ratio,
          view.translate.y + cy * ratio,
        );
        return;
      }

      // 平移分支
      e.preventDefault();
      const view = g.getView();
      const scale = view.scale;
      // macOS 约定：Shift + 垂直滚轮 → 水平平移（仅在设备无原生水平滚轮时生效）
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.shiftKey && dx === 0) {
        dx = e.deltaY;
        dy = 0;
      }
      // 像素增量需换算为图坐标增量（除以 scale）。
      view.setTranslate(
        view.translate.x - dx / scale,
        view.translate.y - dy / scale,
      );
    };
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });

    // 容器尺寸变化（窗口缩放、拖拽改大小等）时重新自适应内容。
    // sizeDidChange 只更新内部尺寸追踪，不会调整视口；若不重新 fitCenter，
    // 图形仍停留在旧视口比例，而容器已变小/变大，导致内容偏离最佳贴合位置。
    let firstResize = true;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObs = new ResizeObserver(() => {
      graph.sizeDidChange();
      // 跳过首次回调（observe 初始触发），保留快照恢复的视口；
      // 仅在容器真正尺寸变化时重新 fitCenter。
      if (firstResize) {
        firstResize = false;
        return;
      }
      // 防抖：连续缩放窗口时避免频繁 fitCenter。
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
        if (hasCells) {
          graph.getPlugin<FitPlugin>('fit')?.fitCenter({ margin: 24 });
        }
      }, 150);
    });
    resizeObs.observe(container);

    return () => {
      resizeObs.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      container.removeEventListener('wheel', onWheel, true);
      container.removeEventListener('mousedown', onMouseDown, true);
      container.removeEventListener('mousemove', onMouseMove, true);
      container.removeEventListener('mouseup', finishDraw, true);
      container.removeEventListener('mouseup', onMouseUpDiag, true);
      preview.remove();
      detachSequenceInteraction?.();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        // 卸载前 flush 最后一次编辑，避免丢失。
        emitSnapshot();
      }
      graph.destroy();
      graphRef.current = null;
      undoManagerRef.current = null;
    };
    // 仅初始化一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
