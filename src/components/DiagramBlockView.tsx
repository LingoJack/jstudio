/**
 * DiagramBlockView — React NodeView for the diagram (excalidraw) block.
 *
 * Always shows an embedded mini Excalidraw canvas. A persistent header bar on
 * top provides the "open in new window" button at all times.
 *
 * Data flow:
 *   - Embedded canvas edits → updateAttributes({ snapshot })
 *   - New window edits → Tauri event → updateAttributes({ snapshot })
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
} from '@tiptap/react';
import { Maximize2, AlignLeft, AlignCenter } from 'lucide-react';

import { useNodeResize } from '../hooks/useNodeResize';
import { ExcalidrawCanvas } from './ExcalidrawCanvas';
import { openDiagramWindow } from '../lib/diagramWindow';
import type { DiagramNodeAttributes } from '../lib/tldrawExtension';

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function DiagramBlockView({
  node,
  selected,
  updateAttributes,
}: NodeViewProps) {
  const { snapshot, width, height, align } = node.attrs as DiagramNodeAttributes;

  const effectiveAlign = (align ?? 'center') as 'left' | 'center';
  const isDark = typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : false;

  /* -------------------------------------------------------------- */
  /* Resize handle                                                   */
  /* -------------------------------------------------------------- */

  const figureRef = useRef<HTMLDivElement>(null);
  const { displayWidth, displayHeight, onResizeStart } = useNodeResize<HTMLDivElement>({
    width: width ?? undefined,
    height: height ?? undefined,
    updateAttributes,
    minWidth: 300,
    minHeight: 150,
    fallbackWidth: 520,
    fallbackHeight: 320,
    maxWidth: () => {
      const el = figureRef.current;
      const editorSurface = el?.closest('.ProseMirror') as HTMLElement | null;
      return (editorSurface?.clientWidth ?? window.innerWidth) - 24;
    },
  });

  const figureStyle: React.CSSProperties = {};
  if (displayWidth) {
    figureStyle.width = `${displayWidth}px`;
  }

  const canvasHeight = displayHeight ?? 320;

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
          ref={figureRef}
          className={`diagram-block-figure ${selected ? 'is-selected' : ''}`}
          style={figureStyle}
        >
          {/* ─── Persistent header bar (always visible) ─── */}
          <div className="diagram-block-header" contentEditable={false}>
            <button
              type="button"
              className={`diagram-block-header-btn ${
                effectiveAlign === 'left' ? 'is-active' : ''
              }`}
              onClick={() => updateAttributes({ align: 'left' })}
              title="左对齐"
            >
              <AlignLeft size={15} />
            </button>
            <button
              type="button"
              className={`diagram-block-header-btn ${
                effectiveAlign === 'center' ? 'is-active' : ''
              }`}
              onClick={() => updateAttributes({ align: 'center' })}
              title="居中对齐"
            >
              <AlignCenter size={15} />
            </button>
            <span className="diagram-block-header-spacer" />
            <button
              type="button"
              className="diagram-block-header-btn diagram-block-maximize-btn"
              onClick={handleMaximize}
              title="在新窗口编辑"
              disabled={windowOpen}
            >
              <Maximize2 size={15} />
              <span className="diagram-block-maximize-label">
                {windowOpen ? '编辑窗口已打开' : '新窗口编辑'}
              </span>
            </button>
          </div>

          {/* ─── Embedded Excalidraw canvas ─── */}
          <div
            className="diagram-block-canvas"
            contentEditable={false}
            style={{ height: canvasHeight }}
          >
            <ExcalidrawCanvas
              initialSnapshot={snapshot ?? ''}
              onChange={handleEmbeddedChange}
              darkMode={isDark}
            />
          </div>

          {/* ─── Resize handle (selected only) ─── */}
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
