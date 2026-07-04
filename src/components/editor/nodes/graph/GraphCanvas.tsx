/**
 * GraphCanvas — 自研画板内核（基于 maxGraph）。
 *
 * 设计目标：与 ExcalidrawCanvas **完全同签名**（initialSnapshot / onChange /
 * darkMode / className / rootElRef / editing），从而可在 DiagramBlockView 与
 * DiagramWindowApp 中直接替换，调用方无需改动。
 *
 * 内核职责：
 *   - 用 maxGraph 渲染 node + edge 图模型（draw.io 同款思路，结构化 UML 友好）。
 *   - 数据进出只走自研快照格式（GraphSnapshot），与引擎实现解耦。
 *   - 通用流程图能力：矩形/圆角/椭圆/菱形模具、双击文本内联编辑、
 *     从节点边缘拖出连线 + 正交自动路由、选中/拖拽/框选/缩放、undo/redo、Del 删除。
 *   - editing=false 时进入只读：隐藏工具栏、禁止编辑/选择，仅供浏览。
 *
 * 与 Excalidraw 的关键差异：连线是"绑定端点"的——节点移动时连线自动重路由，
 * 这是时序图/用例图所必需、而 Excalidraw 不具备的能力。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Graph,
  InternalEvent,
  RubberBandHandler,
  UndoManager,
  ConnectionConstraint,
  Point,
  Clipboard,
  getDefaultPlugins,
  HandleConfig,
  VertexHandlerConfig,
  ImageBox,
  Rectangle,
  RectangleShape,
  RhombusShape,
  EllipseShape,
  ConnectorShape,
  VertexHandler,
  CellState,
  type Cell,
  type ConnectionHandler,
  type EventObject,
  type SelectionHandler,
  type FitPlugin,
  type PanningHandler,
  type RubberBandHandler as RubberBandHandlerType,
  type GraphPluginConstructor,
} from '@maxgraph/core';
import '@maxgraph/core/css/common.css';

import {
  Undo2,
  Redo2,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3x3,
} from 'lucide-react';

import {
  detectSnapshotKind,
  parseGraphSnapshot,
  serializeGraphSnapshot,
  type GraphNodeShape,
} from './graphSnapshot';
import { applySnapshotToGraph, readSnapshotFromGraph } from './graphModel';
import { registerCustomShapes, HEAD_HEIGHT } from './customShapes';
import {
  paletteFor,
  getSelectionColor,
  getHandleFillColor,
  getHandleStrokeColor,
  getConnectionPointColor,
  getEdgeColor,
  getFontColor,
  createConnectionPointSVG,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  SHAPE_ARC_SIZE,
  HANDLE_SIZE,
  SELECTION_STROKE_WIDTH,
  SELECTION_DASHED,
  CONNECTION_POINT_SIZE,
  PREVIEW_FILL_COLOR_LIGHT,
  PREVIEW_STROKE_COLOR_LIGHT,
  PREVIEW_FILL_COLOR_DARK,
  PREVIEW_STROKE_COLOR_DARK,
} from './graphTheme';

/* ------------------------------------------------------------------ */
/* Props — 必须与 ExcalidrawCanvasProps 完全一致                       */
/* ------------------------------------------------------------------ */

export interface GraphCanvasProps {
  /** 序列化的画板快照（JSON 字符串）。空 = 空白画板。 */
  initialSnapshot: string;
  /** 内容变化时（防抖后）触发。 */
  onChange: (snapshotJson: string) => void;
  /** 暗色模式渲染。 */
  darkMode?: boolean;
  /** 容器额外 className。 */
  className?: string;
  /** 把画板根元素暴露给父组件（进入编辑态时聚焦用）。卸载时以 null 调用。 */
  rootElRef?: (el: HTMLDivElement | null) => void;
  /** 当前是否处于编辑态。false 时只读、隐藏工具栏。默认 true。 */
  editing?: boolean;
}

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
  'edge-line': '',
  'edge-ortho': '',
  'edge-dashed': '',
  'edge-no-arrow': '',
};

