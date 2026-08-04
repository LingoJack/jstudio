/**
 * DiagramBlockView — React NodeView for the diagram (excalidraw) block.
 *
 * Interaction model matches FileView:
 *   - When NOT selected: a transparent overlay sits above the canvas
 *     so the user can click to select the node (canvas eats mouse events).
 *   - When selected: the overlay disappears, a floating toolbar (top-right) and
 *     resize handle (bottom-right) appear — same as ImageView / FileView.
 *
 * Architecture:
 *   - Logic split into custom hooks (see ../hooks/useDiagram*)
 *   - Component focuses on coordination and rendering
 *
 * Data flow:
 *   - Embedded canvas edits → updateAttributes({ snapshot })
 *   - New window edits → Rust relay (set/get_diagram_update) → poll → updateAttributes({ snapshot })
 */

import { useCallback } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
  type Editor,
} from '@tiptap/react';
import { Maximize2, Pencil, Check } from 'lucide-react';

import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import { useNodeSelected } from '../hooks/useNodeSelected';
import { useDiagramSize } from '../hooks/useDiagramSize';
import { useDiagramEditMode } from '../hooks/useDiagramEditMode';
import { useDiagramWindow } from '../hooks/useDiagramWindow';
import { useDiagramRenderer } from '../hooks/useDiagramRenderer';
import { useStore, selectIsDarkMode } from '../../../store';
import {
  BlockToolbar,
  AlignButtonGroup,
  BlockToolbarButton,
  BlockToolbarDivider,
} from '../../ui/BlockToolbar';
import { ResizeHandle } from '../../ui/ResizeHandle';
import { ExcalidrawCanvas } from './ExcalidrawCanvas';
import { GraphCanvas } from './graph/GraphCanvas';
import type { DiagramNodeAttributes } from '../../../lib/editor/extensions/diagramExtension';

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function DiagramBlockView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const attrs = node.attrs as DiagramNodeAttributes;
  const { snapshot, align } = attrs;
  const blockId = attrs.id ?? undefined;
  const effectiveAlign = (align ?? 'center') as 'left' | 'center';

  /* -------------------------------------------------------------- */
  /* Selection & toolbar navigation                                  */
  /* -------------------------------------------------------------- */
  const selected = useNodeSelected((editor as Editor | null) ?? null, getPos);

  const toolbarBtnCount = 4;
  const {
    activeIndex,
    registerButton,
    editing,
    enterEditing,
    exitEditing,
    interactiveRef,
    interactiveProps,
  } = useNodeToolbarNav(
    selected,
    (editor as Editor | null) ?? null,
    toolbarBtnCount,
    true,
  );

  /* -------------------------------------------------------------- */
  /* Size management (resize + legacy migration)                     */
  /* -------------------------------------------------------------- */
  const {
    setFigureRef,
    displayWidth,
    displayHeight,
    onResizeStart,
  } = useDiagramSize({
    attrs,
    updateAttributes,
  });

  // Combine refs: size hook's internal ref + toolbar nav's interactive ref
  const combinedFigureRef = useCallback((el: HTMLDivElement | null) => {
    setFigureRef(el);
    interactiveRef(el);
  }, [setFigureRef, interactiveRef]);

  const figureStyle: React.CSSProperties = {};
  if (displayWidth) {
    figureStyle.width = `${displayWidth}px`;
  }

  const canvasStyle: React.CSSProperties = {
    height: displayHeight ? `${displayHeight}px` : '400px',
  };

  /* -------------------------------------------------------------- */
  /* Edit mode (focus management)                                    */
  /* -------------------------------------------------------------- */
  const { handleExcalidrawRoot } = useDiagramEditMode(editing);

  /* -------------------------------------------------------------- */
  /* Dark mode detection                                             */
  /* -------------------------------------------------------------- */
  const isDark = useStore(selectIsDarkMode);

  /* -------------------------------------------------------------- */
  /* Rendering kernel (excalidraw vs graph)                          */
  /* -------------------------------------------------------------- */
  const { useLegacyExcalidraw } = useDiagramRenderer(snapshot);

  const handleEmbeddedChange = useCallback(
    (json: string) => {
      updateAttributes({ snapshot: json });
    },
    [updateAttributes],
  );

  /* -------------------------------------------------------------- */
  /* Window editing (maximize)                                       */
  /* -------------------------------------------------------------- */
  const { windowOpen, handleMaximize } = useDiagramWindow({
    snapshot,
    blockId,
    isDark,
    updateAttributes,
  });

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
          ref={combinedFigureRef}
          className={`diagram-block-figure ${selected ? 'is-selected' : ''} ${
            editing ? 'is-editing' : ''
          }`}
          style={figureStyle}
          {...interactiveProps}
        >
          {/* Floating toolbar (top-right) — visible when selected */}
          <BlockToolbar selected={selected}>
            <AlignButtonGroup
              nav={{ activeIndex, registerButton }}
              align={effectiveAlign}
              onAlignChange={(a) => updateAttributes({ align: a })}
            />
            <BlockToolbarDivider />
            {/* Enter / leave inline edit mode */}
            <BlockToolbarButton
              nav={{ activeIndex, registerButton }}
              index={2}
              active={editing}
              title={editing ? '完成编辑（Esc）' : '编辑画板（Enter）'}
              onClick={() => (editing ? exitEditing() : enterEditing())}
            >
              {editing ? <Check size={15} /> : <Pencil size={15} />}
            </BlockToolbarButton>
            <BlockToolbarButton
              nav={{ activeIndex, registerButton }}
              index={3}
              title="放大编辑（新窗口）"
              onClick={handleMaximize}
              disabled={windowOpen}
            >
              <Maximize2 size={15} />
            </BlockToolbarButton>
          </BlockToolbar>

          {/* Canvas renderer — kernel routing by snapshot format */}
          <div
            className="diagram-block-canvas"
            contentEditable={false}
            style={canvasStyle}
          >
            {useLegacyExcalidraw ? (
              <ExcalidrawCanvas
                initialSnapshot={snapshot ?? ''}
                onChange={handleEmbeddedChange}
                darkMode={isDark}
                rootElRef={handleExcalidrawRoot}
                editing={editing}
              />
            ) : (
              <GraphCanvas
                initialSnapshot={snapshot ?? ''}
                onChange={handleEmbeddedChange}
                darkMode={isDark}
                rootElRef={handleExcalidrawRoot}
                editing={editing}
              />
            )}
          </div>

          {/* Overlay when NOT editing — enables node selection */}
          {!editing && (
            <div className="diagram-block-overlay" contentEditable={false} />
          )}

          {/* Resize handle — bottom-right, visible when selected */}
          {selected && <ResizeHandle onPointerDown={onResizeStart} />}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
