/**
 * ExcalidrawCanvas — reusable wrapper around @excalidraw/excalidraw.
 *
 * Used by both the embedded block view (DiagramBlockView) and
 * the standalone OS window (DiagramWindowApp). Drawing data flows in via
 * `initialSnapshot` (serialized JSON) and out via the debounced `onChange`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw, type ExcalidrawImperativeAPI } from '@excalidraw/excalidraw';
import type {
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';

export interface ExcalidrawCanvasProps {
  /** Serialized Excalidraw scene data (JSON string). Empty = blank canvas. */
  initialSnapshot: string;
  /** Fired (debounced) whenever the canvas content changes. */
  onChange: (snapshotJson: string) => void;
  /** Render in dark mode. */
  darkMode?: boolean;
  /** Extra className on the container div. */
  className?: string;
}

export function ExcalidrawCanvas({
  initialSnapshot,
  onChange,
  darkMode = false,
  className = '',
}: ExcalidrawCanvasProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // Always keep the latest callback.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Parse initial snapshot once — only used on first mount.
  const initialData = useMemo<
    ExcalidrawInitialDataState | Promise<ExcalidrawInitialDataState | null> | null
  >(() => {
    if (!initialSnapshot) return null;
    try {
      const parsed = JSON.parse(initialSnapshot);
      return {
        elements: parsed?.elements ?? [],
        appState: {
          ...parsed?.appState,
          // Force our theme.
          theme: darkMode ? 'dark' : 'light',
        },
        scrollToContent: true,
      };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Excalidraw calls onChange on every edit — debounce the serialization.
  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const api = apiRef.current;
      if (!api) return;
      try {
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        // Strip volatile properties to keep the snapshot compact.
        const { scrollTop, scrollX, scrollY, ...restAppState } = appState;
        const snapshot = JSON.stringify({ elements, appState: restAppState });
        onChangeRef.current(snapshot);
      } catch {
        /* ignore */
      }
    }, 400);
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      className={`excalidraw-canvas-root ${className}`}
      style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
    >
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        initialData={initialData}
        onChange={handleChange}
        theme={darkMode ? 'dark' : 'light'}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: { saveFileToDisk: false },
            toggleTheme: false,
          },
        }}
      />
    </div>
  );
}
