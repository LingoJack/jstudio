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

import { useCallback, useState, useRef, useEffect } from 'react';
import {
  type NodeViewProps,
  NodeViewWrapper,
  type Editor,
} from '@tiptap/react';
import { Maximize2, Pencil, Check, Palette } from 'lucide-react';

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
/* Color presets                                                       */
/* ------------------------------------------------------------------ */

const BG_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: '#ffffff', label: '白色' },
  { value: '#fff8e1', label: '浅黄' },
  { value: '#e3f2fd', label: '浅蓝' },
  { value: '#e8f5e9', label: '浅绿' },
  { value: '#fce4ec', label: '浅粉' },
  { value: '#f3e5f5', label: '浅紫' },
  { value: '#fff3e0', label: '浅橙' },
  { value: '#f5f5f5', label: '浅灰' },
];

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
  const { snapshot, align, bgColor } = attrs;
  const blockId = attrs.id ?? undefined;
  const effectiveAlign = (align ?? 'center') as 'left' | 'center';

  /* -------------------------------------------------------------- */
  /* Selection & toolbar navigation                                  */
  /* -------------------------------------------------------------- */
  const selected = useNodeSelected((editor as Editor | null) ?? null, getPos);

  const toolbarBtnCount = 5;
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
  /* Background color picker popover                                 */
  /* -------------------------------------------------------------- */
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Close the popover when clicking outside or when the block is deselected.
  useEffect(() => {
    if (!colorPickerOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        colorPickerRef.current &&
        !colorPickerRef.current.contains(e.target as Node)
      ) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [colorPickerOpen]);

  useEffect(() => {
    if (!selected) setColorPickerOpen(false);
  }, [selected]);

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
  if (bgColor) {
    canvasStyle.backgroundColor = bgColor;
  }

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
            <BlockToolbarDivider />
            {/* Background color picker */}
            <div className="diagram-color-picker-wrapper" ref={colorPickerRef}>
              <BlockToolbarButton
                nav={{ activeIndex, registerButton }}
                index={4}
                active={!!bgColor}
                title="背景颜色"
                onClick={() => setColorPickerOpen((v) => !v)}
              >
                <Palette size={15} />
              </BlockToolbarButton>
              {colorPickerOpen && (
                <div className="diagram-color-popover" contentEditable={false}>
                  <button
                    type="button"
                    className={`diagram-color-swatch diagram-color-none ${
                      !bgColor ? 'is-active' : ''
                    }`}
                    title="默认背景"
                    onClick={() => {
                      updateAttributes({ bgColor: null });
                      setColorPickerOpen(false);
                    }}
                  />
                  {BG_COLOR_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`diagram-color-swatch ${
                        bgColor === c.value ? 'is-active' : ''
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                      onClick={() => {
                        updateAttributes({ bgColor: c.value });
                        setColorPickerOpen(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
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
