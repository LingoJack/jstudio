/**
 * TldrawView — React NodeView for the diagram (tldraw) block.
 *
 * Two visual states:
 *   1. Empty (no snapshot): a dashed-border placeholder prompting the user to
 *      start drawing. Clicking it (or pressing the button) opens the full-screen
 *      modal with a fresh canvas.
 *   2. Loaded: an embedded mini tldraw canvas (300px tall) with a floating
 *      toolbar — align, maximize, and resize handle.
 *
 * The full-screen modal (TldrawEditorModal) is the primary editing surface.
 * The embedded canvas is always interactive for quick tweaks.
 */

import { useCallback, useRef, useState } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
  type Editor,
} from '@tiptap/react';
import { Maximize2, PenTool } from 'lucide-react';

import { useNodeResize } from '../hooks/useNodeResize';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import { AlignLeftIcon, AlignCenterIcon } from './shared/icons';
import { TldrawCanvas } from './TldrawCanvas';
import { TldrawEditorModal } from './TldrawEditorModal';
import type { DiagramNodeAttributes } from '../lib/tldrawExtension';

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function TldrawView({
  node,
  selected,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const { snapshot, width, align } = node.attrs as DiagramNodeAttributes;

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Toolbar buttons: align-left, align-center, maximize
  const toolbarBtnCount = 3;
  const { activeIndex, registerButton } = useNodeToolbarNav(
    selected,
    (editor as Editor | null) ?? null,
    toolbarBtnCount,
  );

  const effectiveAlign = (align ?? 'center') as 'left' | 'center';
  const hasSnapshot = Boolean(snapshot);

  /* -------------------------------------------------------------- */
  /* Resize handle                                                   */
  /* -------------------------------------------------------------- */

  const figureRefInternal = useRef<HTMLDivElement>(null);

  const { ref: figureRef, displayWidth, onResizeStart } =
    useNodeResize<HTMLDivElement>({
      width: width ?? undefined,
      updateAttributes,
      minWidth: 300,
      fallbackWidth: 520,
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

  /* -------------------------------------------------------------- */
  /* Snapshot change handlers                                        */
  /* -------------------------------------------------------------- */

  // Embedded canvas → update node attributes (debounced inside TldrawCanvas).
  const handleEmbeddedChange = useCallback(
    (json: string) => {
      updateAttributes({ snapshot: json });
    },
    [updateAttributes],
  );

  // Modal save → update node attributes with latest snapshot.
  const handleModalSave = useCallback(
    (json: string) => {
      updateAttributes({ snapshot: json });
    },
    [updateAttributes],
  );

  /* -------------------------------------------------------------- */
  /* Render                                                          */
  /* --------------------------------------------------  ------------- */

  return (
    <NodeViewWrapper
      className="diagram-block-wrapper"
      data-align={effectiveAlign}
      as="div"
    >
      <div className="diagram-block-container">
        {/* Empty state — placeholder */}
        {!hasSnapshot ? (
          <div
            className="diagram-block-placeholder"
            contentEditable={false}
            onClick={() => setIsModalOpen(true)}
          >
            <PenTool size={24} className="diagram-block-placeholder-icon" />
            <span className="diagram-block-placeholder-text">
              点击开始绘图
            </span>
            <span className="diagram-block-placeholder-hint">
              架构图 · 流程图 · 需求图
            </span>
          </div>
        ) : (
          /* Loaded state — embedded canvas */
          <div
            ref={setFigureRef}
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
                  onClick={() => setIsModalOpen(true)}
                  title="放大编辑"
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
                initialSnapshot={snapshot}
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
        )}
      </div>

      {/* Full-screen modal editor */}
      <TldrawEditorModal
        open={isModalOpen}
        initialSnapshot={snapshot}
        onSave={handleModalSave}
        onClose={() => setIsModalOpen(false)}
      />
    </NodeViewWrapper>
  );
}
