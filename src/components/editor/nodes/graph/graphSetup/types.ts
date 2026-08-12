import type { Graph, UndoManager } from '@maxgraph/core';
import type { RefObject } from 'react';
import type { GraphNodeShape } from '../graphSnapshot';

export interface GraphSetupContext {
  graph: Graph;
  container: HTMLDivElement;
  graphRef: RefObject<Graph | null>;
  undoManagerRef: RefObject<UndoManager | null>;
  updateFlowAnimationRef: RefObject<(() => void) | null>;
  darkModeRef: RefObject<boolean>;
  autoActivationRef: RefObject<boolean>;
  applyingRef: RefObject<boolean>;
  initialSnapshotRef: RefObject<string>;
  showGridRef: RefObject<boolean>;
  pendingShapeRef: RefObject<GraphNodeShape | null>;
  pendingLifelineCountRef: RefObject<number>;
  rootRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  scheduleEmit: () => void;
  setShowGrid: (v: boolean) => void;
  setAutoActivation: (v: boolean) => void;
  setSelectedLabelAlign: (v: 'left' | 'center' | 'right' | null) => void;
  setSelectedFillColor: (v: string | null) => void;
  setSelectedSeqEdge: (v: 'call' | 'return' | null) => void;
  setSelectedMindmapTopic: (v: boolean) => void;
  setFillPickerOpen: (v: boolean) => void;
  setPending: (shape: GraphNodeShape | null) => void;
  setPendingLifelineCount: (n: number) => void;
}

export type GraphSetupFn = (ctx: GraphSetupContext) => (() => void) | void;
