/**
 * ExcalidrawCanvas — reusable wrapper around @excalidraw/excalidraw.
 *
 * Used by both the embedded block view (DiagramBlockView) and
 * the standalone OS window (DiagramWindowApp). Drawing data flows in via
 * `initialSnapshot` (serialized JSON) and out via the debounced `onChange`.
 *
 * ---
 * MULTI-INSTANCE ISOLATION
 *
 * Excalidraw's internal `Scene` class maintains a **global static `Map`**
 * (`sceneMapById`) that maps element-id → Scene-instance. When two
 * Excalidraw instances load snapshots with the **same element ids** (e.g.
 * copy-paste of a diagram block, or multiple diagrams on one page), the
 * second instance's `replaceAllElements` overwrites the global map entries.
 * Afterwards, internal helpers like `mutateElement` that resolve a scene
 * via `Scene.getScene(id)` get the **wrong** Scene — edits in one diagram
 * leak into another.
 *
 * Fix: every element id that enters this instance gets a unique per-instance
 * prefix. When serializing back out (onChange), the prefix is stripped so
 * the persisted snapshot remains clean and portable. All cross-element id
 * references (containerId, boundElements, startBinding, endBinding, frameId)
 * are prefixed/stripped in lockstep.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Excalidraw, type ExcalidrawImperativeAPI } from '@excalidraw/excalidraw';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/types';

/* ------------------------------------------------------------------ */
/* ID prefixing helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Generate a short unique instance prefix.
 * Format: `i{base36 timestamp}{random}` — always starts with a letter so the
 * resulting id stays a valid Excalidraw id (nanoid-compatible).
 */
