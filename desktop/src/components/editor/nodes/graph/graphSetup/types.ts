import type { Graph, UndoManager } from "@maxgraph/core";
import type { RefObject } from "react";
import type { GraphNodeShape } from "../graphSnapshot";

export interface GraphSetupContext {
  graph: Graph;
  container: HTMLDivElement;
  graphRef: RefObject<Graph | null>;
  undoManagerRef: RefObject<UndoManager | null>;
  updateFlowAnimationRef: RefObject<(() => void) | null>;
  darkModeRef: RefObject<boolean>;
  autoActivationRef: RefObject<boolean>;
  applyingRef: RefObject<boolean>;
  // true 期间程序化样式写入不进撤销历史（自动上色预览的瞬时上色/回滚）。
  undoSuspendedRef: RefObject<boolean>;
  initialSnapshotRef: RefObject<string>;
  showGridRef: RefObject<boolean>;
  pendingShapeRef: RefObject<GraphNodeShape | null>;
  pendingBatchCountRef: RefObject<number>;
  rootRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  scheduleEmit: () => void;
  setShowGrid: (v: boolean) => void;
  setAutoActivation: (v: boolean) => void;
  setSelectedLabelAlign: (v: "left" | "center" | "right" | null) => void;
  setSelectedFillColor: (v: string | null) => void;
  // 选中边线的样式快照（非边选中为 null，驱动"连线样式"按钮显隐与高亮）。
  setSelectedEdgeStyle: (
    v: { endArrow: string; dashed: boolean; strokeWidth: number } | null,
  ) => void;
  setSelectedSeqEdge: (v: "call" | "return" | null) => void;
  setSelectedMindmapTopic: (v: boolean) => void;
  setSelectedVertexCount: (n: number) => void;
  setSelectedBrace: (v: boolean) => void;
  setFillPickerOpen: (v: boolean) => void;
  setPending: (shape: GraphNodeShape | null) => void;
  setPendingBatchCount: (n: number) => void;
}

export type GraphSetupFn = (ctx: GraphSetupContext) => (() => void) | void;
