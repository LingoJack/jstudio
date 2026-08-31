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
 *
 * 各初始化阶段已拆分到 graphSetup/ 目录下的独立模块，此文件为薄编排层。
 */

import { useEffect } from "react";
import type { RefObject } from "react";
import {
  Graph,
  InternalEvent,
  RubberBandHandler,
  getDefaultPlugins,
  type UndoManager,
} from "@maxgraph/core";

import { registerCustomShapes } from "./customShapes";
import { registerObstacleEdgeStyle } from "./obstacleRouting";
import { registerMindmapEdgeStyle } from "./mindmapLayout";
import { EVENT_TOLERANCE } from "./graphConstants";
import type { GraphNodeShape } from "./graphSnapshot";
import {
  setupEdgeFlowAnimation,
  setupVertexHandlers,
  setupConnectionHandlers,
  setupInteractionConfig,
  setupBorderHitTest,
  setupDefaultStyles,
  setupEventListeners,
  setupSnapshotLoad,
  setupDragDraw,
  setupWheelZoom,
} from "./graphSetup";
import type { GraphSetupContext, GraphSetupFn } from "./graphSetup";

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
  pendingBatchCountRef: RefObject<number>;
  debounceRef: RefObject<ReturnType<typeof setTimeout> | null>;
  scheduleEmit: () => void;
  emitSnapshot: () => void;
  setShowGrid: (v: boolean) => void;
  setAutoActivation: (v: boolean) => void;
  setSelectedLabelAlign: (v: "left" | "center" | "right" | null) => void;
  setSelectedFillColor: (v: string | null) => void;
  setSelectedSeqEdge: (v: "call" | "return" | null) => void;
  setSelectedMindmapTopic: (v: boolean) => void;
  setSelectedVertexCount: (n: number) => void;
  setSelectedBrace: (v: boolean) => void;
  setFillPickerOpen: (v: boolean) => void;
  setPending: (shape: GraphNodeShape | null) => void;
  setPendingBatchCount: (n: number) => void;
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
    pendingBatchCountRef,
    debounceRef,
    scheduleEmit,
    emitSnapshot,
    setShowGrid,
    setAutoActivation,
    setSelectedLabelAlign,
    setSelectedFillColor,
    setSelectedSeqEdge,
    setSelectedMindmapTopic,
    setSelectedVertexCount,
    setSelectedBrace,
    setFillPickerOpen,
    setPending,
    setPendingBatchCount,
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

    // 构建 setup context，供各 setup 函数共享状态。
    const ctx: GraphSetupContext = {
      graph,
      container,
      graphRef,
      undoManagerRef,
      updateFlowAnimationRef,
      darkModeRef,
      autoActivationRef,
      applyingRef,
      initialSnapshotRef,
      showGridRef,
      pendingShapeRef,
      pendingBatchCountRef,
      rootRef,
      containerRef,
      scheduleEmit,
      setShowGrid,
      setAutoActivation,
      setSelectedLabelAlign,
      setSelectedFillColor,
      setSelectedSeqEdge,
      setSelectedMindmapTopic,
      setSelectedVertexCount,
      setSelectedBrace,
      setFillPickerOpen,
      setPending,
      setPendingBatchCount,
    };

    // 按原始顺序调用各 setup 函数，收集 cleanup。
    const setupFns: GraphSetupFn[] = [
      setupEdgeFlowAnimation,
      setupVertexHandlers,
      setupConnectionHandlers,
      setupInteractionConfig,
      setupBorderHitTest,
      setupDefaultStyles,
      setupEventListeners,
      setupSnapshotLoad,
      setupDragDraw,
      setupWheelZoom,
    ];
    const cleanups: (() => void)[] = [];
    for (const fn of setupFns) {
      const cleanup = fn(ctx);
      if (cleanup) cleanups.push(cleanup);
    }

    return () => {
      // 按注册的逆序执行各 setup 的 cleanup。
      for (let i = cleanups.length - 1; i >= 0; i--) {
        cleanups[i]();
      }
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
