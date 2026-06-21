/**
 * TldrawView — React NodeView for the diagram (tldraw) block.
 *
 * Always shows an embedded mini tldraw canvas (even when empty). The
 * floating toolbar offers alignment and a "maximize" button that opens
 * the diagram in a new independent OS window for immersive editing.
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
import { Maximize2 } from 'lucide-react';

import { useNodeResize } from '../hooks/useNodeResize';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import { AlignLeftIcon, AlignCenterIcon } from './shared/icons';
import { TldrawCanvas } from './TldrawCanvas';
import { openDiagramWindow } from '../lib/diagramWindow';
import type { DiagramNodeAttributes } from '../lib/tldrawExtension';

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function TldrawView({
  node,
  selected,
  updateAttributes,
}: NodeViewProps) {
  const { snapshot, width, align } = node.attrs as DiagramNodeAttributes;

  const effectiveAlign = (align ?? 'center') as 'left' | 'center';

  // Toolbar buttons: align-left, align-center, maximize
  const toolbarBtnCount = 3;
  const { activeIndex, registerButton } = useNodeToolbarNav(
    selected,
    null,
    toolbarBtnCount,
  );

  /* -------------------------------------------------------------- */
  /* Resize handle                                                   */
  /* -------------------------------------------------------------- */

  const figureRef = useRef<HTMLDivElement>(null);
  const { displayWidth, onResizeStart } = useNodeResize<HTMLDivElement>({
    width: width ?? undefined,
    updateAttributes,
    minWidth: 300,
    fallbackWidth: 520,
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

    const isDark = document.documentElement.classList.contains('dark');

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
        console.error('[TldrawView] Failed to open diagram window:', e);
        setWindowOpen(false);
      });
  }, [snapshot, updateAttributes, windowOpen]);

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
          {/* Floating toolbar */}
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
                title="居中对齐"
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
                title="在新窗口编辑"
                disabled={windowOpen}
              >
                <Maximize2 size={15} />
              </button>
            </div>
          )}

          {/* Embedded tldraw canvas — always interactive */}
          <div
            className="diagram-block-canvas"
            contentEditable={false}
            style={{ height: 300 }}
          >
            <TldrawCanvas
              initialSnapshot={snapshot ?? ''}
              onChange={handleEmbeddedChange}
            />
          </div>

          {/* Resize handle */}
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
