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
  // Only restore `elements` — never `appState` because it contains runtime
  // objects (e.g. `collaborators` is a Map) that break on JSON round-trip.
  const initialData = useMemo<
    ExcalidrawInitialDataState | Promise<ExcalidrawInitialDataState | null> | null
  >(() => {
    if (!initialSnapshot) return null;
    try {
      const parsed = JSON.parse(initialSnapshot);
      return {
        elements: parsed?.elements ?? [],
        appState: {
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
  // Only serialize `elements` (pure data). Serializing `appState` would
  // corrupt runtime fields like `collaborators` (Map) on restore.
  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const api = apiRef.current;
      if (!api) return;
      try {
        const elements = api.getSceneElements();
        const snapshot = JSON.stringify({ elements });
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