/* ------------------------------------------------------------------ */
/* ShapeGlyph — 工具栏按钮上的真实形状预览                             */
/*                                                                    */
/* 直接画出对应形状的样貌（而非 lucide 抽象图标），用 currentColor      */
/* 描边，自动跟随按钮文字色 → 明暗主题天然适配，与画布上的实际图形一致。*/
/* 描边宽度对齐 graphTheme.SHAPE_STROKE_WIDTH(1.5)。                    */
/* ------------------------------------------------------------------ */

function ShapeGlyph({ shape }: { shape: GraphNodeShape }) {
  const sw = 1.5;
  switch (shape) {
    case 'rectangle':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="3.5" width="12" height="9" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'rounded':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="3.5" width="12" height="9" rx="2.5" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'ellipse':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <ellipse cx="8" cy="8" rx="6.5" ry="5" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'diamond':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 2 L14 8 L8 14 L2 8 Z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case 'text':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3.5 4 H12.5 M8 4 V13" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case 'actor':
      // 用例图角色：小人图标（头圆 + 身体 + 手臂 + 腿），手臂略向下倾斜
      return (
        <svg width="16" height="16" viewBox="0 0 16 20" fill="none" aria-hidden>
          {/* 头 */}
          <circle cx="8" cy="3.5" r="3" stroke="currentColor" strokeWidth={sw} />
          {/* 身体 */}
          <line x1="8" y1="7" x2="8" y2="11" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          {/* 手臂：略向下倾斜 */}
          <line x1="8" y1="8" x2="3" y2="10" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <line x1="8" y1="8" x2="13" y2="10" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          {/* 腿 */}
          <line x1="8" y1="11" x2="4" y2="17" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <line x1="8" y1="11" x2="12" y2="17" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case 'swimlane-v':
      // 垂直泳道：矩形 + 标题栏
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth={sw} />
          <line x1="6" y1="2" x2="6" y2="14" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'swimlane-h':
      // 水平泳道：矩形 + 标题栏横线
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth={sw} />
          <line x1="2" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'lifeline':
      // 时序图生命线：矩形 + 虚线
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="3" y="2" width="10" height="4" rx="1" stroke="currentColor" strokeWidth={sw} />
          <line x1="8" y1="6" x2="8" y2="14" stroke="currentColor" strokeWidth={sw} strokeDasharray="2 2" />
        </svg>
      );
    case 'activation':
      // 时序图激活框：带填充的窄矩形，与画布实际样式一致
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="5" y="2" width="6" height="12" fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case 'note':
      // 注释框：折角矩形
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 2 L12 2 L14 4 L14 14 L2 14 Z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
          <path d="M12 2 L12 4 L14 4" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case 'edge-line':
      // 直线箭头连线
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <line x1="2" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth={sw} />
          <path d="M12 8 L10 6 L10 10 Z" fill="currentColor" />
        </svg>
      );
    case 'edge-ortho':
      // 拐角箭头连线
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 4 L2 8 L14 8" stroke="currentColor" strokeWidth={sw} />
          <path d="M14 8 L12 6 L12 10 Z" fill="currentColor" />
        </svg>
      );
    case 'edge-dashed':
      // 虚线箭头连线
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <line x1="2" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth={sw} strokeDasharray="2 2" />
          <path d="M12 8 L10 6 L10 10 Z" fill="currentColor" />
        </svg>
      );
    case 'edge-no-arrow':
      // 无箭头连线
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * shape → maxGraph 样式对象（白板风格：无填充 + 中性灰描边）。
 * 注意：text 形状无填充无边框。
 */
