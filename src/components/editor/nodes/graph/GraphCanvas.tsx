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

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Graph,
  InternalEvent,
  RubberBandHandler,
  UndoManager,
  ConnectionConstraint,
  Point,
  Clipboard,
  getDefaultPlugins,
  type Cell,
  type CellState,
  type EventObject,
  type SelectionHandler,
  type FitPlugin,
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
} from 'lucide-react';

import {
  detectSnapshotKind,
  parseGraphSnapshot,
  serializeGraphSnapshot,
  type GraphNodeShape,
} from './graphSnapshot';
import { applySnapshotToGraph, readSnapshotFromGraph } from './graphModel';

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

/** 网格步长（draw.io 同款 10px）。 */
const GRID_SIZE = 10;

/** 缩放上下限，防止用户缩到不可用。 */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

/**
 * draw.io 出厂配色（浅色）：淡蓝填充 + 蓝色描边 + 深色文字。
 * 暗色模式用一组协调的深蓝，保证节点在深底上仍清晰。
 */
const PALETTE = {
  light: { fill: '#dae8fc', stroke: '#6c8ebf', font: '#1f2328', edge: '#4d6b99' },
  dark: { fill: '#2b3a55', stroke: '#7aa2d6', font: '#e6edf3', edge: '#9db8e0' },
} as const;

/**
 * 节点四边中点 + 四角的固定连接点（相对坐标 0~1）。
 * 悬停节点边缘时 ConnectionHandler 会把这些点渲染成绿色十字，
 * 从任一点拖出即为精确连线（draw.io 手感）。
 */
const CONNECTION_POINTS: Array<[number, number]> = [
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
  [0, 0],
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
  // 连续插入时的递增偏移，避免新图形全堆在视口中心互相遮挡。
  const insertOffsetRef = useRef(0);
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

    // 网格 + 吸附（draw.io 同款：拖拽/缩放对齐到 10px 网格）。
    graph.setGridEnabled(true);
    graph.setGridSize(GRID_SIZE);
    // 缩放以视口中心为锚点（而非左上角），更符合直觉。
    graph.centerZoom = true;

    // 拖动时显示与其他图形的对齐参考线（SelectionHandler 内置能力）。
    const selectionHandler = graph.getPlugin<SelectionHandler>('SelectionHandler');
    if (selectionHandler) selectionHandler.guidesEnabled = true;

    // 节点默认配色（对齐 draw.io 淡蓝方案；暗色模式用协调深蓝）。
    const pal = darkModeRef.current ? PALETTE.dark : PALETTE.light;
    const vertexDefault = graph.getStylesheet().getDefaultVertexStyle();
    vertexDefault.fillColor = pal.fill;
    vertexDefault.strokeColor = pal.stroke;
    vertexDefault.fontColor = pal.font;

    // 全局默认走正交连线（与 draw.io 手感一致）。
    const edgeDefault = graph.getStylesheet().getDefaultEdgeStyle();
    edgeDefault.edgeStyle = 'orthogonalEdgeStyle';
    edgeDefault.rounded = true;
    edgeDefault.endArrow = 'classic';
    edgeDefault.strokeColor = pal.edge;

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
        applySnapshotToGraph(graph, parseGraphSnapshot(initialSnapshotRef.current));
      });
    } finally {
      applyingRef.current = false;
    }
    // 初始灌入产生的 edit 不应进 undo 历史。
    undoManager.clear();

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
      applySnapshotToGraph(graph, parseGraphSnapshot(initialSnapshot));
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
  /* 工具栏：插入一个模具节点（错位落点 + 网格对齐，避免堆叠遮挡）    */
  /* -------------------------------------------------------------- */

  const insertShape = useCallback((shape: GraphNodeShape) => {
    const graph = graphRef.current;
    if (!graph) return;
    const size = DEFAULT_SIZE[shape];
    const view = graph.getView();
    // 视口中心对应的画布坐标，叠加递增偏移，避免连续插入时全堆在一起。
    const container = containerRef.current;
    const cx = container ? container.clientWidth / 2 : 200;
    const cy = container ? container.clientHeight / 2 : 160;
    const offset = insertOffsetRef.current;
    // 每插一个偏移一格网格，最多循环 8 次后归零（呈阶梯状排开）。
    insertOffsetRef.current = (offset + 1) % 8;
    const shift = offset * GRID_SIZE;
    const rawX = (cx - view.translate.x * view.scale) / view.scale - size.w / 2 + shift;
    const rawY = (cy - view.translate.y * view.scale) / view.scale - size.h / 2 + shift;
    // 对齐到网格。
    const x = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
    const y = Math.round(rawY / GRID_SIZE) * GRID_SIZE;

    const parent = graph.getDefaultParent();
    const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    graph.batchUpdate(() => {
      const cell = graph.insertVertex({
        parent,
        id,
        value: SHAPE_LABEL[shape],
        position: [x, y],
        size: [size.w, size.h],
        style:
          shape === 'rounded'
            ? { shape: 'rectangle', rounded: true }
            : shape === 'diamond'
              ? { shape: 'rhombus' }
              : shape === 'ellipse'
                ? { shape: 'ellipse' }
                : shape === 'text'
                  ? { shape: 'text', fillColor: 'none', strokeColor: 'none' }
                  : { shape: 'rectangle' },
      });
      // 新建即选中，方便立刻拖动/输入。
      graph.setSelectionCell(cell);
    });
  }, []);

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
      } ${darkMode ? 'is-dark' : ''}`}
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
              className="jgraph-tool-btn"
              title={title}
              onClick={() => insertShape(shape)}
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
