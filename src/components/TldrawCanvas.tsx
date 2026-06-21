import { useCallback, useEffect, useRef } from 'react';
import { Tldraw, type Editor, type TLEditorSnapshot } from 'tldraw';
import { getSnapshot } from '@tldraw/editor';

export interface TldrawCanvasProps {
  /** Initial snapshot JSON string. On first mount the store is seeded from this. */
  initialSnapshot: string;
  /** Fired (debounced) whenever the canvas content changes, with serialized snapshot JSON. */
  onChange: (snapshotJson: string) => void;
  /** Hide tldraw's own toolbar/UI (read-only-ish embedded view). */
  hideUi?: boolean;
  /** Extra className on the container div. */
  className?: string;
}

/**
 * Reusable tldraw canvas wrapper.
 *
 * Used by both the embedded block view (TldrawView) and the full-screen modal
 * (TldrawEditorModal). Snapshot data flows in via `initialSnapshot` and out
 * via the debounced `onChange` callback.
 */
export function TldrawCanvas({
  initialSnapshot,
  onChange,
  hideUi = false,
  className = '',
}: TldrawCanvasProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);

  // Always keep the latest callback without re-subscribing the store listener.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Parse the initial snapshot once — used to seed the store on first render.
  const parsedSnapshot = useCallback((): TLEditorSnapshot | undefined => {
    if (!initialSnapshot) return undefined;
    try {
      const parsed = JSON.parse(initialSnapshot);
      // Accept either a full TLEditorSnapshot { document, session } or a bare
      // TLStoreSnapshot { schema, store } — normalise to { document }.
      if (parsed?.document) return parsed as TLEditorSnapshot;
      return { document: parsed, session: undefined } as TLEditorSnapshot;
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Called by tldraw once the editor instance is ready.
  const handleMount = useCallback((editor: Editor) => {
    const store = editor.store;

    store.listen(
      () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          try {
            const snap = getSnapshot(store);
            onChangeRef.current(JSON.stringify(snap));
          } catch {
            /* ignore serialization errors */
          }
        }, 400);
      },
      { scope: 'document', source: 'user' },
    );
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      className={`tldraw-canvas-root ${className}`}
      style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
    >
      <Tldraw
        snapshot={parsedSnapshot()}
        hideUi={hideUi}
        onMount={handleMount}
        components={{
          // Hide the debug menu and share zone — irrelevant in our embedded context.
          DebugMenu: () => null,
          SharePanel: () => null,
        }}
      />
    </div>
  );
}
