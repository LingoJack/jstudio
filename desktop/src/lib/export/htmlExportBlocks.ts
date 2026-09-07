/**
 * Fallback renderers for the single-file HTML export.
 *
 * The export clones the live editor DOM (see `htmlExport.ts`), so node views
 * normally deliver everything: highlighted code, KaTeX formulas, drawn
 * diagrams. This module only covers what the clone cannot: a diagram canvas
 * that never finished drawing — it mounts a throwaway maxGraph canvas
 * offscreen and replays the snapshot into it.
 */

/** Padding around the content bounding box of an exported diagram. */
const DIAGRAM_EXPORT_PADDING = 20;

/** Offscreen canvas size used to lay a diagram out before exporting it. */
const DIAGRAM_CANVAS_WIDTH = 1200;
const DIAGRAM_CANVAS_HEIGHT = 800;

/** Escape text for use in HTML output (element text and attribute values). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a diagram snapshot to a standalone SVG string.
 *
 * Mounts a throwaway maxGraph canvas offscreen, replays the snapshot into it
 * and clones the resulting SVG — dropping the overlay/decorator layers
 * (selection handles) and the flow dots, whose colors come from the app CSS
 * and would render as opaque black outside it.
 *
 * Returns `null` when the snapshot can't be rendered (empty, or a foreign
 * format), letting the caller fall back to a placeholder.
 */
export async function renderDiagramSvg(
  snapshot: string,
  dark: boolean,
): Promise<string | null> {
  if (!snapshot?.trim()) return null;

  let host: HTMLDivElement | null = null;
  let graph: { destroy?: () => void } | null = null;
  try {
    const [{ Graph, getDefaultPlugins }, snapshotModule, modelModule, shapes, obstacle, mindmap] =
      await Promise.all([
        import('@maxgraph/core'),
        // Pure-logic modules that live under components/ (same pattern as
        // terminalDetach.ts → components/terminal/terminalRegistry).
        import('../../components/editor/nodes/graph/graphSnapshot'),
        import('../../components/editor/nodes/graph/graphModel'),
        import('../../components/editor/nodes/graph/customShapes'),
        import('../../components/editor/nodes/graph/obstacleRouting'),
        import('../../components/editor/nodes/graph/mindmapLayout'),
      ]);

    host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${DIAGRAM_CANVAS_WIDTH}px;height:${DIAGRAM_CANVAS_HEIGHT}px;visibility:hidden;`;
    document.body.appendChild(host);

    shapes.registerCustomShapes();
    obstacle.registerObstacleEdgeStyle();
    mindmap.registerMindmapEdgeStyle();

    const instance = new Graph(host, undefined, [...getDefaultPlugins()]);
    graph = instance;
    instance.setHtmlLabels(true);
    modelModule.applySnapshotToGraph(
      instance,
      snapshotModule.parseGraphSnapshot(snapshot),
      dark,
    );
    // Cell labels are measured by the browser; give layout one frame.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const svg = host.querySelector('svg');
    if (!svg) return null;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    const layers = clone.querySelectorAll(':scope > g');
    for (let i = 2; i < layers.length; i += 1) layers[i].remove();
    clone.querySelectorAll('.jgraph-edge-dot').forEach((el) => el.remove());
    clone.removeAttribute('style');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const bounds = instance.getBoundingBoxFromGeometry(
      instance.getChildCells(instance.getDefaultParent()),
      true,
    );
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const width = bounds.width + DIAGRAM_EXPORT_PADDING * 2;
      const height = bounds.height + DIAGRAM_EXPORT_PADDING * 2;
      clone.setAttribute(
        'viewBox',
        `${bounds.x - DIAGRAM_EXPORT_PADDING} ${bounds.y - DIAGRAM_EXPORT_PADDING} ${width} ${height}`,
      );
      clone.setAttribute('width', String(Math.round(width)));
      clone.setAttribute('height', String(Math.round(height)));
    } else {
      clone.setAttribute('viewBox', `0 0 ${DIAGRAM_CANVAS_WIDTH} ${DIAGRAM_CANVAS_HEIGHT}`);
    }
    return clone.outerHTML;
  } catch {
    return null;
  } finally {
    try {
      graph?.destroy?.();
    } catch {
      // Teardown failures are irrelevant for an export.
    }
    host?.remove();
  }
}
