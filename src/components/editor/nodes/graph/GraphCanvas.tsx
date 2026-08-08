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
  type CellStyle,
  type InternalMouseEvent,
  type ConnectionHandler,
  type EventObject,
  type SelectionHandler,
  type FitPlugin,
  type PanningHandler,
  type RubberBandHandler as RubberBandHandlerType,
  type GraphPluginConstructor,
  styleUtils,
  eventUtils,
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
  SquareStack,
  FileDown,
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  MoveRight,
  Reply,
  Shapes,
  MoreHorizontal,
  Check,
} from 'lucide-react';

import { logger } from '../../../../lib/core/logger';

import {
  detectSnapshotKind,
  parseGraphSnapshot,
  serializeGraphSnapshot,
  type GraphNodeShape,
  type LabelAlign,
} from './graphSnapshot';
import { applySnapshotToGraph, readSnapshotFromGraph, styleToNodeShape } from './graphModel';
import { registerCustomShapes, HEAD_HEIGHT } from './customShapes';
import { registerObstacleEdgeStyle } from './obstacleRouting';
import MermaidImportDialog from './MermaidImportDialog';
import AIGraphImportDialog from './AIGraphImportDialog';
import {
  paletteFor,
  getSelectionColor,
  getHandleFillColor,
  getHandleStrokeColor,
  getConnectionPointColor,
  getEdgeColor,
  getFontColor,
  getTopicFontColor,
  fontColorFor,
  mapFillColor,
  fillPresetsFor,
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
import { ShapeGlyph } from './ShapeGlyph';
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

/** 边数超过此阈值时自动关闭连线流动动画，保证大图流畅。 */
const FLOW_ANIMATION_THRESHOLD = 20;

/** 边框命中容差（屏幕像素），转换为图坐标后使用 */
const BORDER_TOLERANCE_PX = 8;

/**
 * 判断点 (x, y) 是否落在 cell state 的边框上（而非内部）。
 * 原理：点在外扩矩形（bounds ± tol）内，且不在内缩矩形内部。
 * 支持旋转：将点击点逆旋转到图形局部坐标系后再做矩形判定。
 */
function isOnBorder(state: CellState, x: number, y: number, tol: number): boolean {
  let px = x;
  let py = y;
  const rotation = state.style?.rotation;
  if (rotation) {
    const alpha = (rotation * Math.PI) / 180;
    const cos = Math.cos(-alpha);
    const sin = Math.sin(-alpha);
    const cx = state.getCenterX();
    const cy = state.getCenterY();
    const dx = x - cx;
    const dy = y - cy;
    px = dx * cos - dy * sin + cx;
    py = dx * sin + dy * cos + cy;
  }
  const inOuter =
    px >= state.x - tol &&
    px <= state.x + state.width + tol &&
    py >= state.y - tol &&
    py <= state.y + state.height + tol;
  if (!inOuter) return false;
  const inInner =
    px > state.x + tol &&
    px < state.x + state.width - tol &&
    py > state.y + tol &&
    py < state.y + state.height - tol;
  return !inInner;
}

/* ------------------------------------------------------------------ */
/* 思维导图生发辅助函数                                                */
/*                                                                    */
/* spawnMindmapChild：在父节点右侧生成子节点 + 连线，自动进入编辑。     */
/* spawnMindmapSibling：在当前节点下方生成同级兄弟节点 + 连线。         */
/*                                                                    */
/* 布局策略（简单版）：                                                 */
/*   - 子节点：父节点右侧偏移 GAP_X，Y 与父节点对齐。                    */
/*     若已有子节点，新子节点放在最下方子节点再偏移一行。               */
/*   - 兄弟节点：当前节点下方偏移一行（h + GAP_Y）。                    */
/*                                                                    */
/* 连线：父子/兄弟关系用无箭头正交连线（思维导图风格）。                */
/* ------------------------------------------------------------------ */

/** 父子节点水平间距（图坐标 px）。 */
const MINDMAP_GAP_X = 60;
/** 兄弟节点垂直间距（图坐标 px）。 */
const MINDMAP_GAP_Y = 16;
/** 思维导图连线样式：无箭头正交，跟随主题连线色。 */
function mindmapEdgeStyle(dark: boolean): CellStyle {
  return {
    edgeStyle: 'obstacleEdgeStyle',
    rounded: true,
    endArrow: 'none',
    startArrow: 'none',
    endSize: ARROW_END_SIZE,
    strokeColor: getEdgeColor(dark),
    strokeWidth: SHAPE_STROKE_WIDTH,
    fontSize: SHAPE_FONT_SIZE,
    fontColor: getFontColor(dark),
    labelBackgroundColor: getLabelBackgroundColor(dark),
  };
}

/** 生成唯一 cell id。 */
function nextCellId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 在父节点右侧生发一个子节点，并自动进入文本编辑。
 * 若父节点已有子节点（通过出边查找），新子节点放在最下方子节点之后。
 */
function spawnMindmapChild(graph: Graph, parentCell: Cell, dark: boolean): void {
  const parentGeo = parentCell.getGeometry();
  if (!parentGeo) return;
  const parent = graph.getDefaultParent();
  const size = DEFAULT_SIZE['topic'];

  // 查找已有子节点（parentCell 作为 source 的边的 target）
  const outEdges = graph.getOutgoingEdges(parentCell, parent);
  let newY = parentGeo.y;
  for (const edge of outEdges) {
    const target = edge.getTerminal(false);
    if (!target) continue;
    const geo = target.getGeometry();
    if (!geo) continue;
    newY = Math.max(newY, geo.y + geo.height + MINDMAP_GAP_Y);
  }

  const newX = parentGeo.x + parentGeo.width + MINDMAP_GAP_X;

  graph.batchUpdate(() => {
    const childCell = graph.insertVertex({
      parent,
      id: nextCellId('n'),
      value: '子主题',
      position: [newX, newY],
      size: [size.w, size.h],
      style: styleForShape('topic', dark),
    });
    graph.insertEdge({
      parent,
      id: nextCellId('e'),
      value: '',
      source: parentCell,
      target: childCell,
      style: mindmapEdgeStyle(dark),
    });
    graph.setSelectionCell(childCell);
  });

  // 等渲染完成后进入文本编辑。
  requestAnimationFrame(() => {
    const cell = graph.getSelectionCell();
    if (cell) graph.startEditingAtCell(cell);
  });
}

/**
 * 在当前节点下方生发一个同级兄弟节点（共享同一父节点），并自动进入文本编辑。
 * 若当前节点无父节点（根节点），则直接在下方生成一个独立节点（无连线）。
 */
function spawnMindmapSibling(graph: Graph, currentCell: Cell, dark: boolean): void {
  const curGeo = currentCell.getGeometry();
  if (!curGeo) return;
  const parent = graph.getDefaultParent();
  const size = DEFAULT_SIZE['topic'];

  // 查找父节点：当前节点作为 target 的入边的 source。
  const inEdges = graph.getIncomingEdges(currentCell, parent);
  const parentNode = inEdges.length > 0 ? inEdges[0].getTerminal(true) : null;

  const newX = curGeo.x;
  const newY = curGeo.y + curGeo.height + MINDMAP_GAP_Y;

  graph.batchUpdate(() => {
    const siblingCell = graph.insertVertex({
      parent,
      id: nextCellId('n'),
      value: '分支主题',
      position: [newX, newY],
      size: [size.w, size.h],
      style: styleForShape('topic', dark),
    });
    if (parentNode) {
      graph.insertEdge({
        parent,
        id: nextCellId('e'),
        value: '',
        source: parentNode,
        target: siblingCell,
        style: mindmapEdgeStyle(dark),
      });
    }
    graph.setSelectionCell(siblingCell);
  });

  requestAnimationFrame(() => {
    const cell = graph.getSelectionCell();
    if (cell) graph.startEditingAtCell(cell);
  });
}

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


/** 填充色预设面板由 graphTheme.fillPresetsFor(dark) 提供——双套色板，随主题切换。 */

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
  // 时序图时序图自动附加块开关：开启时从生命线拖消息到生命线会自动生成 activation，
  // 关闭时只画水平消息线、不自动生成活动块（简洁时序图场景）。
  const [autoActivation, setAutoActivation] = useState(false); // 默认关闭
  // 选中 cell 的文字对齐方式（null 表示无选中或不支持）。
  const [selectedLabelAlign, setSelectedLabelAlign] = useState<LabelAlign | null>(null);
  // 选中 vertex 的填充色（null 表示无选中或边线选中）。'none' = 无填充。
  const [selectedFillColor, setSelectedFillColor] = useState<string | null>(null);
  // 选中边是时序图消息时：'call'（实线调用）/ 'return'（虚线返回）；否则 null。
  // 用于显示"调用/返回切换"按钮——算法判定不准时用户可手动翻转。
  const [selectedSeqEdge, setSelectedSeqEdge] = useState<'call' | 'return' | null>(null);
  // 填充色弹出面板开关
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const fillPickerRef = useRef<HTMLDivElement>(null);
  // 形状下拉菜单 & 更多菜单开关（收纳工具栏按钮，减少平铺）
  const [shapesMenuOpen, setShapesMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const shapesMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  // 形状菜单 hover 延迟关闭定时器（鼠标穿越 trigger→menu 间隙时防误关）。
  const shapesHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最近使用的形状 LRU 队列（最近优先，最多 4 个），用于下拉菜单顶部快速复用 +
  // trigger 按钮默认显示最近一个形状的 glyph。
  const [recentShapes, setRecentShapes] = useState<GraphNodeShape[]>([]);
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
  // 切换时序图自动附加块开关。isEnabled 回调在 graph 初始化时已绑定，运行时动态读取 ref，
  // 无需重建 graph，切换后立即对后续连线生效。开关状态持久化进快照。
  const toggleAutoActivation = useCallback(() => {
    setAutoActivation((prev) => {
      const next = !prev;
      autoActivationRef.current = next;
      emitNowRef.current();
      return next;
    });
  }, []);
  // 暗色模式在初始化时读取一次即可（切换由下方 effect 处理容器底色）。
  const darkModeRef = useRef(darkMode);
  darkModeRef.current = darkMode;

  // Cmd/Ctrl 键按住态：用于切换「复制拖动」光标提示。给用户一个可见反馈，确认复制拖动已就绪。
  const [cloneHeld, setCloneHeld] = useState(false);
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') setCloneHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') setCloneHeld(false);
    };
    // 监听 window 而非 root：拖动开始后焦点可能在画布子元素上，
    // window 级监听保证 Cmd/Ctrl 按下/抬起都能捕获到。
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
  // autoActivation 的 ref，供 emitSnapshot + isEnabled 回调读取最新值。
  const autoActivationRef = useRef(autoActivation);
  autoActivationRef.current = autoActivation;
  // 流动动画开关 ref：边数超过阈值时给容器加 .jgraph-flow-off 类关闭 CSS 动画。
  // 用 ref 间接调用，避免 useEffect 内外 TDZ 顺序依赖。
  const updateFlowAnimationRef = useRef<() => void>(() => {});

  // Mermaid 导入对话框状态
  const [mermaidDialogOpen, setMermaidDialogOpen] = useState(false);
  // AI 生成图表对话框状态
  const [aiGraphDialogOpen, setAiGraphDialogOpen] = useState(false);

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
      const snap = readSnapshotFromGraph(graph, showGridRef.current, autoActivationRef.current);
      const json = serializeGraphSnapshot(snap.nodes, snap.edges, snap.viewport, snap.showGrid, snap.autoActivation);
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
      updateFlowAnimationRef.current();
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
      // 使用指数缩放 + 以光标为锚点，步进细腻连续，手感与 Excalidraw / draw.io 一致。
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
      // 恢复时序图自动附加块开关（缺省保持默认 true）。
      if (typeof parsed.autoActivation === 'boolean') {
        setAutoActivation(parsed.autoActivation);
        autoActivationRef.current = parsed.autoActivation;
      }
      lastEmittedRef.current = initialSnapshot;
      // 外部快照同步后，根据边数决定是否开启动画。
      updateFlowAnimationRef.current();
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
    if (!editing) graph.clearSelection();
  }, [editing]);

  // 主题色刷新：暗色切换 / 同模式下切换主题（jstudio-light → ink-light）都走这条路径。
  // 读 darkModeRef.current 以保证事件回调里拿到最新值（事件触发时组件未必重渲染）。
  const applyThemeColors = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const dark = darkModeRef.current;

    const color = getSelectionColor(dark);

    // 更新选中框颜色
    VertexHandlerConfig.selectionColor = color;

    // 更新手柄颜色
    HandleConfig.fillColor = getHandleFillColor(dark);
    HandleConfig.strokeColor = getHandleStrokeColor(dark);

    // 更新连接点样式（maxGraph 中为 ConstraintHandler 实例属性）
    const connectionHandler = graph.getPlugin<ConnectionHandler>('ConnectionHandler');
    if (connectionHandler?.constraintHandler) {
      connectionHandler.constraintHandler.pointImage = new ImageBox(
        createConnectionPointSVG(dark),
        CONNECTION_POINT_SIZE,
        CONNECTION_POINT_SIZE,
      );
      connectionHandler.constraintHandler.highlightColor = getConnectionPointColor(dark);
    }

    // 更新拖动预览颜色（SelectionHandler）
    const selectionHandler = graph.getPlugin<SelectionHandler>('SelectionHandler');
    if (selectionHandler) {
      selectionHandler.previewColor = color;
    }

    // 更新默认样式（影响新建图形）
    const defaultPal = paletteFor('rectangle', dark);
    const vertexDefault = graph.getStylesheet().getDefaultVertexStyle();
    vertexDefault.fillColor = defaultPal.fill;
    vertexDefault.strokeColor = defaultPal.stroke;
    vertexDefault.fontColor = getFontColor(dark);

    const edgeDefault = graph.getStylesheet().getDefaultEdgeStyle();
    edgeDefault.strokeColor = getEdgeColor(dark);

    // 更新已存在 cell 的样式：让画板上的图形跟着主题变色。
    // maxGraph 在 cell 创建时把样式烘焙到 cell 上，不会从默认 stylesheet 重新解析，
    // 因此切换主题时必须主动遍历刷新。仅刷新颜色（fill/stroke/font），
    // 保留结构属性（shape/rounded/edgeStyle/arrows 等）。
    graph.batchUpdate(() => {
      const parent = graph.getDefaultParent();
      const cells = graph.getChildCells(parent, true, true);
      for (const cell of cells) {
        const oldStyle = (cell.getStyle() as CellStyle) ?? {};
        if (cell.isVertex()) {
          const shape = styleToNodeShape(oldStyle);
          const pal = paletteFor(shape, dark);
          // 用户填充色走双套色板映射（已知色 ↔ 对应明暗变体，未知自定义色保留），
          // 避免"深色模式把字刷白、浅色填充保留"导致的白字浅底不可读。
          const oldFill = oldStyle.fillColor;
          const newFill =
            oldFill && oldFill !== 'none' ? mapFillColor(oldFill, dark) : pal.fill;
          // topic 节点字色硬编码蓝色（不跟随主题 accent），其余形状按填充亮度自适应。
          const newFontColor =
            shape === 'topic'
              ? getTopicFontColor(dark)
              : fontColorFor(newFill, dark);
          graph.getDataModel().setStyle(cell, {
            ...oldStyle,
            fillColor: newFill,
            strokeColor: pal.stroke,
            fontColor: newFontColor,
          });
        } else if (cell.isEdge()) {
          graph.getDataModel().setStyle(cell, {
            ...oldStyle,
            strokeColor: getEdgeColor(dark),
            // 边标签底色与画布一致，字色跟随主题。
            fontColor: getFontColor(dark),
          });
        }
      }
    });

    // 刷新视图让更改生效
    graph.getView().validate();
    graph.refresh();
  }, []);

  // 暗色模式切换时刷新所有跟随主题的颜色
  useEffect(() => {
    applyThemeColors();
  }, [darkMode, applyThemeColors]);

  // 同模式下切换主题（jstudio-light → ink-light）：applyAppTheme 更新 <html> 上的
  // CSS 变量后派发 'apptheme-change' 事件，这里监听并重新读取 accent 色。
  // darkMode 未变，但 --vscode-focusBorder 已更新，需重新刷一遍连线/选中/连接点。
  useEffect(() => {
    const handler = () => applyThemeColors();
    window.addEventListener('apptheme-change', handler);
    return () => window.removeEventListener('apptheme-change', handler);
  }, [applyThemeColors]);

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

      // 思维导图 topic 节点：Tab 生发子节点，Enter 生发同级兄弟节点。
      // 仅当唯一选中是 topic 形状时触发，避免与编辑器其他 Tab/Enter 行为冲突。
      if (e.key === 'Tab' || e.key === 'Enter') {
        const sel = graph.getSelectionCells();
        if (sel.length === 1 && sel[0].isVertex()) {
          const cellStyle = graph.getCurrentCellStyle(sel[0]);
          const shape = styleToNodeShape(cellStyle);
          if (shape === 'topic') {
            e.preventDefault();
            if (e.key === 'Tab') {
              spawnMindmapChild(graph, sel[0], darkModeRef.current);
            } else {
              spawnMindmapSibling(graph, sel[0], darkModeRef.current);
            }
            return;
          }
        }
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

  // 将某形状提升到 LRU 队首（去重，上限 4）。
  const recordShapeUse = useCallback((shape: GraphNodeShape) => {
    setRecentShapes((prev) => [shape, ...prev.filter((s) => s !== shape)].slice(0, 4));
  }, []);

  // 从下拉菜单选形状：记录 LRU + toggle 选中态 + 关闭菜单。
  const handleSelectShape = useCallback(
    (shape: GraphNodeShape) => {
      recordShapeUse(shape);
      togglePending(shape);
      setShapesMenuOpen(false);
    },
    [recordShapeUse, togglePending],
  );

  // 形状菜单 hover 展开：鼠标进入立即打开，离开延迟 200ms 关闭
  // （给鼠标穿越 trigger → menu 6px 间隙留出缓冲）。
  const handleShapesEnter = useCallback(() => {
    if (shapesHoverTimer.current) {
      clearTimeout(shapesHoverTimer.current);
      shapesHoverTimer.current = null;
    }
    setShapesMenuOpen(true);
  }, []);

  const handleShapesLeave = useCallback(() => {
    shapesHoverTimer.current = setTimeout(() => {
      setShapesMenuOpen(false);
      shapesHoverTimer.current = null;
    }, 200);
  }, []);

  const handleUndo = useCallback(() => undoManagerRef.current?.undo(), []);
  const handleRedo = useCallback(() => undoManagerRef.current?.redo(), []);
  const handleDelete = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const cells = graph.getSelectionCells();
    if (cells.length > 0) graph.removeCells(cells);
  }, []);

  // 设置选中 cell 的文字水平对齐方式。
  const handleSetLabelAlign = useCallback((align: LabelAlign) => {
    const graph = graphRef.current;
    if (!graph) return;
    const cells = graph.getSelectionCells();
    if (cells.length === 0) return;
    graph.setCellStyles('align', align, cells);
    setSelectedLabelAlign(align);
  }, []);

  // 切换时序图消息的 调用（实线 classic）/ 返回（虚线 openThin）语义。
  // open-call 启发式无法区分"C 直接返回 A"和"C 调用 A 的新接口"（几何上是同一手势），
  // 由用户点这个按钮做最终判断；翻转结果会反过来影响后续消息的自动判定。
  const handleToggleSeqMessage = useCallback(() => {
    const graph = graphRef.current;
    const cell = graph?.getSelectionCell();
    if (!graph || !cell?.isEdge()) return;
    const style = (cell.getStyle() as CellStyle | null) ?? {};
    const isReturn = style.dashed === true;
    graph.getDataModel().setStyle(cell, {
      ...style,
      dashed: !isReturn,
      endArrow: isReturn ? 'classic' : 'openThin',
    });
    setSelectedSeqEdge(isReturn ? 'call' : 'return');
  }, []);

  // 设置选中 vertex 的填充色。color='none' 表示清除填充（透明）。
  const handleSetFillColor = useCallback((color: string) => {
    const graph = graphRef.current;
    if (!graph) return;
    const cells = graph.getSelectionCells().filter((c) => c.isVertex());
    if (cells.length === 0) return;
    graph.setCellStyles('fillColor', color, cells);
    // 字色随填充自适应：浅底深字、深底浅字，'none' 用主题字色。
    graph.setCellStyles(
      'fontColor',
      fontColorFor(color === 'none' ? undefined : color, darkModeRef.current),
      cells,
    );
    setSelectedFillColor(color);
    setFillPickerOpen(false);
    // 手动触发快照回传（setCellStyles 不一定触发 model change 事件）。
    emitNowRef.current?.();
  }, []);

  // 点击外部关闭填充色弹出面板。
  useEffect(() => {
    if (!fillPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (fillPickerRef.current && !fillPickerRef.current.contains(e.target as Node)) {
        setFillPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [fillPickerOpen]);

  // 点击外部关闭形状 / 更多下拉菜单。
  useEffect(() => {
    if (!shapesMenuOpen && !moreMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (shapesMenuRef.current && !shapesMenuRef.current.contains(e.target as Node)) {
        setShapesMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [shapesMenuOpen, moreMenuOpen]);

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

  // 把导入的快照应用到画板——Mermaid 导入与 AI 生成共用。
  // parse → batchUpdate 灌入 → fitCenter 自适应 → 同步 lastEmitted/onChange。
  const applyImportedSnapshot = useCallback((snapshotJson: string) => {
    const graph = graphRef.current;
    if (!graph) return;
    const parsed = parseGraphSnapshot(snapshotJson);
    applyingRef.current = true;
    try {
      graph.batchUpdate(() => {
        applySnapshotToGraph(graph, parsed, darkModeRef.current);
      });
      // 导入后自适应显示
      const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
      if (hasCells) {
        graph.getPlugin<FitPlugin>('fit')?.fitCenter({ margin: 24 });
      }
      lastEmittedRef.current = snapshotJson;
      onChangeRef.current(snapshotJson);
      // 导入后根据边数决定是否开启动画。
      updateFlowAnimationRef.current();
    } finally {
      applyingRef.current = false;
    }
  }, []);

  // Mermaid 导入处理
  const handleMermaidImport = useCallback(
    (snapshotJson: string) => applyImportedSnapshot(snapshotJson),
    [applyImportedSnapshot],
  );

  // AI 生成图表导入处理
  const handleAiGraphImport = useCallback(
    (snapshotJson: string) => applyImportedSnapshot(snapshotJson),
    [applyImportedSnapshot],
  );

  /* -------------------------------------------------------------- */
  /* 工具栏按钮定义                                                  */
  /* -------------------------------------------------------------- */

  const shapeGroups = useMemo(
    () =>
      [
        {
          label: '基础图形',
          shapes: [
            { shape: 'rectangle' as const, title: '矩形' },
            { shape: 'rounded' as const, title: '圆角矩形' },
            { shape: 'ellipse' as const, title: '椭圆' },
            { shape: 'diamond' as const, title: '菱形' },
            { shape: 'text' as const, title: '文本' },
            { shape: 'note' as const, title: '注释框' },
            { shape: 'database' as const, title: '数据库' },
          ],
        },
        {
          label: '思维导图',
          shapes: [
            { shape: 'topic' as const, title: '主题节点' },
          ],
        },
        {
          label: '泳道图',
          shapes: [
            { shape: 'swimlane-v' as const, title: '垂直泳道' },
            { shape: 'swimlane-h' as const, title: '水平泳道' },
          ],
        },
        {
          label: '时序图',
          shapes: [
            { shape: 'lifeline' as const, title: '生命线' },
            { shape: 'actor' as const, title: '角色' },
          ],
        },
      ] satisfies {
        label: string;
        shapes: { shape: GraphNodeShape; title: string }[];
      }[],
    // activation 已从工具栏移除：手绘时序图时，从 lifelineA 拖消息到 lifelineB
    // 会自动在 B 上生成 activation（可用工具栏开关关闭）。shape 定义保留（AI 生成和旧数据仍能用）。
    [],
  );

  // 形状 -> 中文标题 的扁平查找表，供 LRU 队列渲染标题用。
  const shapeTitleMap = useMemo(() => {
    const m = new Map<GraphNodeShape, string>();
    for (const g of shapeGroups) for (const s of g.shapes) m.set(s.shape, s.title);
    return m;
  }, [shapeGroups]);

  return (
    <div
      ref={setRootRef}
      tabIndex={editing ? 0 : -1}
      className={`jgraph-canvas-root ${className} ${
        editing ? 'is-editing' : 'is-readonly'
      } ${darkMode ? 'is-dark' : ''} ${pendingShape ? 'is-drawing' : ''} ${
        showGrid ? '' : 'is-grid-off'
      } ${cloneHeld ? 'is-clone-held' : ''}`}
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
          {/* 形状全量菜单：hover 展开，按类别分区 */}
          <div
            className="jgraph-dropdown"
            ref={shapesMenuRef}
            onMouseEnter={handleShapesEnter}
            onMouseLeave={handleShapesLeave}
          >
            <button
              type="button"
              className="jgraph-tool-btn"
              title="全部形状｜悬停展开选择"
              onClick={() => setShapesMenuOpen(true)}
            >
              <Shapes size={16} />
            </button>
            {shapesMenuOpen && (
              <div className="jgraph-dropdown-menu" role="presentation">
                {shapeGroups.map((group, gi) => (
                  <div key={group.label}>
                    {gi > 0 && <div className="jgraph-dropdown-sep" />}
                    <div className="jgraph-dropdown-section-label">{group.label}</div>
                    {group.shapes.map(({ shape, title }) => (
                      <button
                        key={shape}
                        type="button"
                        className={`jgraph-dropdown-item ${pendingShape === shape ? 'is-active' : ''}`}
                        title={`${title}｜点击后在画布拖拽划定大小`}
                        onClick={() => handleSelectShape(shape)}
                      >
                        <ShapeGlyph shape={shape} />
                        <span>{title}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* LRU 最近使用：平铺在 Shapes 入口右侧，竖线分隔，免去展开菜单 */}
          {recentShapes.length > 0 && (
            <>
              <div className="jgraph-tool-sep" />
              {recentShapes.map((shape) => (
                <button
                  key={`lru-${shape}`}
                  type="button"
                  className={`jgraph-tool-btn ${pendingShape === shape ? 'is-active' : ''}`}
                  title={`${shapeTitleMap.get(shape) ?? shape}｜点击后在画布拖拽划定大小`}
                  onClick={() => handleSelectShape(shape)}
                >
                  <ShapeGlyph shape={shape} />
                </button>
              ))}
            </>
          )}
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
          {selectedSeqEdge && (
            <>
              <div className="jgraph-tool-sep" />
              <button
                type="button"
                className="jgraph-tool-btn"
                title={
                  selectedSeqEdge === 'return'
                    ? '切换为调用消息（实线）'
                    : '切换为返回消息（虚线）'
                }
                onClick={handleToggleSeqMessage}
              >
                {selectedSeqEdge === 'return' ? (
                  <MoveRight size={16} />
                ) : (
                  <Reply size={16} />
                )}
              </button>
            </>
          )}
          {selectedLabelAlign && (
            <>
              <div className="jgraph-tool-sep" />
              <button
                type="button"
                className={`jgraph-tool-btn ${selectedLabelAlign === 'left' ? 'is-active' : ''}`}
                title="文字左对齐"
                onClick={() => handleSetLabelAlign('left')}
              >
                <AlignLeft size={16} />
              </button>
              <button
                type="button"
                className={`jgraph-tool-btn ${selectedLabelAlign === 'center' ? 'is-active' : ''}`}
                title="文字居中对齐"
                onClick={() => handleSetLabelAlign('center')}
              >
                <AlignCenter size={16} />
              </button>
              <button
                type="button"
                className={`jgraph-tool-btn ${selectedLabelAlign === 'right' ? 'is-active' : ''}`}
                title="文字右对齐"
                onClick={() => handleSetLabelAlign('right')}
              >
                <AlignRight size={16} />
              </button>
            </>
          )}
          {selectedFillColor !== null && (
            <>
              <div className="jgraph-tool-sep" />
              <div className="jgraph-fill-picker" ref={fillPickerRef}>
                <button
                  type="button"
                  className={`jgraph-tool-btn ${selectedFillColor !== 'none' ? 'is-active' : ''}`}
                  title="填充颜色"
                  onClick={() => setFillPickerOpen((v) => !v)}
                >
                  <Palette size={16} />
                </button>
                {fillPickerOpen && (
                  <div className="jgraph-fill-popover" role="presentation">
                    <button
                      type="button"
                      className={`jgraph-fill-swatch jgraph-fill-none ${selectedFillColor === 'none' ? 'is-active' : ''}`}
                      title="无填充"
                      onClick={() => handleSetFillColor('none')}
                    />
                    {fillPresetsFor(darkMode).map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        className={`jgraph-fill-swatch ${selectedFillColor === c.value ? 'is-active' : ''}`}
                        style={{ backgroundColor: c.value }}
                        title={c.label}
                        onClick={() => handleSetFillColor(c.value)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
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
          {/* 更多菜单：收纳低频开关 & 导入入口 */}
          <div className="jgraph-dropdown" ref={moreMenuRef}>
            <button
              type="button"
              className="jgraph-tool-btn"
              title="更多选项"
              onClick={() => setMoreMenuOpen((v) => !v)}
            >
              <MoreHorizontal size={16} />
            </button>
            {moreMenuOpen && (
              <div className="jgraph-dropdown-menu" role="presentation">
                <button
                  type="button"
                  className={`jgraph-dropdown-item ${showGrid ? 'is-active' : ''}`}
                  title={showGrid ? '隐藏网格' : '显示网格'}
                  onClick={toggleGrid}
                >
                  <Grid3x3 size={16} />
                  <span>{showGrid ? '隐藏网格' : '显示网格'}</span>
                  {showGrid && <Check size={14} className="jgraph-dropdown-check" />}
                </button>
                <button
                  type="button"
                  className={`jgraph-dropdown-item ${autoActivation ? 'is-active' : ''}`}
                  title={
                    autoActivation
                      ? '关闭时序图自动附加块'
                      : '开启时序图自动附加块｜时序图连线时自动生成活动块'
                  }
                  onClick={toggleAutoActivation}
                >
                  <SquareStack size={16} />
                  <span>时序图自动附加块</span>
                  {autoActivation && <Check size={14} className="jgraph-dropdown-check" />}
                </button>
                <div className="jgraph-dropdown-sep" />
                <button
                  type="button"
                  className="jgraph-dropdown-item"
                  title="导入 Mermaid 图表"
                  onClick={() => {
                    setMermaidDialogOpen(true);
                    setMoreMenuOpen(false);
                  }}
                >
                  <FileDown size={16} />
                  <span>导入 Mermaid</span>
                </button>
                <button
                  type="button"
                  className="jgraph-dropdown-item"
                  title="AI 生成图表"
                  onClick={() => {
                    setAiGraphDialogOpen(true);
                    setMoreMenuOpen(false);
                  }}
                >
                  <Sparkles size={16} />
                  <span>AI 生成图表</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mermaid 导入对话框 */}
      <MermaidImportDialog
        open={mermaidDialogOpen}
        onClose={() => setMermaidDialogOpen(false)}
        onImport={handleMermaidImport}
      />

      {/* AI 生成图表对话框 */}
      <AIGraphImportDialog
        open={aiGraphDialogOpen}
        onClose={() => setAiGraphDialogOpen(false)}
        onImport={handleAiGraphImport}
      />

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

