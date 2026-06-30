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
import { NodeSelection } from '@tiptap/pm/state';
import { Maximize2, Pencil, Check } from 'lucide-react';

import { useNodeResize } from '../hooks/useNodeResize';
import { useEditorWidth } from '../hooks/useEditorWidth';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import {
  BlockToolbar,
  AlignButtonGroup,
  BlockToolbarButton,
  BlockToolbarDivider,
} from '../../ui/BlockToolbar';
import { ResizeHandle } from '../../ui/ResizeHandle';
import { ExcalidrawCanvas } from './ExcalidrawCanvas';
import { openDiagramWindow } from '../../../lib/windows/diagramWindow';
import type { DiagramNodeAttributes } from '../../../lib/extensions/diagramExtension';

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function DiagramBlockView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const { snapshot, width, widthPct, height, heightPct, align } =
    node.attrs as DiagramNodeAttributes;
  const blockId = (node.attrs as DiagramNodeAttributes).id ?? undefined;

  const effectiveAlign = (align ?? 'center') as 'left' | 'center';

  /* -------------------------------------------------------------- */
  /* "Real" selection check                                          */
  /*                                                                 */
  /* TipTap's built-in `selected` prop turns true whenever the       */
  /* editor selection RANGE merely *contains* this node — e.g. a     */
  /* Cmd+Shift+Arrow (or click-drag) text selection that sweeps      */
  /* across the block. We only want the selected chrome (toolbar /   */
  /* ring / resize handle) when the user has genuinely selected THIS */
  /* node — i.e. a NodeSelection pointing exactly at it — not when a */
  /* text selection happens to pass over it.                         */
  /* -------------------------------------------------------------- */
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      const pos = typeof getPos === 'function' ? getPos() : null;
      const sel = editor.state.selection;
      setSelected(
        pos != null && sel instanceof NodeSelection && sel.from === pos,
      );
    };
    compute();
    editor.on('selectionUpdate', compute);
    return () => {
      editor.off('selectionUpdate', compute);
    };
  }, [editor, getPos]);

  /* -------------------------------------------------------------- */
  /* Keyboard navigation for the floating toolbar                    */
  /* -------------------------------------------------------------- */

  // Buttons: align-left, align-center, [edit/done], maximize
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
    true, // interactive: the Excalidraw canvas can take over the keyboard
  );

  // The Excalidraw root element, exposed by ExcalidrawCanvas so we can move
  // DOM focus into it when entering edit mode (makes 1/2/3 tool shortcuts,
  // space-pan, etc. work).
  const excalidrawRootRef = useRef<HTMLDivElement | null>(null);
  const handleExcalidrawRoot = useCallback((el: HTMLDivElement | null) => {
    excalidrawRootRef.current = el;
  }, []);

  // When entering edit mode, focus the Excalidraw surface so it receives keys.
  useEffect(() => {
    if (!editing) return;
    const root = excalidrawRootRef.current;
    if (!root) return;
    const surface =
      (root.querySelector('.excalidraw') as HTMLElement | null) ?? root;
    if (surface.tabIndex < 0) surface.tabIndex = -1;
    surface.focus({ preventScroll: true });
  }, [editing]);

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

  // Lazy migration: if legacy pixel `height` exists but `heightPct` is null,
  // compute the percentage from the current editor width and persist it.
  useEffect(() => {
    if (height != null && heightPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((height / editorWidth) * 100)));
      updateAttributes({ heightPct: pct, height: null });
    }
  }, [height, heightPct, editorWidth, updateAttributes]);

  // Compute the pixel width from widthPct (preferred) or fall back to legacy px.
  const widthPx = widthPct != null ? Math.round((widthPct * editorWidth) / 100) : width;

  // Compute the pixel height from heightPct (preferred) or fall back to legacy px.
  const heightPx = heightPct != null ? Math.round((heightPct * editorWidth) / 100) : height;

  const figureRefInternal = useRef<HTMLDivElement>(null);

  const { ref: figureRef, displayWidth, displayHeight, onResizeStart } =
    useNodeResize<HTMLDivElement>({
      width: widthPx,
      height: heightPx,
      updateAttributes,
      minWidth: 300,
      minHeight: 200,
      fallbackWidth: 520,
      fallbackHeight: 320,
      maxWidth: () => {
        const el = figureRefInternal.current;
        const editorSurface = el?.closest('.ProseMirror') as HTMLElement | null;
        if (editorSurface) {
          const style = getComputedStyle(editorSurface);
          const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
          return editorSurface.clientWidth - padX - 24;
        }
        return window.innerWidth - 24;
      },
      onCommit: (finalWidth, finalHeight) => {
        const pct =
          editorWidth > 0
            ? Math.min(100, Math.max(1, Math.round((finalWidth / editorWidth) * 100)))
            : 50;
        const attrs: Record<string, number | null> = { widthPct: pct, width: null };
        if (finalHeight !== null) {
          const hPct =
            editorWidth > 0
              ? Math.min(100, Math.max(1, Math.round((finalHeight / editorWidth) * 100)))
              : null;
          attrs.heightPct = hPct;
          attrs.height = null;
        }
        return attrs;
      },
    });

  const setFigureRef = useCallback((el: HTMLDivElement | null) => {
    (figureRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    figureRefInternal.current = el;
    interactiveRef(el);
  }, [interactiveRef]);

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
      () => {
        setWindowOpen(false);
        unlistenRef.current?.();
        unlistenRef.current = null;
      },
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
            {/* Enter / leave inline edit mode. While editing, the Excalidraw
                canvas owns the keyboard (1/2/3 tool shortcuts, etc.). */}
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
              rootElRef={handleExcalidrawRoot}
              editing={editing}
            />
          </div>

          {/* Transparent overlay when NOT editing — lets the user click to
              select the node (and the toolbar/resize handle to work) without
              the Excalidraw canvas swallowing the click. Removed in edit mode
              so drawing interactions pass through. */}
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
