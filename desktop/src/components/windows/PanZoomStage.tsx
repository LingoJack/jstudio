/**
 * PanZoomStage — shared pan/zoom stage for preview surfaces.
 *
 * One implementation of the viewer gestures, used by the standalone mermaid
 * preview window, the image preview window and the HTML preview window
 * (see PreviewWindowApp), and — via MermaidViewer — the editor's inline
 * mermaid block. Built on react-zoom-pan-pinch; like MermaidViewer before
 * it, the lib's built-in panning stays disabled and we drive `panBy` /
 * `zoomToPoint` ourselves, so editor (ProseMirror) and window behaviour
 * stay identical.
 *
 * Gestures (see specs/preview-window in the openspec change
 * `preview-window-pan-zoom`):
 *   - wheelMode "always-zoom" (preview windows): ANY wheel — plain,
 *     Cmd/Ctrl, or trackpad pinch (which reports ctrlKey) — zooms anchored
 *     at the cursor. Page never scrolls.
 *   - wheelMode "ctrl-zoom" (editor inline preview): only Cmd/Ctrl+wheel
 *     zooms; the plain wheel is left alone so the editor page scrolls.
 *   - left / middle / right button drag: pan (the app's global contextmenu
 *     handler in main.tsx already suppresses the native menu).
 *   - double-click: reset to the fitted size.
 *   - optional −/+/(fit) toolbar (standalone windows).
 *
 * Consumers that embed event sources the parent document cannot see (the
 * sandboxed preview iframe swallows wheel/mouse events into its own
 * document) use the imperative handle to forward them: mirror listeners on
 * `iframe.contentDocument` (same-origin) call `handleWheel` /
 * `handlePanStart|Move|End` with coordinates converted into the parent's
 * space. The incremental lastX/lastY pan model makes the handoff between
 * the two documents seamless.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";

// Zoom limits and wheel feel (shared by the editor block and preview windows).
const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
// Wheels may report line deltas (deltaMode 1); normalize them to pixels.
const WHEEL_LINE_HEIGHT_PX = 40;
// Mouse buttons that pan: left, middle, right. Exported for consumers that
// forward gestures from nested documents (the preview iframe).
export const PAN_BUTTONS = new Set([0, 1, 2]);

export type PanZoomWheelMode = "always-zoom" | "ctrl-zoom";

/** Wheel event fields needed by the handle — WheelEvent is assignable. */
export interface PanZoomWheelInput {
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  metaKey: boolean;
  ctrlKey: boolean;
}

/**
 * Imperative API for embedding external event sources (iframe forwarding)
 * and driving the stage programmatically. Coordinates are in the STAGE's
 * parent viewport space.
 */
export interface PanZoomStageHandle {
  /** Zoom by a wheel delta anchored at the given cursor position. */
  handleWheel(input: PanZoomWheelInput): void;
  handlePanStart(clientX: number, clientY: number): void;
  handlePanMove(clientX: number, clientY: number): void;
  handlePanEnd(): void;
  isPanning(): boolean;
}

interface PanZoomStageProps {
  /** "always-zoom" (preview windows) or "ctrl-zoom" (editor inline). */
  wheelMode: PanZoomWheelMode;
  /** Content to zoom/pan (mermaid stage div, <img>, iframe wrap, …). */
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Editor mode: the stage sits inside a ProseMirror node view. */
  contentEditable?: boolean;
  /** Layer rendered above the content (editor: click-to-select overlay). */
  overlay?: React.ReactNode;
  /** Show the −/+/(fit) toolbar (standalone preview windows). */
  showControls?: boolean;
  /** Forwards the root element (editor: legacy mermaidPreviewRef). */
  containerRef?: React.Ref<HTMLDivElement | null>;
  /** react-zoom-pan-pinch class overrides (mermaid keeps its legacy skin). */
  wrapperClass?: string;
  contentClass?: string;
}

