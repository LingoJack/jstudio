import { useEffect } from "react";
import {
  Graph,
  InternalEvent,
  RubberBandHandler,
  getDefaultPlugins
} from "@maxgraph/core";
import { registerCustomShapes } from "./customShapes";
import { registerObstacleEdgeStyle } from "./obstacleRouting";
import { registerMindmapEdgeStyle } from "./mindmapLayout";
import { EVENT_TOLERANCE } from "./graphConstants";
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
  setupWheelZoom
} from "./graphSetup";
function useGraphInit(params) {
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
    setSelectedMindmapTopic,
    setFillPickerOpen,
    setPending
  } = params;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    InternalEvent.disableContextMenu(container);
    const graph = new Graph(container, void 0, [
      ...getDefaultPlugins(),
      RubberBandHandler
    ]);
    graphRef.current = graph;
    registerCustomShapes();
    registerObstacleEdgeStyle();
    registerMindmapEdgeStyle();
    graph.setPanning(true);
    graph.setConnectable(true);
    graph.setCellsEditable(true);
    graph.setAllowDanglingEdges(false);
    graph.setHtmlLabels(true);
    graph.setCellsResizable(true);
    graph.setCellsMovable(true);
    graph.setEventTolerance(EVENT_TOLERANCE);
    const ctx = {
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
      rootRef,
      containerRef,
      scheduleEmit,
      setShowGrid,
      setAutoActivation,
      setSelectedLabelAlign,
      setSelectedFillColor,
      setSelectedSeqEdge,
      setSelectedMindmapTopic,
      setFillPickerOpen,
      setPending
    };
    const setupFns = [
      setupEdgeFlowAnimation,
      setupVertexHandlers,
      setupConnectionHandlers,
      setupInteractionConfig,
      setupBorderHitTest,
      setupDefaultStyles,
      setupEventListeners,
      setupSnapshotLoad,
      setupDragDraw,
      setupWheelZoom
    ];
    const cleanups = [];
    for (const fn of setupFns) {
      const cleanup = fn(ctx);
      if (cleanup) cleanups.push(cleanup);
    }
    return () => {
      for (let i = cleanups.length - 1; i >= 0; i--) {
        cleanups[i]();
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        emitSnapshot();
      }
      graph.destroy();
      graphRef.current = null;
      undoManagerRef.current = null;
    };
  }, []);
}
export {
  useGraphInit
};
