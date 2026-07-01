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
  ConstraintHandler,
  ImageBox,
  RectangleShape,
  RhombusShape,
  EllipseShape,
  type Cell,
  type CellState,
  type EventObject,
  type SelectionHandler,
  type FitPlugin,
  type PanningHandler,
  type VertexHandler,
} from '@maxgraph/core';
import '@maxgraph/core/css/common.css';

import {
  Square,
  Circle,
  Diamond,
  Type as TypeIcon,
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
};

const SHAPE_LABEL: Record<GraphNodeShape, string> = {
  rectangle: '处理',
  rounded: '起止',
  ellipse: '节点',
  diamond: '判定',
  text: '文本',
};

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
    case 'rectangle':
    default:
      return { ...base, shape: 'rectangle' };
  }
}

/** 网格步长（draw.io 同款 10px）。 */
const GRID_SIZE = 10;

/** 事件容差：鼠标按下后移动超过该值才算"拖动"（拉线/拖节点）。
 *  maxGraph 默认很小导致一碰就触发拉线，调大让按下后小幅抖动不误触。 */
const EVENT_TOLERANCE = 8;

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
  const [showGrid, setShowGrid] = useState(true);
  const toggleGrid = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    setShowGrid((prev) => {
      const next = !prev;
      // 引擎的网格吸附也随之开关（吸附只在网格显示时有意义）。
      graph.setGridEnabled(next);
      return next;
    });
  }, []);
  // 暗色模式在初始化时读取一次即可（切换由下方 effect 处理容器底色）。
  const darkModeRef = useRef(darkMode);
  darkModeRef.current = darkMode;

  const onChangeRef = useRef(onChange);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef(initialSnapshot);
  // 标记"正在以编程方式灌入快照"，避免回灌触发的 model change 又反向 emit 一次。
  const applyingRef = useRef(false);

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
      const snap = readSnapshotFromGraph(graph);
      const json = serializeGraphSnapshot(snap.nodes, snap.edges, snap.viewport);
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
    const graph = new Graph(container, undefined, [
      ...getDefaultPlugins(),
      RubberBandHandler,
    ]);
    graphRef.current = graph;

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

    // 自定义选中框形状：根据图形类型显示对应形状的选中框
    graph.createSelectionShape = (state: CellState) => {
      const shapeStyle = state.style?.shape;
      const currentDark = darkModeRef.current;
      const color = getSelectionColor(currentDark);
      
      // 根据图形类型创建对应的选中框形状
      let shape: RectangleShape | RhombusShape | EllipseShape;
      if (shapeStyle === 'rhombus') {
        shape = new RhombusShape(state.bounds, color, 1, 1);
      } else if (shapeStyle === 'ellipse') {
        shape = new EllipseShape(state.bounds, color, 1, 1);
      } else {
        // rectangle / rounded 默认用矩形选中框
        shape = new RectangleShape(state.bounds, color, 1, 1);
      }
      shape.strokeWidth = SELECTION_STROKE_WIDTH;
      shape.dashed = SELECTION_DASHED;
      shape.fillColor = 'none';
      shape.strokeColor = color;
      return shape;
    };

    // 连接点样式：跟随主题（悬停边缘时显示）
    ConstraintHandler.pointImage = new ImageBox(
      createConnectionPointSVG(dark),
      CONNECTION_POINT_SIZE,
      CONNECTION_POINT_SIZE,
    );
    ConstraintHandler.highlightColor = getConnectionPointColor(dark);

    // Alt + 拖动 = 复制拖动（默认 isCloneEvent 判 Ctrl，这里改判 Alt，
    // 让 Ctrl/Cmd 空出来给"平移画布"用）。
    graph.isCloneEvent = (evt: MouseEvent) => evt.altKey;

    // Cmd/Ctrl + 拖动 = 平移画布（即使按在图形上也平移，而非移动图形）。
    const panningHandler = graph.getPlugin<PanningHandler>('PanningHandler');
    if (panningHandler) {
      panningHandler.isForcePanningEvent = (me) => {
        const evt = me.getEvent() as MouseEvent;
        return evt.metaKey || evt.ctrlKey;
      };
    }

    // 网格 + 吸附（draw.io 同款：拖拽/缩放对齐到 10px 网格）。
    graph.setGridEnabled(true);
    graph.setGridSize(GRID_SIZE);
    // 缩放以视口中心为锚点（而非左上角），更符合直觉。
    graph.centerZoom = true;

    // 拖动时显示与其他图形的对齐参考线（SelectionHandler 内置能力）。
    const selectionHandler = graph.getPlugin<SelectionHandler>('SelectionHandler');
    if (selectionHandler) selectionHandler.guidesEnabled = true;

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

    // 为每个节点提供固定连接点（四边中点 + 四角）：悬停边缘时高亮绿色十字，
    // 从精确点位拖出连线，而非只能从整体边缘任意点连。
    graph.getAllConnectionConstraints = (terminal: CellState | null) => {
      if (terminal?.cell?.isVertex()) {
        return CONNECTION_POINTS.map(
          ([x, y]) => new ConnectionConstraint(new Point(x, y), true),
        );
      }
      return null;
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
    applyingRef.current = true;
    try {
      graph.batchUpdate(() => {
        applySnapshotToGraph(graph, parseGraphSnapshot(initialSnapshotRef.current), darkModeRef.current);
      });
    } finally {
      applyingRef.current = false;
    }
    // 初始灌入产生的 edit 不应进 undo 历史。
    undoManager.clear();

    /* ------------------------------------------------------------ */
    /* 拖拽绘制：点了工具栏图形后，在画布上按住拖拽划出位置与大小      */
    /* （飞书 / draw.io 手感）。只点不拖 → 用默认尺寸落在点击处。      */
    /* ------------------------------------------------------------ */

    // 绘制预览框（纯视觉，屏幕坐标定位于 container 内）。
    const preview = document.createElement('div');
    preview.className = 'jgraph-draw-preview';
    preview.style.display = 'none';
    container.appendChild(preview);

    let drawing = false;
    let startClient = { x: 0, y: 0 }; // 相对 container 的屏幕坐标
    let startGraph = { x: 0, y: 0 }; // 对应的图坐标

    const clientToContainer = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

    const onMouseDown = (e: MouseEvent) => {
      if (!pendingShapeRef.current) return; // 未处于待绘制态，交给引擎正常处理
      if (e.button !== 0) return;
      // 拦截，阻止 maxGraph 的框选/平移接管本次拖拽。
      e.preventDefault();
      e.stopPropagation();
      drawing = true;
      startClient = clientToContainer(e);
      const p = graph.getPointForEvent(e, false);
      startGraph = { x: p.x, y: p.y };
      preview.style.display = 'block';
      preview.style.left = `${startClient.x}px`;
      preview.style.top = `${startClient.y}px`;
      preview.style.width = '0px';
      preview.style.height = '0px';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!drawing) return;
      const cur = clientToContainer(e);
      const x = Math.min(cur.x, startClient.x);
      const y = Math.min(cur.y, startClient.y);
      const w = Math.abs(cur.x - startClient.x);
      const h = Math.abs(cur.y - startClient.y);
      preview.style.left = `${x}px`;
      preview.style.top = `${y}px`;
      preview.style.width = `${w}px`;
      preview.style.height = `${h}px`;
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
    applyingRef.current = true;
    try {
      applySnapshotToGraph(graph, parseGraphSnapshot(initialSnapshot), darkMode);
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

    // 更新选中框颜色
    VertexHandlerConfig.selectionColor = getSelectionColor(darkMode);
    
    // 更新手柄颜色
    HandleConfig.fillColor = getHandleFillColor(darkMode);
    HandleConfig.strokeColor = getHandleStrokeColor(darkMode);
    
    // 更新连接点样式
    ConstraintHandler.pointImage = new ImageBox(
      createConnectionPointSVG(darkMode),
      CONNECTION_POINT_SIZE,
      CONNECTION_POINT_SIZE,
    );
    ConstraintHandler.highlightColor = getConnectionPointColor(darkMode);

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
        { shape: 'rectangle' as const, icon: Square, title: '矩形（处理）' },
        { shape: 'rounded' as const, icon: Square, title: '圆角矩形（起止）' },
        { shape: 'ellipse' as const, icon: Circle, title: '椭圆（节点）' },
        { shape: 'diamond' as const, icon: Diamond, title: '菱形（判定）' },
        { shape: 'text' as const, icon: TypeIcon, title: '文本' },
      ] satisfies { shape: GraphNodeShape; icon: typeof Square; title: string }[],
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
      }`}
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
          {shapeTools.map(({ shape, icon: Icon, title }) => (
            <button
              key={shape}
              type="button"
              className={`jgraph-tool-btn ${pendingShape === shape ? 'is-active' : ''}`}
              title={`${title}｜点击后在画布拖拽划定大小`}
              onClick={() => togglePending(shape)}
            >
              <Icon size={16} />
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