function makeInstancePrefix(): string {
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** The separator between the instance prefix and the original element id. */
const SEP = '$';

// Excalidraw element shapes that carry id references.
type BindingLike = { elementId: string } | null;
type BoundElementLike = { id: string; type: string } | undefined;

/**
 * Deep-prefix every element id (and id reference) with the instance prefix.
 * Returns **new** shallow-cloned objects — the originals are never mutated.
 */
function prefixElements<T extends Record<string, any>>(
  elements: T[],
  prefix: string,
): T[] {
  return elements.map((el) => {
    if (!el || typeof el !== 'object' || !('id' in el)) return el;
    const clone: Record<string, any> = { ...el };
    clone.id = prefix + SEP + el.id;

    // Text-in-container reference
    if (typeof el.containerId === 'string' && el.containerId) {
      clone.containerId = prefix + SEP + el.containerId;
    }

    // Frame membership
    if (typeof el.frameId === 'string' && el.frameId) {
      clone.frameId = prefix + SEP + el.frameId;
    }

    // Arrow bindings
    if (el.startBinding && typeof el.startBinding === 'object') {
      clone.startBinding = { ...el.startBinding, elementId: prefix + SEP + el.startBinding.elementId };
    }
    if (el.endBinding && typeof el.endBinding === 'object') {
      clone.endBinding = { ...el.endBinding, elementId: prefix + SEP + el.endBinding.elementId };
    }

    // Reverse references from containers/arrows to bound elements
    if (Array.isArray(el.boundElements) && el.boundElements.length > 0) {
      clone.boundElements = el.boundElements.map((be: BoundElementLike) =>
        be ? { ...be, id: prefix + SEP + be.id } : be,
      );
    }

    return clone as T;
  });
}

/** Strip the instance prefix from every element id and id reference. */
function stripPrefixes<T extends Record<string, any>>(
  elements: T[],
  prefix: string,
): T[] {
  const marker = prefix + SEP;
  const strip = (id: string): string =>
    typeof id === 'string' && id.startsWith(marker) ? id.slice(marker.length) : id;

  return elements.map((el) => {
    if (!el || typeof el !== 'object' || !('id' in el)) return el;
    const clone: Record<string, any> = { ...el };
    clone.id = strip(el.id);

    if (typeof el.containerId === 'string' && el.containerId) {
      clone.containerId = strip(el.containerId);
    }
    if (typeof el.frameId === 'string' && el.frameId) {
      clone.frameId = strip(el.frameId);
    }
    if (el.startBinding && typeof el.startBinding === 'object') {
      clone.startBinding = { ...el.startBinding, elementId: strip(el.startBinding.elementId) };
    }
    if (el.endBinding && typeof el.endBinding === 'object') {
      clone.endBinding = { ...el.endBinding, elementId: strip(el.endBinding.elementId) };
    }
    if (Array.isArray(el.boundElements) && el.boundElements.length > 0) {
      clone.boundElements = el.boundElements.map((be: BoundElementLike) =>
        be ? { ...be, id: strip(be.id) } : be,
      );
    }
    return clone as T;
  });
}

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

  // Unique per-instance prefix — isolates this Excalidraw instance's element
  // ids in the global sceneMapById. See file header for full explanation.
  const instPrefix = useMemo(() => makeInstancePrefix(), []);

  // Track the latest snapshot we have applied to the canvas.
  // This is used to:
  //   1. Detect external changes (from props) vs. internal changes (from onChange)
  //   2. Avoid feedback loops when our own onChange triggers a prop update
  const lastAppliedSnapshot = useRef(initialSnapshot);
  const lastEmittedSnapshot = useRef(initialSnapshot);

  // Always keep the latest callback.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Parse initial snapshot once — only used on first mount.
  // Element ids are prefixed with the instance prefix before they enter
  // Excalidraw so they are globally unique.
  const initialData = useMemo<
    ExcalidrawInitialDataState | Promise<ExcalidrawInitialDataState | null> | null
  >(() => {
    if (!initialSnapshot) return null;
    try {
      const parsed = JSON.parse(initialSnapshot);
      return {
        elements: prefixElements(parsed?.elements ?? [], instPrefix),
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

  // Sync external snapshot changes into the Excalidraw scene.
  // When `initialSnapshot` changes from the OUTSIDE (e.g. diagram window
  // sends an updated snapshot), push it into the canvas via updateScene.
  // The `lastAppliedSnapshot` ref prevents feedback loops: our own onChange
  // updates this ref, so we only react to genuinely new external data.
  //
  // External snapshots always arrive with CLEAN ids (no prefix), so we add
  // the instance prefix before pushing them in.
  useEffect(() => {
    if (initialSnapshot === lastAppliedSnapshot.current) return;
    lastAppliedSnapshot.current = initialSnapshot;

    const api = apiRef.current;
    if (!api || !initialSnapshot) return;
    try {
      const parsed = JSON.parse(initialSnapshot);
      api.updateScene({
        elements: prefixElements(parsed?.elements ?? [], instPrefix),
      });
    } catch {
      /* ignore malformed JSON */
    }
  }, [initialSnapshot, instPrefix]);

  // Excalidraw calls onChange on every edit — debounce the serialization.
  // When serializing, strip the instance prefix so the persisted snapshot
  // uses clean, portable ids.
  const handleChange = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    _appState: AppState,
    _files: BinaryFiles,
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const cleanElements = stripPrefixes([...elements], instPrefix);
        const snapshot = JSON.stringify({ elements: cleanElements });
        if (snapshot === lastEmittedSnapshot.current) return;
        lastEmittedSnapshot.current = snapshot;
        lastAppliedSnapshot.current = snapshot;
        onChangeRef.current(snapshot);
      } catch {
        /* ignore */
      }
    }, 400);
  }, [instPrefix]);

  // Cleanup on unmount — flush any pending debounce so the last edit
  // is not silently dropped.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        const api = apiRef.current;
        if (api) {
          try {
            const elements = stripPrefixes(api.getSceneElements(), instPrefix);
            const snapshot = JSON.stringify({ elements });
            if (snapshot === lastEmittedSnapshot.current) return;
            lastEmittedSnapshot.current = snapshot;
            onChangeRef.current(snapshot);
          } catch {
            /* ignore */
          }
        }
      }
    };
  }, [instPrefix]);

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
