import {
  InternalEvent,
  Point
} from "@maxgraph/core";
import { invoke } from "@tauri-apps/api/core";
import { HEAD_HEIGHT } from "./customShapes";
function graphLog(msg) {
  console.log(`[autoActivation] ${msg}`);
  invoke("write_graph_log", { msg }).catch(() => {
  });
}
graphLog("sequenceInteraction module loaded");
function getShapeName(cell) {
  if (!cell || cell.isEdge()) return void 0;
  const style = cell.getStyle();
  return style?.shape;
}
function isLifeline(cell) {
  return getShapeName(cell) === "lifeline";
}
function isActivation(cell) {
  return getShapeName(cell) === "umlActivation";
}
function isActor(cell) {
  return getShapeName(cell) === "umlActor";
}
function isSequenceNode(cell) {
  return isLifeline(cell) || isActivation(cell);
}
function attachHorizontalMessageConstraint(handler) {
  const origUpdateCurrentState = handler.updateCurrentState.bind(handler);
  const origUpdateEdgeState = handler.updateEdgeState.bind(handler);
  handler.updateCurrentState = (me, point) => {
    if (handler.first && handler.previous) {
      const sourceCell = handler.previous.cell;
      if (sourceCell && isSequenceNode(sourceCell)) {
        const isSelfLoop = handler.currentState?.cell === sourceCell;
        if (!isSelfLoop) {
          point.y = handler.first.y;
        }
      }
    }
    origUpdateCurrentState(me, point);
  };
  handler.updateEdgeState = (current, constraint) => {
    if (handler.first && handler.previous) {
      const sourceCell = handler.previous.cell;
      if (sourceCell && isSequenceNode(sourceCell) && current) {
        const isSelfLoop = handler.currentState?.cell === sourceCell;
        if (!isSelfLoop) {
          current.y = handler.first.y;
        }
      }
    }
    origUpdateEdgeState(current, constraint);
  };
  return () => {
    handler.updateCurrentState = origUpdateCurrentState;
    handler.updateEdgeState = origUpdateEdgeState;
  };
}
const ACTIVATION_W = 16;
const ACTIVATION_H = 40;
let activationIdCounter = 0;
function genActivationId() {
  activationIdCounter += 1;
  return `auto-act-${Date.now()}-${activationIdCounter}`;
}
function owningLifeline(graph, cell) {
  if (!cell) return null;
  if (isLifeline(cell)) return cell;
  if (!isActivation(cell)) return null;
  const geo = cell.getGeometry();
  if (!geo) return null;
  const cx = geo.x + geo.width / 2;
  for (const ll of graph.getChildVertices(graph.getDefaultParent())) {
    if (!isLifeline(ll)) continue;
    const lg = ll.getGeometry();
    if (lg && Math.abs(lg.x + lg.width / 2 - cx) < 1) return ll;
  }
  return null;
}
function hasOpenCallTo(graph, targetLl, srcLl) {
  let calls = 0;
  let returns = 0;
  for (const e of graph.getChildEdges(graph.getDefaultParent())) {
    const s = owningLifeline(graph, e.getTerminal(true));
    const t = owningLifeline(graph, e.getTerminal(false));
    if (!s || !t) continue;
    const dashed = e.getStyle()?.dashed === true;
    if (!dashed && s === targetLl && t === srcLl) calls += 1;
    if (dashed && s === srcLl && t === targetLl) returns += 1;
  }
  return calls > returns;
}
function attachAutoActivation(graph, handler, activationStyleProvider, isEnabled) {
  const listener = (_sender, evt) => {
    const edge = evt.getProperty("cell");
    graphLog(`CONNECT fired, edge=${edge?.getId()}, isEdge=${edge?.isEdge()}`);
    if (!edge || !edge.isEdge()) return;
    const model = graph.getDataModel();
    const source = edge.getTerminal(true);
    const target = edge.getTerminal(false);
    const srcShape = source?.getStyle()?.shape;
    const tgtShape = target?.getStyle()?.shape;
    graphLog(`source=${source?.getId()}(shape=${srcShape}), target=${target?.getId()}(shape=${tgtShape})`);
    if (!source || !target) return;
    const sourceIsLL = isLifeline(source);
    const targetIsLL = isLifeline(target);
    const sourceIsAct = isActivation(source);
    const targetIsAct = isActivation(target);
    const isSelfLoop = source === target && sourceIsAct;
    let isReturnMessage = false;
    if (sourceIsAct && targetIsLL && !isSelfLoop) {
      const srcLl = owningLifeline(graph, source);
      isReturnMessage = srcLl === target || (srcLl ? hasOpenCallTo(graph, target, srcLl) : false);
    }
    const bothActivation = sourceIsAct && targetIsAct && !isSelfLoop;
    const shouldGenerate = targetIsLL && !isReturnMessage;
    graphLog(`isSelfLoop=${isSelfLoop}, isReturn=${isReturnMessage}, bothAct=${bothActivation}, shouldGenerate=${shouldGenerate}`);
    if (isSelfLoop) {
      model.beginUpdate();
      try {
        const s = edge.getStyle();
        const exitX = s?.exitX ?? 0.5;
        const exitY = s?.exitY ?? 0.5;
        const entryX2 = s?.entryX ?? 0.5;
        const entryY2 = s?.entryY ?? 0.5;
        const acGeo = source.getGeometry();
        let exitAbsY = 0;
        let entryAbsY = 0;
        if (acGeo) {
          exitAbsY = acGeo.y + exitY * acGeo.height;
          entryAbsY = acGeo.y + entryY2 * acGeo.height;
        }
        model.setStyle(edge, {
          ...s,
          // 注意：必须写 'none' 而非 undefined——Stylesheet 合并会跳过 undefined，
          // 全局默认 obstacleEdgeStyle 会漏进来把直线重新路由成折线。
          edgeStyle: "none",
          endArrow: "classic",
          exitAbsY,
          entryAbsY
        });
        const geo = edge.getGeometry()?.clone();
        if (geo && acGeo) {
          geo.sourcePoint = null;
          geo.targetPoint = null;
          const loopOffset = 30;
          if (exitX >= 0.5 && entryX2 >= 0.5) {
            const wpX = acGeo.x + acGeo.width + loopOffset;
            geo.points = [new Point(wpX, exitAbsY), new Point(wpX, entryAbsY)];
          } else if (exitX < 0.5 && entryX2 < 0.5) {
            const wpX = acGeo.x - loopOffset;
            geo.points = [new Point(wpX, exitAbsY), new Point(wpX, entryAbsY)];
          }
          model.setGeometry(edge, geo);
        }
      } finally {
        model.endUpdate();
      }
      return;
    }
    const isLifelineSelfLoop = source === target && sourceIsLL && targetIsLL;
    if (isLifelineSelfLoop) {
      model.beginUpdate();
      try {
        const s = edge.getStyle();
        const exitY = s?.exitY ?? 0.5;
        const entryY2 = s?.entryY ?? 0.5;
        const llGeo = source.getGeometry();
        let exitAbsY = 0;
        let entryAbsY = 0;
        if (llGeo) {
          exitAbsY = llGeo.y + exitY * llGeo.height;
          entryAbsY = llGeo.y + entryY2 * llGeo.height;
        }
        model.setStyle(edge, {
          ...s,
          // 必须写 'none'：否则全局默认 obstacleEdgeStyle 会把直线重新路由成折线
          edgeStyle: "none",
          endArrow: "classic",
          exitAbsY,
          entryAbsY
        });
        const geo = edge.getGeometry()?.clone();
        if (geo && llGeo) {
          geo.sourcePoint = null;
          geo.targetPoint = null;
          const centerX = llGeo.x + llGeo.width / 2;
          const loopOffset = 30;
          const wpX = centerX + loopOffset;
          geo.points = [new Point(wpX, exitAbsY), new Point(wpX, entryAbsY)];
          model.setGeometry(edge, geo);
        }
      } finally {
        model.endUpdate();
      }
      return;
    }
    if (bothActivation) {
      model.beginUpdate();
      try {
        const style = edge.getStyle();
        const srcGeo = source.getGeometry();
        const tgtGeo = target.getGeometry();
        const exitAbsY = style?.exitY != null && srcGeo ? srcGeo.y + style.exitY * srcGeo.height : 0;
        const entryAbsY = style?.entryY != null && tgtGeo ? tgtGeo.y + style.entryY * tgtGeo.height : 0;
        model.setStyle(edge, {
          ...style ?? {},
          edgeStyle: "none",
          endArrow: "classic",
          exitAbsY,
          entryAbsY
        });
        const geo = edge.getGeometry()?.clone();
        if (geo) {
          geo.sourcePoint = null;
          geo.targetPoint = null;
          model.setGeometry(edge, geo);
        }
      } finally {
        model.endUpdate();
      }
      return;
    }
    if (isReturnMessage) {
      model.beginUpdate();
      try {
        const style = edge.getStyle();
        const acGeo = source.getGeometry();
        const llGeo = target.getGeometry();
        const exitAbsY = style?.exitY != null && acGeo ? acGeo.y + style.exitY * acGeo.height : 0;
        const cleaned = { ...style ?? {} };
        delete cleaned.entryPerimeter;
        delete cleaned.entryDx;
        delete cleaned.entryDy;
        if (style?.exitY != null && llGeo && llGeo.height > 0) {
          cleaned.entryX = 0.5;
          cleaned.entryY = (exitAbsY - llGeo.y) / llGeo.height;
          cleaned.entryAbsY = exitAbsY;
        } else {
          delete cleaned.entryX;
          delete cleaned.entryY;
        }
        model.setStyle(edge, { ...cleaned, edgeStyle: "none", endArrow: "openThin", dashed: true, exitAbsY });
        const retGeo = edge.getGeometry()?.clone();
        if (retGeo) {
          retGeo.sourcePoint = null;
          retGeo.targetPoint = null;
          model.setGeometry(edge, retGeo);
        }
      } finally {
        model.endUpdate();
      }
      return;
    }
    if (!shouldGenerate) return;
    const targetGeo = target.getGeometry();
    if (!targetGeo) return;
    const sourceGeo = source.getGeometry();
    const edgeStyle0 = edge.getStyle();
    const exitYRel = edgeStyle0?.exitY;
    const edgeGeo0 = edge.getGeometry();
    let msgY;
    if (exitYRel != null && sourceGeo) {
      msgY = sourceGeo.y + exitYRel * sourceGeo.height;
      graphLog(`msgY=${msgY} from exit constraint (exitY=${exitYRel}, srcY=${sourceGeo.y}, srcH=${sourceGeo.height})`);
    } else if (edgeGeo0?.sourcePoint) {
      msgY = edgeGeo0.sourcePoint.y;
      graphLog(`msgY=${msgY} from edge.sourcePoint (${edgeGeo0.sourcePoint.x}, ${edgeGeo0.sourcePoint.y})`);
    } else if (handler.first) {
      msgY = handler.first.y;
      graphLog(`msgY=${msgY} from handler.first (${handler.first.x}, ${handler.first.y})`);
    } else {
      msgY = targetGeo.y + HEAD_HEIGHT + 30;
      graphLog(`msgY=${msgY} fallback to targetGeo.y + HEAD_HEIGHT + 30`);
    }
    if (isEnabled && !isEnabled()) {
      graphLog("autoActivation disabled, styling as plain horizontal message");
      model.beginUpdate();
      try {
        const style = edge.getStyle() ?? {};
        const cleaned = { ...style };
        delete cleaned.entryPerimeter;
        delete cleaned.entryDx;
        delete cleaned.entryDy;
        cleaned.entryX = 0.5;
        cleaned.entryY = (msgY - targetGeo.y) / targetGeo.height;
        cleaned.entryAbsY = msgY;
        if (exitYRel != null && sourceGeo) {
          cleaned.exitAbsY = sourceGeo.y + exitYRel * sourceGeo.height;
        }
        model.setStyle(edge, { ...cleaned, edgeStyle: "none", endArrow: "classic" });
        const noActGeo = edge.getGeometry()?.clone();
        if (noActGeo) {
          noActGeo.sourcePoint = null;
          noActGeo.targetPoint = null;
          model.setGeometry(edge, noActGeo);
        }
      } finally {
        model.endUpdate();
      }
      return;
    }
    const targetCenterX = targetGeo.x + targetGeo.width / 2;
    const actGeo = {
      x: targetCenterX - ACTIVATION_W / 2,
      y: msgY - ACTIVATION_H * 0.25,
      w: ACTIVATION_W,
      h: ACTIVATION_H
    };
    const sourceCenterX = sourceGeo ? sourceGeo.x + sourceGeo.width / 2 : 0;
    const sourceIsLeft = sourceCenterX < targetCenterX;
    const entryX = sourceIsLeft ? 0 : 1;
    const entryY = 0.25;
    model.beginUpdate();
    try {
      const parent = graph.getDefaultParent();
      const actStyle = activationStyleProvider ? activationStyleProvider() : { shape: "umlActivation" };
      const actCell = graph.insertVertex({
        parent,
        id: genActivationId(),
        value: "",
        position: [actGeo.x, actGeo.y],
        size: [actGeo.w, actGeo.h],
        style: actStyle
      });
      model.setTerminal(edge, actCell, false);
      const style = edge.getStyle() ?? {};
      const cleaned = { ...style };
      delete cleaned.entryPerimeter;
      delete cleaned.entryDx;
      delete cleaned.entryDy;
      const exitAbsYVal = exitYRel != null && sourceGeo ? sourceGeo.y + exitYRel * sourceGeo.height : msgY;
      model.setStyle(edge, { ...cleaned, entryX, entryY, edgeStyle: "none", endArrow: "classic", entryAbsY: msgY, exitAbsY: exitAbsYVal });
      const finalGeo = edge.getGeometry()?.clone();
      if (finalGeo) {
        finalGeo.sourcePoint = null;
        finalGeo.targetPoint = null;
        model.setGeometry(edge, finalGeo);
      }
    } finally {
      model.endUpdate();
    }
  };
  handler.addListener(InternalEvent.CONNECT, listener);
  return () => {
    handler.removeListener(listener);
  };
}
const HOVER_DOT_CLASS = "jgraph-lifeline-hover-dot";
function attachLifelineHoverDot(graph, container) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", HOVER_DOT_CLASS);
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "10";
  svg.style.overflow = "visible";
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.style.stroke = "var(--vscode-diagram-edge, var(--vscode-focusBorder, #4A90E2))";
  line.setAttribute("stroke-width", "3");
  line.setAttribute("stroke-opacity", "0.6");
  line.setAttribute("stroke-linecap", "round");
  line.style.display = "none";
  const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line2.style.stroke = "var(--vscode-diagram-edge, var(--vscode-focusBorder, #4A90E2))";
  line2.setAttribute("stroke-width", "3");
  line2.setAttribute("stroke-opacity", "0.6");
  line2.setAttribute("stroke-linecap", "round");
  line2.style.display = "none";
  svg.appendChild(line);
  svg.appendChild(line2);
  const prevPosition = container.style.position;
  if (!prevPosition || prevPosition === "static") {
    container.style.position = "relative";
  }
  container.appendChild(svg);
  function hide() {
    line.style.display = "none";
    line2.style.display = "none";
  }
  function onMouseMove(e) {
    const view = graph.getView();
    const scale = view.scale;
    const tr = view.translate;
    const rect = container.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const graphX = (clientX - rect.width * 0) / scale - tr.x;
    const graphY = (clientY - rect.height * 0) / scale - tr.y;
    const cell = graph.getCellAt(graphX, graphY);
    if (isLifeline(cell)) {
      const geo = cell.getGeometry();
      if (geo) {
        if (graphY > geo.y + HEAD_HEIGHT && graphY < geo.y + geo.height) {
          const centerX = geo.x + geo.width / 2;
          const startY = geo.y + HEAD_HEIGHT;
          const endY = geo.y + geo.height;
          const viewX = (centerX + tr.x) * scale;
          const viewStartY = (startY + tr.y) * scale;
          const viewEndY = (endY + tr.y) * scale;
          line.setAttribute("x1", String(viewX));
          line.setAttribute("y1", String(viewStartY));
          line.setAttribute("x2", String(viewX));
          line.setAttribute("y2", String(viewEndY));
          line.style.display = "";
          line2.style.display = "none";
          return;
        }
      }
    }
    if (isActivation(cell)) {
      const geo = cell.getGeometry();
      if (geo) {
        const leftX = geo.x;
        const rightX = geo.x + geo.width;
        const startY = geo.y;
        const endY = geo.y + geo.height;
        const viewLeftX = (leftX + tr.x) * scale;
        const viewRightX = (rightX + tr.x) * scale;
        const viewStartY = (startY + tr.y) * scale;
        const viewEndY = (endY + tr.y) * scale;
        line.setAttribute("x1", String(viewLeftX));
        line.setAttribute("y1", String(viewStartY));
        line.setAttribute("x2", String(viewLeftX));
        line.setAttribute("y2", String(viewEndY));
        line.style.display = "";
        line2.setAttribute("x1", String(viewRightX));
        line2.setAttribute("y1", String(viewStartY));
        line2.setAttribute("x2", String(viewRightX));
        line2.setAttribute("y2", String(viewEndY));
        line2.style.display = "";
        return;
      }
    }
    hide();
  }
  function onMouseDown() {
    hide();
  }
  container.addEventListener("mousemove", onMouseMove, { passive: true });
  container.addEventListener("mousedown", onMouseDown, { passive: true });
  container.addEventListener("mouseleave", hide, { passive: true });
  return () => {
    container.removeEventListener("mousemove", onMouseMove);
    container.removeEventListener("mousedown", onMouseDown);
    container.removeEventListener("mouseleave", hide);
    svg.remove();
    if (!prevPosition || prevPosition === "static") {
      container.style.position = prevPosition || "";
    }
  };
}
function attachActorSourceBlock(graph) {
  const origIsValidSource = graph.isValidSource.bind(graph);
  graph.isValidSource = (cell) => {
    if (isActor(cell)) return false;
    return origIsValidSource(cell);
  };
  return () => {
    graph.isValidSource = origIsValidSource;
  };
}
function attachActivationImmovable(graph) {
  const orig = graph.isCellMovable.bind(graph);
  graph.isCellMovable = (cell) => {
    if (!cell) return false;
    if (isActivation(cell)) return false;
    return orig(cell);
  };
  return () => {
    graph.isCellMovable = orig;
  };
}
function attachSequenceResizeSync(graph) {
  const listener = (_sender, evt) => {
    const cells = evt.getProperty("cells");
    if (!cells || cells.length === 0) return;
    const prevs = evt.getProperty("prev");
    const model = graph.getDataModel();
    model.beginUpdate();
    try {
      for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i];
        if (!isActivation(cell) && !isLifeline(cell) && !isActor(cell)) continue;
        const cellGeo = cell.getGeometry();
        if (!cellGeo || cellGeo.height === 0) continue;
        const prevGeo = prevs?.[i];
        const edges = graph.getEdges(cell, graph.getDefaultParent(), true, true, true);
        for (const edge of edges) {
          const style = edge.getStyle();
          if (!style) continue;
          const patch = {};
          const isSource = edge.getTerminal(true) === cell;
          const isTarget = edge.getTerminal(false) === cell;
          if (isTarget) {
            let absY = style.entryAbsY;
            if (absY == null && style.entryY != null && prevGeo && prevGeo.height > 0) {
              absY = prevGeo.y + style.entryY * prevGeo.height;
              patch.entryAbsY = absY;
            }
            if (absY != null) {
              patch.entryY = (absY - cellGeo.y) / cellGeo.height;
            }
          }
          if (isSource) {
            let absY = style.exitAbsY;
            if (absY == null && style.exitY != null && prevGeo && prevGeo.height > 0) {
              absY = prevGeo.y + style.exitY * prevGeo.height;
              patch.exitAbsY = absY;
            }
            if (absY != null) {
              patch.exitY = (absY - cellGeo.y) / cellGeo.height;
            }
          }
          if (Object.keys(patch).length > 0) {
            model.setStyle(edge, { ...style, ...patch });
          }
        }
      }
    } finally {
      model.endUpdate();
    }
  };
  graph.addListener(InternalEvent.CELLS_RESIZED, listener);
  return () => {
    graph.removeListener(listener);
  };
}
function attachSequenceInteraction(graph, handler, container, activationStyleProvider, isEnabled) {
  graphLog(`attachSequenceInteraction called, handler=${handler ? "ok" : "null"}, container=${container ? "ok" : "null"}`);
  const cleanup1 = attachHorizontalMessageConstraint(handler);
  const cleanup2 = attachAutoActivation(graph, handler, activationStyleProvider, isEnabled);
  const cleanup3 = attachLifelineHoverDot(graph, container);
  const cleanup4 = attachActorSourceBlock(graph);
  const cleanup5 = attachActivationImmovable(graph);
  const cleanup6 = attachSequenceResizeSync(graph);
  graphLog("attachSequenceInteraction done, 6 hooks installed");
  return () => {
    cleanup1();
    cleanup2();
    cleanup3();
    cleanup4();
    cleanup5();
    cleanup6();
  };
}
export {
  attachActivationImmovable,
  attachActorSourceBlock,
  attachAutoActivation,
  attachHorizontalMessageConstraint,
  attachLifelineHoverDot,
  attachSequenceInteraction,
  attachSequenceResizeSync,
  isActivation,
  isActor,
  isLifeline,
  isSequenceNode,
  owningLifeline
};