function styleForShape(shape: GraphNodeShape, dark: boolean): Record<string, unknown> {
  const pal = paletteFor(shape, dark);
  const base: Record<string, unknown> = {
    fillColor: pal.fill,
    strokeColor: pal.stroke,
    strokeWidth: SHAPE_STROKE_WIDTH,
    fontSize: SHAPE_FONT_SIZE,
    fontColor: getFontColor(dark),
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
    // 连线类型
    case 'edge-line':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: 'classic', endSize: 8 };
    case 'edge-ortho':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, edgeStyle: 'orthogonalEdgeStyle', endArrow: 'classic', endSize: 8 };
    case 'edge-dashed':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, dashed: true, dashPattern: '4 4', endArrow: 'classic', endSize: 8 };
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

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

export function GraphCanvas({
  initialSnapshot,
  onChange,
  darkMode = false,
  className = '',
  rootElRef,
  editing = true,
}: GraphCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const undoManagerRef = useRef<UndoManager | null>(null);
  // 待绘制的模具：点了工具栏图形按钮后进入该态，下一次在画布上按住拖拽即划出该图形。
  // 用 ref 供事件回调读取，用 state 驱动光标/高亮 UI。
  const pendingShapeRef = useRef<GraphNodeShape | null>(null);
  const [pendingShape, setPendingShape] = useState<GraphNodeShape | null>(null);
  const setPending = useCallback((shape: GraphNodeShape | null) => {
    pendingShapeRef.current = shape;
    setPendingShape(shape);
  }, []);
  // 网格显隐开关（飞书/draw.io 都有，用户可关掉网格看整洁画布）。
  const [showGrid, setShowGrid] = useState(false); // 默认不显示网格
  // emit 桥接 ref：toggleGrid 定义早于 scheduleEmit（const TDZ），
  // 用 ref 间接调用，避免顺序依赖。
  const emitNowRef = useRef<() => void>(() => {});
  const toggleGrid = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    setShowGrid((prev) => {
      const next = !prev;
      // 同步更新 ref，让随后的 scheduleEmit 能读到新值（setShowGrid 是异步的）。
      showGridRef.current = next;
      // 引擎的网格吸附也随之开关（吸附只在网格显示时有意义）。
      graph.setGridEnabled(next);
      // 网格开关已持久化进 snapshot，触发 emit 保存。
      emitNowRef.current();
      return next;
    });
  }, []);
  // 暗色模式在初始化时读取一次即可（切换由下方 effect 处理容器底色）。
  const darkModeRef = useRef(darkMode);
  darkModeRef.current = darkMode;

  // Alt/Option 键按住态：用于切换「复制拖动」光标提示（Mac 的 Option 即 Alt，
  // event.altKey 能正确反映）。给用户一个可见反馈，确认复制拖动已就绪。
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(false);
    };
    // 监听 window 而非 root：拖动开始后焦点可能在画布子元素上，
    // window 级监听保证 Option 按下/抬起都能捕获到。
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onUp as EventListener); // 切窗时复位
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onUp as EventListener);
    };
  }, [editing]);

  const onChangeRef = useRef(onChange);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef(initialSnapshot);
  // 标记"正在以编程方式灌入快照"，避免回灌触发的 model change 又反向 emit 一次。
  const applyingRef = useRef(false);
  // showGrid 的 ref，供 emitSnapshot 读取最新值（无需进 emit 的依赖数组）。
  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 合并内部 rootRef 与父组件可选 ref。
  const setRootRef = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      rootElRef?.(el);
    },
    [rootElRef],
  );

  /* -------------------------------------------------------------- */
  /* 序列化（防抖）并 emit                                           */
  /* -------------------------------------------------------------- */

  const emitSnapshot = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    try {
      const snap = readSnapshotFromGraph(graph, showGridRef.current);
      const json = serializeGraphSnapshot(snap.nodes, snap.edges, snap.viewport, snap.showGrid);
      if (json === lastEmittedRef.current) return;
      lastEmittedRef.current = json;
      onChangeRef.current(json);
    } catch {
      /* ignore */
    }
  }, []);

  const scheduleEmit = useCallback(() => {
    if (applyingRef.current) return; // 程序化灌入不回传
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(emitSnapshot, 400);
  }, [emitSnapshot]);
  // 桥接：让早定义的 toggleGrid 能调用 scheduleEmit（绕过 const TDZ）。
  emitNowRef.current = scheduleEmit;

  /* -------------------------------------------------------------- */
  /* 初始化 maxGraph（仅一次）                                       */
  /* -------------------------------------------------------------- */

  // 只在首次挂载时读取初始快照（后续外部变化由下方 effect 同步）。
  const initialSnapshotRef = useRef(initialSnapshot);

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

    // 注册自定义形状到全局 ShapeRegistry（UML 图表：用例图角色、时序图生命线等）
    registerCustomShapes();

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
      connectionHandler.constraintHandler.pointImage = new ImageBox(
        createConnectionPointSVG(dark),
        CONNECTION_POINT_SIZE,
        CONNECTION_POINT_SIZE,
      );
      connectionHandler.constraintHandler.highlightColor = getConnectionPointColor(dark);
      // 关键：缩小连接点判定容差，让拉线判定不那么灵敏。
      // getTolerance 控制"鼠标离连接点多近才算悬停在连接点上"进而进入拉线模式。
      // 默认逻辑返回较大值（基于连接点图像尺寸），导致边缘附近按下容易误判为拉线而非拖动图形。
      // 覆写该方法返回固定 4 像素，只有鼠标几乎精确落在连接点上才触发连线（优先判定为拖动图形）。
      connectionHandler.constraintHandler.getTolerance = () => 4;
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
          edgeStyle: 'orthogonalEdgeStyle',
          strokeColor: getConnectionPointColor(dark),
          strokeWidth: 2,
          endArrow: 'classic',
          endSize: 8,
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

    // Alt/Option + 拖动 = 复制拖动（默认 isCloneEvent 判 Ctrl，这里改判 Alt，
    // 让 Ctrl/Cmd 空出来给"平移画布"用）。Mac 的 Option 即 Alt，altKey 能正确反映。
    graph.isCloneEvent = (evt: MouseEvent) => {
      const r = evt.altKey;
      // 诊断日志：确认 isCloneEvent 是否被调用、返回什么。排查复制不生效问题。
      // eslint-disable-next-line no-console
      console.log('[GraphCanvas] isCloneEvent → altKey:', r);
      return r;
    };
    // 必须启用 cellsCloneable，否则 isCloneEvent 返回 true 也不会触发复制
    graph.setCellsCloneable(true);

    // 禁用 RubberBandHandler 的 Alt 强制框选行为（否则 Alt+拖动图形会变成框选而非克隆）
    const rubberBandHandler = graph.getPlugin<RubberBandHandlerType>('RubberBandHandler');
    if (rubberBandHandler) {
      rubberBandHandler.isForceRubberbandEvent = () => false;
    }

    // Cmd/Ctrl + 拖动 = 平移画布（即使按在图形上也平移，而非移动图形）。
    const panningHandler = graph.getPlugin<PanningHandler>('PanningHandler');
    if (panningHandler) {
      panningHandler.isForcePanningEvent = (me) => {
        const evt = me.getEvent() as MouseEvent;
        return evt.metaKey || evt.ctrlKey;
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
      // 拖动预览颜色：跟随主题（浅色模式用蓝色，深色模式用浅蓝色）
      selectionHandler.previewColor = getSelectionColor(dark);
      // 启用 livePreview：移动图形时显示实际图形预览（而非矩形框）
      // maxLivePreview 默认为 0，需要设置一个较大值才能启用
      selectionHandler.maxLivePreview = 100;
      selectionHandler.allowLivePreview = true;
    }

    const defaultPal = paletteFor('rectangle', dark);
    const vertexDefault = graph.getStylesheet().getDefaultVertexStyle();
    vertexDefault.fillColor = defaultPal.fill;
    vertexDefault.strokeColor = defaultPal.stroke;
    vertexDefault.fontColor = getFontColor(dark);
    vertexDefault.strokeWidth = SHAPE_STROKE_WIDTH;
    vertexDefault.fontSize = SHAPE_FONT_SIZE;

    // 全局默认走正交连线（飞书手感：圆角折线 + 小箭头），线用中性灰细线。
    const edgeDefault = graph.getStylesheet().getDefaultEdgeStyle();
    edgeDefault.edgeStyle = 'orthogonalEdgeStyle';
    edgeDefault.rounded = true;
    edgeDefault.endArrow = 'classic';
    edgeDefault.strokeColor = getEdgeColor(dark);
    edgeDefault.strokeWidth = SHAPE_STROKE_WIDTH;
    edgeDefault.dashed = false; // 默认连线为实线，仅 edge-dashed 工具显式设为虚线

    // 为每个节点提供固定连接点：悬停边缘时高亮圆点锚点，
    // 从精确点位拖出连线，而非只能从整体边缘任意点连。
    // 针对时序图生命线/激活框做了专门分布，让消息箭头水平贴合。
    graph.getAllConnectionConstraints = (terminal: CellState | null) => {
      if (!terminal?.cell?.isVertex()) return null;

      const cellStyle = graph.getCellStyle(terminal.cell);
      const shapeStyle = cellStyle?.shape;

      // 时序图生命线 / 用例图角色：消息箭头沿中心虚线水平连接
      // 连接点沿中心垂直线均匀分布，密度适中（每 60px 一个），避免一长串蓝点。
      // 头部矩形补充顶部中点、左中、右中，让参与者块本身也能被连接。
      if (shapeStyle === 'lifeline' || shapeStyle === 'umlActor') {
        const nodeHeight = terminal.height ?? 150;
        const lifelineHeight = nodeHeight - HEAD_HEIGHT;
        const pointSpacing = 60;
        const pointCount = Math.max(4, Math.floor(lifelineHeight / pointSpacing));
        const constraints: ConnectionConstraint[] = [];
        for (let i = 0; i <= pointCount; i++) {
          const yOffset = (HEAD_HEIGHT + (lifelineHeight * i) / pointCount) / nodeHeight;
          constraints.push(new ConnectionConstraint(new Point(0.5, yOffset), true));
        }
        // 头部矩形连接点：顶部中点、左中、右中
        constraints.push(new ConnectionConstraint(new Point(0.5, 0), true));
        const headMidY = (HEAD_HEIGHT / 2) / nodeHeight;
        constraints.push(new ConnectionConstraint(new Point(0, headMidY), true));
        constraints.push(new ConnectionConstraint(new Point(1, headMidY), true));
        return constraints;
      }

      // 时序图激活框：消息箭头优先从左右边缘水平出入，同时保留上下边缘用于激活起止
      // 左右边缘按高度每 24px 一个点，并补充四角与四边中点。
      if (shapeStyle === 'umlActivation') {
        const nodeHeight = terminal.height ?? 60;
        const nodeWidth = terminal.width ?? 16;
        const pointSpacing = 24;
        const pointCount = Math.max(2, Math.floor(nodeHeight / pointSpacing));
        const constraints: ConnectionConstraint[] = [];

        for (let i = 0; i <= pointCount; i++) {
          const y = i / pointCount;
          constraints.push(new ConnectionConstraint(new Point(0, y), true));
          constraints.push(new ConnectionConstraint(new Point(1, y), true));
        }

        // 四角
        constraints.push(new ConnectionConstraint(new Point(0, 0), true));
        constraints.push(new ConnectionConstraint(new Point(1, 0), true));
        constraints.push(new ConnectionConstraint(new Point(0, 1), true));
        constraints.push(new ConnectionConstraint(new Point(1, 1), true));

        // 上下边中点（激活开始/结束）
        constraints.push(new ConnectionConstraint(new Point(0.5, 0), true));
        constraints.push(new ConnectionConstraint(new Point(0.5, 1), true));

        // 当激活框较宽时，补充左右边的中点，确保任意高度都能吸附
        if (nodeWidth >= 30) {
          constraints.push(new ConnectionConstraint(new Point(0, 0.5), true));
          constraints.push(new ConnectionConstraint(new Point(1, 0.5), true));
        }

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
    });

    // 双击空白（未命中任何 cell）→ 自适应全图（draw.io 同款）。
    graph.addListener(InternalEvent.DOUBLE_CLICK, (_s: unknown, evt: EventObject) => {
      const cell = evt.getProperty('cell') as Cell | undefined;
      if (!cell) {
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
    // 初始灌入产生的 edit 不应进 undo 历史。
    undoManager.clear();

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
      console.log('[GraphCanvas] mouseup | altKey:', e.altKey,
        '| selCount:', sel.length, '| isCloneEvent:', g.isCloneEvent(e));
    };
    container.addEventListener('mouseup', onMouseUpDiag, true);

    // Ctrl/Cmd + 滚轮缩放（draw.io 同款）；普通滚轮保留为平移/滚动。
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const g = graphRef.current;
      if (!g) return;
      const next = e.deltaY < 0 ? g.view.scale * 1.15 : g.view.scale / 1.15;
      if (next < ZOOM_MIN || next > ZOOM_MAX) return;
      if (e.deltaY < 0) g.zoomIn();
      else g.zoomOut();
    };
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('mousedown', onMouseDown, true);
      container.removeEventListener('mousemove', onMouseMove, true);
      container.removeEventListener('mouseup', finishDraw, true);
      container.removeEventListener('mouseup', onMouseUpDiag, true);
      preview.remove();
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

  /* -------------------------------------------------------------- */
  /* 外部快照变化 → 同步进画布                                       */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (initialSnapshot === lastEmittedRef.current) return; // 自己 emit 的，忽略
    if (detectSnapshotKind(initialSnapshot) !== 'jgraph' && initialSnapshot.trim() !== '') {
      return; // 非本内核格式，交由上层路由处理，这里不动
    }
    const parsed = parseGraphSnapshot(initialSnapshot);
    applyingRef.current = true;
    try {
      applySnapshotToGraph(graph, parsed, darkMode);
      // 恢复网格显隐状态（applySnapshotToGraph 已设引擎 gridEnabled，这里同步组件态）。
      if (typeof parsed.showGrid === 'boolean') {
        setShowGrid(parsed.showGrid);
      }
      lastEmittedRef.current = initialSnapshot;
    } finally {
      applyingRef.current = false;
    }
  }, [initialSnapshot]);

  /* -------------------------------------------------------------- */
  /* 暗色模式 / 编辑态切换                                           */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    // 只读：禁用所有编辑入口。
    graph.setEnabled(editing);
    graph.setCellsLocked(!editing);
  }, [editing]);

  // 暗色模式切换时更新所有跟随主题的颜色
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const color = getSelectionColor(darkMode);

    // 更新选中框颜色
    VertexHandlerConfig.selectionColor = color;
    
    // 更新手柄颜色
    HandleConfig.fillColor = getHandleFillColor(darkMode);
    HandleConfig.strokeColor = getHandleStrokeColor(darkMode);
    
    // 更新连接点样式（maxGraph 中为 ConstraintHandler 实例属性）
    const connectionHandler = graph.getPlugin<ConnectionHandler>('ConnectionHandler');
    if (connectionHandler?.constraintHandler) {
      connectionHandler.constraintHandler.pointImage = new ImageBox(
        createConnectionPointSVG(darkMode),
        CONNECTION_POINT_SIZE,
        CONNECTION_POINT_SIZE,
      );
      connectionHandler.constraintHandler.highlightColor = getConnectionPointColor(darkMode);
    }

    // 更新拖动预览颜色（SelectionHandler）
    const selectionHandler = graph.getPlugin<SelectionHandler>('SelectionHandler');
    if (selectionHandler) {
      selectionHandler.previewColor = color;
    }

    // 更新默认样式（影响新建图形）
    const defaultPal = paletteFor('rectangle', darkMode);
    const vertexDefault = graph.getStylesheet().getDefaultVertexStyle();
    vertexDefault.fillColor = defaultPal.fill;
    vertexDefault.strokeColor = defaultPal.stroke;
    vertexDefault.fontColor = getFontColor(darkMode);
    
    const edgeDefault = graph.getStylesheet().getDefaultEdgeStyle();
    edgeDefault.strokeColor = getEdgeColor(darkMode);

    // 刷新视图让更改生效
    graph.getView().validate();
    graph.refresh();
  }, [darkMode]);

  /* -------------------------------------------------------------- */
  /* 键盘：Del 删除 / Cmd+Z 撤销 / Cmd+C·V·D 复制粘贴克隆 / 方向键微移 */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    if (!editing) return;
    const root = rootRef.current;
    if (!root) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const graph = graphRef.current;
      const undo = undoManagerRef.current;
      if (!graph) return;
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // 正在内联编辑文本时，交给 CellEditor，不拦截。
      if (graph.isEditing()) return;

      // ESC：退出待绘制态。
      if (e.key === 'Escape') {
        if (pendingShapeRef.current) {
          e.preventDefault();
          setPending(null);
        }
        return;
      }

      if (meta && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) undo?.redo();
        else undo?.undo();
        return;
      }
      // 复制 / 剪切 / 粘贴（引擎内置剪贴板，跨画板实例可用）。
      if (meta && key === 'c') {
        if (graph.getSelectionCells().length > 0) {
          e.preventDefault();
          Clipboard.copy(graph);
        }
        return;
      }
      if (meta && key === 'x') {
        if (graph.getSelectionCells().length > 0) {
          e.preventDefault();
          Clipboard.cut(graph);
        }
        return;
      }
      if (meta && key === 'v') {
        if (!Clipboard.isEmpty()) {
          e.preventDefault();
          Clipboard.paste(graph);
        }
        return;
      }
      // Cmd/Ctrl + D：原地克隆当前选中并偏移一格。
      if (meta && key === 'd') {
        const cells = graph.getSelectionCells();
        if (cells.length > 0) {
          e.preventDefault();
          graph.batchUpdate(() => {
            const clones = graph.cloneCells(cells);
            const moved = graph.importCells(clones, GRID_SIZE, GRID_SIZE, graph.getDefaultParent());
            graph.setSelectionCells(moved);
          });
        }
        return;
      }
      // 方向键微移：默认 1 格网格，Shift 一次移 1px 精调。
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        const cells = graph.getSelectionCells();
        if (cells.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : GRID_SIZE;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        graph.moveCells(cells, dx, dy);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const cells = graph.getSelectionCells();
        if (cells.length > 0) {
          e.preventDefault();
          graph.removeCells(cells);
        }
      }
    };

    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [editing]);

  /* -------------------------------------------------------------- */
  /* 工具栏：点图形按钮 → 进入"待绘制"态，随后在画布上拖拽划出         */
  /* 位置与大小；再点同一按钮 / ESC 取消。                            */
  /* -------------------------------------------------------------- */

  const togglePending = useCallback(
    (shape: GraphNodeShape) => {
      setPending(pendingShapeRef.current === shape ? null : shape);
    },
    [setPending],
  );

  const handleUndo = useCallback(() => undoManagerRef.current?.undo(), []);
  const handleRedo = useCallback(() => undoManagerRef.current?.redo(), []);
  const handleDelete = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const cells = graph.getSelectionCells();
    if (cells.length > 0) graph.removeCells(cells);
  }, []);

  const handleZoomIn = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || graph.view.scale >= ZOOM_MAX) return;
    graph.zoomIn();
  }, []);
  const handleZoomOut = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || graph.view.scale <= ZOOM_MIN) return;
    graph.zoomOut();
  }, []);
  // 自适应：有内容则 fitCenter 全图，无内容则回到 100%。
  const handleFit = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
    if (hasCells) {
      graph.getPlugin<FitPlugin>('fit')?.fitCenter({ margin: 24 });
    } else {
      graph.zoomActual();
    }
  }, []);

  /* -------------------------------------------------------------- */
  /* 工具栏按钮定义                                                  */
  /* -------------------------------------------------------------- */

  const shapeTools = useMemo(
    () =>
      [
        // 基础图形
        { shape: 'rectangle' as const, title: '矩形' },
        { shape: 'rounded' as const, title: '圆角矩形' },
        { shape: 'ellipse' as const, title: '椭圆' },
        { shape: 'diamond' as const, title: '菱形' },
        { shape: 'text' as const, title: '文本' },
        { shape: 'note' as const, title: '注释框' },
        // 用例图
        { shape: 'actor' as const, title: '角色（用例图）' },
        // 泳道图
        { shape: 'swimlane-v' as const, title: '垂直泳道' },
        { shape: 'swimlane-h' as const, title: '水平泳道' },
        // 时序图
        { shape: 'lifeline' as const, title: '生命线（时序图）' },
        { shape: 'activation' as const, title: '激活框（时序图）' },
      ] satisfies { shape: GraphNodeShape; title: string }[],
    [],
  );

  return (
    <div
      ref={setRootRef}
      tabIndex={editing ? 0 : -1}
      className={`jgraph-canvas-root ${className} ${
        editing ? 'is-editing' : 'is-readonly'
      } ${darkMode ? 'is-dark' : ''} ${pendingShape ? 'is-drawing' : ''} ${
        showGrid ? '' : 'is-grid-off'
      } ${altHeld ? 'is-alt-held' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        position: 'relative',
        display: 'flex',
      }}
    >
      {/* 左侧模具 / 操作工具栏 —— 仅编辑态显示 */}
      {editing && (
        <div className="jgraph-toolbar">
          {shapeTools.map(({ shape, title }) => (
            <button
              key={shape}
              type="button"
              className={`jgraph-tool-btn ${pendingShape === shape ? 'is-active' : ''}`}
              title={`${title}｜点击后在画布拖拽划定大小`}
              onClick={() => togglePending(shape)}
            >
              <ShapeGlyph shape={shape} />
            </button>
          ))}
          <div className="jgraph-tool-sep" />
          <button
            type="button"
            className="jgraph-tool-btn"
            title="撤销（⌘Z）"
            onClick={handleUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="jgraph-tool-btn"
            title="重做（⌘⇧Z）"
            onClick={handleRedo}
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            className="jgraph-tool-btn"
            title="删除选中（Del）"
            onClick={handleDelete}
          >
            <Trash2 size={16} />
          </button>
          <div className="jgraph-tool-sep" />
          <button
            type="button"
            className="jgraph-tool-btn"
            title="放大（⌘滚轮）"
            onClick={handleZoomIn}
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            className="jgraph-tool-btn"
            title="缩小（⌘滚轮）"
            onClick={handleZoomOut}
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            className="jgraph-tool-btn"
            title="适应画布（双击空白）"
            onClick={handleFit}
          >
            <Maximize size={16} />
          </button>
          <button
            type="button"
            className={`jgraph-tool-btn ${showGrid ? 'is-active' : ''}`}
            title={showGrid ? '隐藏网格' : '显示网格'}
            onClick={toggleGrid}
          >
            <Grid3x3 size={16} />
          </button>
        </div>
      )}

      {/* maxGraph 渲染容器 */}
      <div
        ref={containerRef}
        className="jgraph-surface"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}

// 静态分析占位：保证 Cell 类型被引用（graphModel 中使用）。
export type { Cell };
