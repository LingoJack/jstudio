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
 *   - New window edits → Tauri event → updateAttributes({ snapshot })
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
  type Editor,
} from '@tiptap/react';
import { Maximize2 } from 'lucide-react';

import { useNodeResize } from '../hooks/useNodeResize';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import { AlignLeftIcon, AlignCenterIcon } from './shared/icons';
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
  const { snapshot, width, height, align } =
    node.attrs as DiagramNodeAttributes;

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

  const figureRefInternal = useRef<HTMLDivElement>(null);

  const { ref: figureRef, displayWidth, displayHeight, onResizeStart } =
    useNodeResize<HTMLDivElement>({
      width,
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

  const handleMaximize = useCallback(() => {
    if (windowOpen) return;
    setWindowOpen(true);

    openDiagramWindow(
      snapshot ?? '',
      (updatedSnapshot: string) => {
        updateAttributes({ snapshot: updatedSnapshot });
      },
      isDark,
    )
      .then((unlisten) => {
        unlistenRef.current = unlisten;
      })
      .catch((e) => {
        console.error('[DiagramBlockView] Failed to open diagram window:', e);
        setWindowOpen(false);
      });
  }, [snapshot, updateAttributes, windowOpen, isDark]);

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
          {selected && (
            <div className="diagram-block-toolbar" contentEditable={false}>
              <button
                type="button"
                ref={registerButton(0)}
                className={`diagram-block-toolbar-btn ${
                  effectiveAlign === 'left' ? 'is-active' : ''
                } ${activeIndex === 0 ? 'is-focused' : ''}`}
                onClick={() => updateAttributes({ align: 'left' })}
                title="左对齐"
              >
                <AlignLeftIcon />
              </button>
              <button
                type="button"
                ref={registerButton(1)}
                className={`diagram-block-toolbar-btn ${
                  effectiveAlign === 'center' ? 'is-active' : ''
                } ${activeIndex === 1 ? 'is-focused' : ''}`}
                onClick={() => updateAttributes({ align: 'center' })}
                title="居中"
              >
                <AlignCenterIcon />
              </button>
              <span className="diagram-block-toolbar-divider" />
              <button
                type="button"
                ref={registerButton(2)}
                className={`diagram-block-toolbar-btn ${
                  activeIndex === 2 ? 'is-focused' : ''
                }`}
                onClick={handleMaximize}
                title="放大编辑（新窗口）"
                disabled={windowOpen}
              >
                <Maximize2 size={15} />
              </button>
            </div>
          )}

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
          {selected && (
            <div
              className="diagram-block-resize-handle"
              onPointerDown={onResizeStart}
              contentEditable={false}
            />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
