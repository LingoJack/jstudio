/**
 * useDiagramRenderer — 处理 diagram block 的渲染内核路由
 *
 * 负责:
 *   1. 按初始快照格式判定渲染内核(仅挂载时一次)
 *   2. 提供稳定的内核选择结果,避免编辑过程中切换内核
 *
 * 路由规则:
 *   - 已存在的 Excalidraw 历史快照 → ExcalidrawCanvas (向后兼容)
 *   - 空白 / 自研 jgraph 格式 → GraphCanvas (新内核)
 */

import { useRef } from 'react';
import { detectSnapshotKind } from '../nodes/graph/graphSnapshot';

export interface UseDiagramRendererResult {
  useLegacyExcalidraw: boolean;
}

export function useDiagramRenderer(snapshot: string | null): UseDiagramRendererResult {
  // Only detect once on mount — prevents kernel switching during editing
  const useLegacyExcalidrawRef = useRef(
    detectSnapshotKind(snapshot ?? '') === 'excalidraw',
  );

  return {
    useLegacyExcalidraw: useLegacyExcalidrawRef.current,
  };
}