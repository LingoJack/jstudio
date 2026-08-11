import { getSelectionColor } from "../graphTheme";
import { GRID_SIZE } from "../graphConstants";
import { logger } from "../../../../../lib/core/logger";
import { EnhancedGuide } from "./enhancedGuide";
const setupInteractionConfig = (ctx) => {
  const { graph } = ctx;
  const dark = ctx.darkModeRef.current;
  graph.isCloneEvent = (evt) => {
    const r = evt.metaKey || evt.ctrlKey;
    logger.debug("GraphCanvas", "isCloneEvent -> metaKey|ctrlKey: " + r);
    return r;
  };
  graph.setCellsCloneable(true);
  const rubberBandHandler = graph.getPlugin("RubberBandHandler");
  if (rubberBandHandler) {
    rubberBandHandler.isForceRubberbandEvent = () => false;
  }
  const panningHandler = graph.getPlugin("PanningHandler");
  if (panningHandler) {
    panningHandler.isForcePanningEvent = (me) => {
      const evt = me.getEvent();
      return evt.altKey;
    };
  }
  graph.setGridEnabled(false);
  graph.setGridSize(GRID_SIZE);
  graph.centerZoom = true;
  const selectionHandler = graph.getPlugin("SelectionHandler");
  if (selectionHandler) {
    selectionHandler.guidesEnabled = true;
    selectionHandler.previewColor = getSelectionColor(dark);
    selectionHandler.maxLivePreview = 100;
    selectionHandler.allowLivePreview = true;
    selectionHandler.createGuide = () => {
      return new EnhancedGuide(graph, selectionHandler.getGuideStates(), dark);
    };
  }
};
export {
  setupInteractionConfig
};
