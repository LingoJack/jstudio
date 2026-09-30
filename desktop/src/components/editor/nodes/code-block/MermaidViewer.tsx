/**
 * MermaidViewer - pan/zoom stage for a rendered mermaid SVG.
 *
 * A thin mermaid-specific shell over the shared PanZoomStage, which owns
 * ALL gesture wiring (see that component for the interaction model and the
 * react-zoom-pan-pinch driving notes):
 *   - editor inline preview (default wheelMode "ctrl-zoom"): only
 *     Cmd/Ctrl+wheel zooms so the plain wheel keeps scrolling the editor
 *     page; drag-pan works on left/middle/right; the click-to-select
 *     overlay, contentEditable passthrough and legacy mermaidPreviewRef
 *     forwarding are all preserved.
 *   - standalone preview window (wheelMode "always-zoom" + showControls):
 *     any wheel zooms anchored at the cursor, drag pans, toolbar present.
 *
 * The SVG is letterboxed inside a viewport-sized stage via CSS
 * (max-width/max-height against its intrinsic width/height attributes), so
 * scale 1 always equals "fit to container" and resetTransform() returns to
 * that state.
 */

import { useI18n } from "../../../../lib/core/i18n";
import PanZoomStage, {
  type PanZoomWheelMode,
} from "../../../windows/PanZoomStage";

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
  /** Preview window: any wheel zooms. Default "ctrl-zoom" (editor). */
  wheelMode?: PanZoomWheelMode;
  /** Show the −/+/(fit) toolbar (standalone preview window). */
  showControls?: boolean;
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
  wheelMode = "ctrl-zoom",
  showControls,
  containerRef,
}: MermaidViewerProps) {
  const { t } = useI18n();

  return (
    <PanZoomStage
      wheelMode={wheelMode}
      showControls={showControls}
      contentEditable={contentEditable}
      containerRef={containerRef}
      className={`mermaid-viewer ${className ?? ""}`}
      style={style}
      // Keep the legacy mermaid skin (sizing + letterboxing) instead of the
      // generic pan-zoom classes.
      wrapperClass="mermaid-viewer-viewport"
      contentClass="mermaid-viewer-content"
      // Error block stays an unzoomed layer above the content, matching the
      // previous DOM order (overlay, error, diagram, controls).
      overlay={
        <>
          {overlay}
          {error && (
            <div className="code-block-mermaid-error">
              <p>{t("mermaid.renderError")}</p>
              <pre>{error}</pre>
            </div>
          )}
        </>
      }
    >
      {svg && (
        <div
          className="mermaid-viewer-stage"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </PanZoomStage>
  );
}
