/**
 * DiagramBlockView — React NodeView for the diagram (jgraph) block.
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

import { useCallback, useEffect, useRef } from 'react';
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

import { useCmdEnterConfirm } from '../../../lib/windows/useCmdEnterConfirm';
import { useStore, selectIsDarkMode } from '../../../store';
import {
  BlockToolbar,
  AlignButtonGroup,
  BlockToolbarButton,
  BlockToolbarDivider,
} from '../../ui/BlockToolbar';
import { ResizeHandle } from '../../ui/ResizeHandle';

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
  const { handleRootRef } = useDiagramEditMode(editing);

  // Cmd/Ctrl+Enter：确认提交，退出编辑模式（与 toolbar 的 ✓ 按钮等价）。
  // capture 阶段拦截，避免 maxGraph 内置 keymap 抢先消费。
  useCmdEnterConfirm(exitEditing, editing);

  /**
   * Shield double-click inside the canvas from ProseMirror and the browser.
   *
   * When the user double-clicks a shape, two things happen:
   *
   * 1. The second `mousedown` (detail === 2) is **ignored** by maxGraph
   *    (`isEventIgnored` returns true when `lastEvent.detail === 2`), so
   *    maxGraph does NOT call `stopPropagation()` on it. The event bubbles
   *    up to ProseMirror, whose `handlers.mousedown` calls
   *    `handleDoubleClick` (returns false by default) WITHOUT calling
   *    `preventDefault()`. The browser then performs native word/element
   *    selection — and since the canvas is `contentEditable={false}` inside
   *    the editor's `contentEditable={true}`, the browser can't find a
   *    proper word boundary and ends up selecting the entire document.
   *
   * 2. The `dblclick` event fires on the container. maxGraph calls
   *    `graph.dblClick(evt)` but, because `cell` is `null` (the container
   *    listener doesn't resolve the cell), `InternalEvent.consume(evt)` is
   *    never called. The unconsumed `dblclick` bubbles up, and its default
   *    action can also trigger selection in some browsers.
   *
   * A *native* listener is required because ProseMirror's handler lives on
   * `view.dom` (an ancestor). React's synthetic `onMouseDown`/`onDoubleClick`
   * is delegated to the React root and would fire *after* ProseMirror has
   * already processed the event.
   *
   * The fix:
   *  - `mousedown` with `detail >= 2`: `preventDefault()` stops the browser's
   *    native word/paragraph selection; `stopPropagation()` prevents
   *    ProseMirror's `eventBelongsToView` from even running.
   *  - `dblclick`: `preventDefault()` + `stopPropagation()` blocks the
   *    browser's `dblclick` default action and prevents bubbling to PM.
   *
   * Neither listener affects maxGraph: its listeners are on inner elements
   * (the graph container) that fire *before* the event reaches this wrapper.
   * Single clicks (`detail === 1`) are unaffected.
   */
  const canvasRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.detail >= 2) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('dblclick', onDblClick);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('dblclick', onDblClick);
    };
  }, []);

  /* -------------------------------------------------------------- */
  /* Dark mode detection                                             */
  /* -------------------------------------------------------------- */
  const isDark = useStore(selectIsDarkMode);


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

          {/* Canvas renderer */}
          <div
            ref={canvasRef}
            className="diagram-block-canvas"
            contentEditable={false}
            style={canvasStyle}
          >
            <GraphCanvas
              initialSnapshot={snapshot ?? ''}
              onChange={handleEmbeddedChange}
              darkMode={isDark}
              rootElRef={handleRootRef}
              editing={editing}
            />
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
