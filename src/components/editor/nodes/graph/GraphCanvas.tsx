/**
 * GraphCanvas — 自研画板内核（基于 maxGraph）。
 *
 * 设计目标：提供 initialSnapshot / onChange /
 * darkMode / className / rootElRef / editing 接口，供 DiagramBlockView 与
 * DiagramWindowApp 使用。
 *
 * 内核职责：
 *   - 用 maxGraph 渲染 node + edge 图模型（draw.io 同款思路，结构化 UML 友好）。
 *   - 数据进出只走自研快照格式（GraphSnapshot），与引擎实现解耦。
 *   - 通用流程图能力：矩形/圆角/椭圆/菱形模具、双击文本内联编辑、
 *     从节点边缘拖出连线 + 正交自动路由、选中/拖拽/框选/缩放、undo/redo、Del 删除。
 *   - editing=false 时进入只读：隐藏工具栏、禁止编辑/选择，仅供浏览。
 *
 * 连线特性：连线是"绑定端点"的——节点移动时连线自动重路由，
 * 这是时序图/用例图所必需的能力。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Graph, UndoManager, type CellStyle } from '@maxgraph/core';
import '@maxgraph/core/css/common.css';

import { GraphToolbar } from './GraphToolbar';

import {
  detectSnapshotKind,
  parseGraphSnapshot,
  serializeGraphSnapshot,
  type GraphNodeShape,
  type LabelAlign,
} from './graphSnapshot';
import { applySnapshotToGraph, readSnapshotFromGraph } from './graphModel';
import MermaidImportDialog from './MermaidImportDialog';
import AIGraphImportDialog from './AIGraphImportDialog';
import { fontColorFor } from './graphTheme';
import { useGraphExport } from './useGraphExport';
import { useGraphKeyboard } from './useGraphKeyboard';
import { useGraphInit } from './useGraphInit';
import { useGraphTheme } from './useGraphTheme';

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
  // 更多菜单 hover 延迟关闭定时器（同 shapes 菜单）。
  const moreHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // 只在首次挂载时读取初始快照（后续外部变化由下方 effect 同步）。
  const initialSnapshotRef = useRef(initialSnapshot);
  useGraphInit({
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
  });

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

  // 主题色刷新（提取到 useGraphTheme）
  useGraphTheme({ graphRef, darkModeRef, darkMode });

  useGraphKeyboard({
    editing,
    rootRef,
    containerRef,
    graphRef,
    undoManagerRef,
    pendingShapeRef,
    darkModeRef,
    setPending,
  });

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

  // 更多菜单 hover 展开：同 shapes 菜单，进入立即打开，离开延迟 200ms 关闭。
  const handleMoreEnter = useCallback(() => {
    if (moreHoverTimer.current) {
      clearTimeout(moreHoverTimer.current);
      moreHoverTimer.current = null;
    }
    setMoreMenuOpen(true);
  }, []);

  const handleMoreLeave = useCallback(() => {
    moreHoverTimer.current = setTimeout(() => {
      setMoreMenuOpen(false);
      moreHoverTimer.current = null;
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

  // ── 导出 / 缩放 / 导入 handlers（提取到 useGraphExport） ─────────
  const {
    buildExportSvg,
    handleExportSvg,
    handleExportPng,
    handleCopyImage,
    handleCopySvg,
    handleZoomIn,
    handleZoomOut,
    handleFit,
    applyImportedSnapshot,
    handleMermaidImport,
    handleAiGraphImport,
  } = useGraphExport({
    graphRef,
    containerRef,
    darkModeRef,
    applyingRef,
    lastEmittedRef,
    onChangeRef,
    updateFlowAnimationRef,
    setMoreMenuOpen,
  });

  /* -------------------------------------------------------------- */
  /* 工具栏按钮定义                                                  */
  /* -------------------------------------------------------------- */

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
        <GraphToolbar
          pendingShape={pendingShape}
          recentShapes={recentShapes}
          shapesMenuOpen={shapesMenuOpen}
          shapesMenuRef={shapesMenuRef}
          onShapesClick={() => setShapesMenuOpen(true)}
          onShapesEnter={handleShapesEnter}
          onShapesLeave={handleShapesLeave}
          onSelectShape={handleSelectShape}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onDelete={handleDelete}
          selectedSeqEdge={selectedSeqEdge}
          onToggleSeqMessage={handleToggleSeqMessage}
          selectedLabelAlign={selectedLabelAlign}
          onSetLabelAlign={handleSetLabelAlign}
          selectedFillColor={selectedFillColor}
          fillPickerOpen={fillPickerOpen}
          fillPickerRef={fillPickerRef}
          onToggleFillPicker={() => setFillPickerOpen((v) => !v)}
          onSetFillColor={handleSetFillColor}
          darkMode={darkMode}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFit={handleFit}
          moreMenuOpen={moreMenuOpen}
          moreMenuRef={moreMenuRef}
          onMoreClick={() => setMoreMenuOpen(true)}
          onMoreEnter={handleMoreEnter}
          onMoreLeave={handleMoreLeave}
          showGrid={showGrid}
          autoActivation={autoActivation}
          onToggleGrid={toggleGrid}
          onToggleAutoActivation={toggleAutoActivation}
          onOpenMermaidImport={() => { setMermaidDialogOpen(true); setMoreMenuOpen(false); }}
          onOpenAiGraphImport={() => { setAiGraphDialogOpen(true); setMoreMenuOpen(false); }}
          onExportPng={handleExportPng}
          onExportSvg={handleExportSvg}
          onCopyImage={handleCopyImage}
          onCopySvg={handleCopySvg}
        />
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
        tabIndex={editing ? -1 : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          outline: 'none',
        }}
      />
    </div>
  );
}

