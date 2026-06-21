/**
 * DiagramBlockView — React NodeView for the diagram (excalidraw) block.
 *
 * Interaction model matches FileView:
 *   - When NOT selected: a transparent overlay sits above the Excalidraw canvas
 *     so the user can click to select the node (Excalidraw eats mouse events).
 *   - When selected: the overlay disappears, a floating toolbar (top-right) and
 *     resize handle (bottom-right) appear — same as ImageView / FileView.
 *
 * Data flow:
 *   - Embedded canvas edits → updateAttributes({ snapshot })
 *   - New window edits → Rust relay (set/get_diagram_update) → poll → updateAttributes({ snapshot })
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
  type Editor,
} from '@tiptap/react';
import { Maximize2 } from 'lucide-react';

import { useNodeResize } from '../hooks/useNodeResize';
import { useEditorWidth } from '../hooks/useEditorWidth';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import {
  BlockToolbar,
  AlignButtonGroup,
  BlockToolbarButton,
  BlockToolbarDivider,
} from './ui/BlockToolbar';
import { ResizeHandle } from './ui/ResizeHandle';
import { ExcalidrawCanvas } from './ExcalidrawCanvas';
import { openDiagramWindow } from '../lib/diagramWindow';
import type { DiagramNodeAttributes } from '../lib/diagramExtension';

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function DiagramBlockView({
  node,
  selected,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const { snapshot, width, widthPct, height, align } =
    node.attrs as DiagramNodeAttributes;
  const blockId = (node.attrs as DiagramNodeAttributes).id ?? undefined;

  const effectiveAlign = (align ?? 'center') as 'left' | 'center';

  /* -------------------------------------------------------------- */
  /* Keyboard navigation for the floating toolbar                    */
  /* -------------------------------------------------------------- */

  // Buttons: align-left, align-center, divider, maximize
  const toolbarBtnCount = 3;
  const { activeIndex, registerButton } = useNodeToolbarNav(
    selected,
    (editor as Editor | null) ?? null,
    toolbarBtnCount,
  );

  /* -------------------------------------------------------------- */
  /* Dark mode detection                                             */
  /* -------------------------------------------------------------- */

  const isDark =
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false;

  /* -------------------------------------------------------------- */
  /* 2D resize (width + height) — same as FileView                   */
  /* -------------------------------------------------------------- */

  const editorWidth = useEditorWidth();

  // Lazy migration: if legacy pixel `width` exists but `widthPct` is null,
  // compute the percentage from the current editor width and persist it.
  useEffect(() => {
    if (width != null && widthPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((width / editorWidth) * 100)));
      updateAttributes({ widthPct: pct, width: null });
    }
  }, [width, widthPct, editorWidth, updateAttributes]);

  // Compute the pixel width from widthPct (preferred) or fall back to legacy px.
  const widthPx = widthPct != null ? Math.round((widthPct * editorWidth) / 100) : width;

  const figureRefInternal = useRef<HTMLDivElement>(null);

  const { ref: figureRef, displayWidth, displayHeight, onResizeStart } =
    useNodeResize<HTMLDivElement>({
      width: widthPx,
      height,
      updateAttributes,
      minWidth: 300,
      minHeight: 200,
      fallbackWidth: 520,
      fallbackHeight: 320,
      maxWidth: () => {
        const el = figureRefInternal.current;
        const editorSurface = el?.closest('.ProseMirror') as HTMLElement | null;
        return (editorSurface?.clientWidth ?? window.innerWidth) - 24;
      },
      onCommit: (finalWidth, finalHeight) => {
        const pct =
          editorWidth > 0
            ? Math.min(100, Math.max(1, Math.round((finalWidth / editorWidth) * 100)))
            : 50;
        const attrs: Record<string, number | null> = { widthPct: pct, width: null };
        if (finalHeight !== null) {
          attrs.height = finalHeight;
        }
        return attrs;
      },
    });

  const setFigureRef = useCallback((el: HTMLDivElement | null) => {
    (figureRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    figureRefInternal.current = el;
  }, []);

  const figureStyle: React.CSSProperties = {};
  if (displayWidth) {
    figureStyle.width = `${displayWidth}px`;
  }

  const canvasStyle: React.CSSProperties = {
    height: displayHeight ? `${displayHeight}px` : '320px',
  };

  /* -------------------------------------------------------------- */
  /* Embedded canvas change handler                                  */
  /* -------------------------------------------------------------- */

  const handleEmbeddedChange = useCallback(
    (json: string) => {
      updateAttributes({ snapshot: json });
    },
    [updateAttributes],
  );

  /* -------------------------------------------------------------- */
  /* Open new window for full-screen editing                         */
  /* -------------------------------------------------------------- */

  const unlistenRef = useRef<(() => void) | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);

  // Keep a ref to the latest snapshot so handleMaximize doesn't need
  // `snapshot` in its dependency array — this prevents the callback from
  // being recreated on every content change, which would cause React to
  // tear down and re-run the poll loop.
  const snapshotRef = useRef(snapshot);
  const blockIdRef = useRef(blockId);
  useEffect(() => {
    snapshotRef.current = snapshot;
    blockIdRef.current = blockId;
  }, [snapshot, blockId]);

  // Stable callback for updates from the diagram window.
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
    )
      .then((unlisten) => {
        unlistenRef.current = unlisten;
      })
      .catch((e) => {
        console.error('[DiagramBlockView] Failed to open diagram window:', e);
        setWindowOpen(false);
      });
  }, [windowOpen, isDark, handleWindowUpdate, blockId]);

  // Cleanup listener on unmount.
  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <NodeViewWrapper
      className="diagram-block-wrapper"
      data-align={effectiveAlign}
      as="div"
    >
      <div className="diagram-block-container">
        <div
          ref={setFigureRef}
          className={`diagram-block-figure ${selected ? 'is-selected' : ''}`}
          style={figureStyle}
        >
          {/* Floating toolbar (top-right) — visible when selected */}
          <BlockToolbar selected={selected}>
            <AlignButtonGroup
              nav={{ activeIndex, registerButton }}
              align={effectiveAlign}
              onAlignChange={(a) => updateAttributes({ align: a })}
            />
            <BlockToolbarDivider />
            <BlockToolbarButton
              nav={{ activeIndex, registerButton }}
              index={2}
              title="放大编辑（新窗口）"
              onClick={handleMaximize}
              disabled={windowOpen}
            >
              <Maximize2 size={15} />
            </BlockToolbarButton>
          </BlockToolbar>

          {/* Excalidraw canvas */}
          <div
            className="diagram-block-canvas"
            contentEditable={false}
            style={canvasStyle}
          >
            <ExcalidrawCanvas
              initialSnapshot={snapshot ?? ''}
              onChange={handleEmbeddedChange}
              darkMode={isDark}
            />
          </div>

          {/* Transparent overlay when NOT selected — lets the user
              click to select the node even over the Excalidraw canvas. */}
          {!selected && (
            <div className="diagram-block-overlay" contentEditable={false} />
          )}

          {/* Resize handle — bottom-right, visible when selected */}
          {selected && <ResizeHandle onPointerDown={onResizeStart} />}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