const PanZoomStage = forwardRef<PanZoomStageHandle, PanZoomStageProps>(
  function PanZoomStage(
    {
      wheelMode,
      children,
      className,
      style,
      contentEditable,
      overlay,
      showControls,
      containerRef,
      wrapperClass = "pan-zoom-viewport",
      contentClass = "pan-zoom-content",
    },
    ref,
  ) {
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

    const shouldZoom = useCallback(
      (input: { metaKey: boolean; ctrlKey: boolean }) =>
        wheelMode === "always-zoom" || input.metaKey || input.ctrlKey,
      [wheelMode],
    );

    const handleWheel = useCallback(
      (input: PanZoomWheelInput) => {
        if (!shouldZoom(input)) return;
        const api = apiRef.current;
        if (!api) return;
        const factor =
          input.deltaMode === 1 ? WHEEL_LINE_HEIGHT_PX : 1;
        const deltaY = input.deltaY * factor;
        const nextScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, api.state.scale * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY)),
        );
        if (nextScale === api.state.scale) return;
        api.zoomToPoint(nextScale, input.clientX, input.clientY, 0);
      },
      [shouldZoom],
    );

    // Incremental pan: every move applies just the delta from the previous
    // position, so events forwarded from the iframe document and events
    // caught on the parent window hand off seamlessly mid-drag.
    const handlePanStart = useCallback((x: number, y: number) => {
      if (!apiRef.current) return;
      panStateRef.current = { lastX: x, lastY: y };
      rootRef.current?.classList.add("is-panning");
    }, []);

    const handlePanMove = useCallback((x: number, y: number) => {
      const pan = panStateRef.current;
      if (!pan) return;
      apiRef.current?.panBy(x - pan.lastX, y - pan.lastY, 0);
      pan.lastX = x;
      pan.lastY = y;
    }, []);

    const handlePanEnd = useCallback(() => {
      if (!panStateRef.current) return;
      panStateRef.current = null;
      rootRef.current?.classList.remove("is-panning");
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        handleWheel,
        handlePanStart,
        handlePanMove,
        handlePanEnd,
        isPanning: () => panStateRef.current != null,
      }),
      [handleWheel, handlePanStart, handlePanMove, handlePanEnd],
    );

    // Wheel: native non-passive listener so preventDefault sticks - React
    // attaches onWheel passively, and wheel zoom must not reach Chromium's
    // page zoom or the WebView's native pinch zoom.
    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        if (!shouldZoom(e)) return;
        e.preventDefault();
        e.stopPropagation();
        handleWheel(e);
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [shouldZoom, handleWheel]);

    // Drag-to-pan + double-click reset (not the lib's built-in panning - see
    // the component doc). move/up live on window so a drag keeps running
    // outside the stage; the null-guard keeps them idle otherwise.
    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;

      const onMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest(".pan-zoom-controls")) return;
        if (!PAN_BUTTONS.has(e.button) || !apiRef.current) return;
        // No text-selection drag, no middle-click autoscroll; the app's
        // global contextmenu handler already suppresses the menu on
        // right-click (preview iframes re-suppress it per-document).
        e.preventDefault();
        handlePanStart(e.clientX, e.clientY);
      };
      const onMouseMove = (e: MouseEvent) => handlePanMove(e.clientX, e.clientY);
      const onMouseUp = () => handlePanEnd();
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
    }, [handlePanStart, handlePanMove, handlePanEnd]);

    return (
      <div
        ref={setRootRef}
        className={`pan-zoom-stage ${className ?? ""}`}
        style={style}
        contentEditable={contentEditable}
        onDragStart={(e) => e.preventDefault()}
      >
        {overlay}
        <TransformWrapper
          ref={apiRef}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          // Free panning: at scale 1 the content exactly fills the viewport,
          // so the default limitToBounds clamps panBy to zero and drag feels
          // dead until the user zooms in. Free panning matches the old
          // hand-rolled image viewer; double-click / ⊗ resets recover.
          limitToBounds={false}
          wheel={{ wheelDisabled: true }}
          panning={{ disabled: true }}
          doubleClick={{ disabled: true }}
        >
          <TransformComponent
            wrapperClass={wrapperClass}
            contentClass={contentClass}
          >
            {children}
          </TransformComponent>
        </TransformWrapper>
        {showControls && (
          <div className="preview-zoom pan-zoom-controls">
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
  },
);

export default PanZoomStage;
