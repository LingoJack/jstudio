/**
 * useDiagramWindow — 处理 diagram block 新窗口编辑逻辑
 *
 * 负责:
 *   1. 管理窗口打开状态
 *   2. 维护 snapshot/blockId 的稳定引用(避免回调重建)
 *   3. 处理窗口更新回调和清理
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { openDiagramWindow } from '../../../lib/windows/diagramWindow';

export interface UseDiagramWindowOptions {
  snapshot: string | null;
  blockId: string | undefined;
  isDark: boolean;
  updateAttributes: (attrs: { snapshot?: string }) => void;
}

export interface UseDiagramWindowResult {
  windowOpen: boolean;
  handleMaximize: () => void;
}

export function useDiagramWindow({
  snapshot,
  blockId,
  isDark,
  updateAttributes,
}: UseDiagramWindowOptions): UseDiagramWindowResult {
  const unlistenRef = useRef<(() => void) | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);

  // Stable refs to latest values — prevents callback recreation on every change
  const snapshotRef = useRef(snapshot);
  const blockIdRef = useRef(blockId);
  useEffect(() => {
    snapshotRef.current = snapshot;
    blockIdRef.current = blockId;
  }, [snapshot, blockId]);

  // Stable callback for updates from the diagram window
  const handleWindowUpdate = useCallback(
    (updatedSnapshot: string) => {
      if (blockIdRef.current && blockId && blockIdRef.current !== blockId) return;
      updateAttributes({ snapshot: updatedSnapshot });
    },
    [blockId, updateAttributes],
  );

  const handleMaximize = useCallback(() => {
    if (windowOpen) return;
    setWindowOpen(true);

    openDiagramWindow(
      snapshotRef.current ?? '',
      handleWindowUpdate,
      isDark,
      blockId,
      () => {
        setWindowOpen(false);
        unlistenRef.current?.();
        unlistenRef.current = null;
      },
    )
      .then((unlisten) => {
        unlistenRef.current = unlisten;
      })
      .catch((e) => {
        console.error('[useDiagramWindow] Failed to open diagram window:', e);
        setWindowOpen(false);
      });
  }, [windowOpen, isDark, handleWindowUpdate, blockId]);

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  return {
    windowOpen,
    handleMaximize,
  };
}