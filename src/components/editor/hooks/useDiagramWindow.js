import { useCallback, useEffect, useRef, useState } from "react";
import { openDiagramWindow } from "../../../lib/windows/diagramWindow";
function useDiagramWindow({
  snapshot,
  blockId,
  isDark,
  mindmapScheme,
  updateAttributes
}) {
  const unlistenRef = useRef(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const snapshotRef = useRef(snapshot);
  const blockIdRef = useRef(blockId);
  const schemeRef = useRef(mindmapScheme);
  useEffect(() => {
    snapshotRef.current = snapshot;
    blockIdRef.current = blockId;
    schemeRef.current = mindmapScheme;
  }, [snapshot, blockId, mindmapScheme]);
  const handleWindowUpdate = useCallback(
    (updatedSnapshot, nextScheme) => {
      if (blockIdRef.current && blockId && blockIdRef.current !== blockId) return;
      updateAttributes({
        snapshot: updatedSnapshot,
        ...nextScheme ? { mindmapScheme: nextScheme } : {}
      });
    },
    [blockId, updateAttributes]
  );
  const handleMaximize = useCallback(() => {
    if (windowOpen) return;
    setWindowOpen(true);
    openDiagramWindow(
      snapshotRef.current ?? "",
      handleWindowUpdate,
      isDark,
      blockId,
      () => {
        setWindowOpen(false);
        unlistenRef.current?.();
        unlistenRef.current = null;
      },
      schemeRef.current
    ).then((unlisten) => {
      unlistenRef.current = unlisten;
    }).catch((e) => {
      console.error("[useDiagramWindow] Failed to open diagram window:", e);
      setWindowOpen(false);
    });
  }, [windowOpen, isDark, handleWindowUpdate, blockId]);
  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);
  return {
    windowOpen,
    handleMaximize
  };
}
export {
  useDiagramWindow
};
