/**
 * MermaidViewer - pan/zoom stage for a rendered mermaid SVG.
 *
 * Built on react-zoom-pan-pinch (open-source pan/zoom component) and shared
 * by the editor's inline mermaid preview block and the standalone mermaid
 * preview window, replacing the previous hand-rolled pan/zoom HTML.
 *
 * Interactions:
 *   - Cmd/Ctrl + wheel (mac trackpad pinch reports ctrlKey): zoom anchored
 *     at the cursor
 *   - drag with left / middle / right button: pan
 *   - plain wheel: pans the diagram (window mode) or scrolls the page
 *     untouched (editor mode)
 *   - double-click: reset to the fitted size
 *   - optional -/+/(fit) toolbar (window mode)
 *
 * The SVG is letterboxed inside a viewport-sized stage via CSS
 * (max-width/max-height against its intrinsic width/height attributes), so
 * scale 1 always equals "fit to container" and resetTransform() returns to
 * that state.
 *
 * Why drag-pan is implemented here instead of the lib's built-in panning:
 * its mousedown gate refuses any target with a `[contenteditable="true"]`
 * ancestor - always true inside the ProseMirror editor host - so built-in
 * panning can never start in the editor. Driving `panBy` from our own
 * listeners keeps editor and window behaviour identical.
 */

import { useCallback, useEffect, useRef } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import { useI18n } from "../../../../lib/core/i18n";

// Zoom limits and wheel feel (shared by the editor block and preview window).
const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
// Wheels may report line deltas (deltaMode 1); normalize them to pixels.
const WHEEL_LINE_HEIGHT_PX = 40;
// Mouse buttons that pan: left, middle, right.
const PAN_BUTTONS = new Set([0, 1, 2]);

interface MermaidViewerProps {
  /** Rendered mermaid SVG markup (mermaid.render output). */
  svg: string | null;
  /** Parse error shown instead of the diagram. */
  error?: string | null;
  className?: string;
  style?: React.CSSProperties;
  /** Editor mode: the stage sits inside a ProseMirror node view. */
  contentEditable?: boolean;
  /** Layer rendered above the diagram (editor: click-to-select overlay). */
  overlay?: React.ReactNode;
  /** Show the -/+/(fit) toolbar (standalone preview window). */
  showControls?: boolean;
  /** Pan the diagram with the plain (unmodified) wheel (preview window). */
  panOnWheel?: boolean;
  /** Forwards the root element (editor: legacy mermaidPreviewRef). */
  containerRef?: React.Ref<HTMLDivElement | null>;
}

export default function MermaidViewer({
  svg,
  error,
  className,
  style,
  contentEditable,
  overlay,
  showControls,
  panOnWheel,
  containerRef,
}: MermaidViewerProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const panStateRef = useRef<{ lastX: number; lastY: number } | null>(null);

  const setRootRef = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      if (!containerRef) return;
      if (typeof containerRef === "function") containerRef(el);
      else containerRef.current = el;
    },
    [containerRef],
  );

  // Native non-passive listener so preventDefault sticks - React attaches
  // onWheel passively, and Cmd/Ctrl+wheel must not reach Chromium's page zoom.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const factor = e.deltaMode === 1 ? WHEEL_LINE_HEIGHT_PX : 1;
      const deltaX = e.deltaX * factor;
      const deltaY = e.deltaY * factor;
      if (!e.metaKey && !e.ctrlKey) {
        if (!panOnWheel) return;
        e.preventDefault();
        apiRef.current?.panBy(-deltaX, -deltaY, 0);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const api = apiRef.current;
      if (!api) return;
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, api.state.scale * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY)),
      );
      if (nextScale === api.state.scale) return;
      api.zoomToPoint(nextScale, e.clientX, e.clientY, 0);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [panOnWheel]);

  // Drag-to-pan + double-click reset (see the component doc for why this is
  // not the lib's built-in panning). move/up live on window so a drag keeps
  // running outside the block; the null-guard keeps them idle otherwise.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".mermaid-viewer-controls")) return;
      if (!PAN_BUTTONS.has(e.button) || !apiRef.current) return;
      // No text-selection drag, no middle-click autoscroll; the app's global
      // contextmenu handler already suppresses the menu on right-click.
      e.preventDefault();
      panStateRef.current = { lastX: e.clientX, lastY: e.clientY };
      el.classList.add("is-panning");
    };
    const onMouseMove = (e: MouseEvent) => {
      const pan = panStateRef.current;
      if (!pan) return;
      apiRef.current?.panBy(e.clientX - pan.lastX, e.clientY - pan.lastY, 0);
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
    };
    const onMouseUp = () => {
      if (!panStateRef.current) return;
      panStateRef.current = null;
      el.classList.remove("is-panning");
    };
    const onDoubleClick = () => {
      apiRef.current?.resetTransform();
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("dblclick", onDoubleClick);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("dblclick", onDoubleClick);
    };
  }, []);

  return (
    <div
      ref={setRootRef}
      className={`mermaid-viewer ${className ?? ""}`}
      style={style}
      contentEditable={contentEditable}
      onDragStart={(e) => e.preventDefault()}
    >
      {overlay}
      {error && (
        <div className="code-block-mermaid-error">
          <p>{t("mermaid.renderError")}</p>
          <pre>{error}</pre>
        </div>
      )}
      {svg && (
        <TransformWrapper
          ref={apiRef}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          limitToBounds
          wheel={{ wheelDisabled: true }}
          panning={{ disabled: true }}
          doubleClick={{ disabled: true }}
        >
          <TransformComponent
            wrapperClass="mermaid-viewer-viewport"
            contentClass="mermaid-viewer-content"
          >
            <div
              className="mermaid-viewer-stage"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </TransformComponent>
        </TransformWrapper>
      )}
      {showControls && (
        <div className="preview-zoom mermaid-viewer-controls">
          <button type="button" onClick={() => apiRef.current?.zoomOut()}>
            −
          </button>
          <button type="button" onClick={() => apiRef.current?.zoomIn()}>
            +
          </button>
          <button
            type="button"
            onClick={() => apiRef.current?.resetTransform()}
          >
            ⊗
          </button>
        </div>
      )}
    </div>
  );
}
