const H_SPACING = 140;
const V_SPACING = 100;
const ORIGIN_OFFSET = 50;
function autoLayoutGraph(nodes, edges) {
  if (nodes.length === 0) return { nodes, edges };
  const nodeIds = nodes.map((n) => n.id);
  const outgoing = /* @__PURE__ */ new Map();
  const incoming = /* @__PURE__ */ new Map();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const edge of edges) {
    if (outgoing.has(edge.source)) outgoing.get(edge.source).push(edge.target);
    if (incoming.has(edge.target)) incoming.get(edge.target).push(edge.source);
  }
  const inDegree = /* @__PURE__ */ new Map();
  for (const id of nodeIds) inDegree.set(id, incoming.get(id)?.length ?? 0);
  const levels = [];
  const assigned = /* @__PURE__ */ new Set();
  const queue = [];
  for (const id of nodeIds) {
    if (inDegree.get(id) === 0) queue.push(id);
  }
  if (queue.length === 0) queue.push(nodeIds[0]);
  while (queue.length > 0) {
    const currentLevel = [...queue];
    levels.push(currentLevel);
    queue.length = 0;
    for (const id of currentLevel) {
      assigned.add(id);
      for (const next of outgoing.get(id) ?? []) {
        if (assigned.has(next)) continue;
        const deg = inDegree.get(next) ?? 1;
        inDegree.set(next, deg - 1);
        if (deg - 1 <= 0) queue.push(next);
      }
    }
    if (queue.length === 0) {
      for (const id of nodeIds) {
        if (!assigned.has(id)) {
          queue.push(id);
          break;
        }
      }
    }
  }
  const positions = /* @__PURE__ */ new Map();
  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const level = levels[levelIdx];
    for (let nodeIdx = 0; nodeIdx < level.length; nodeIdx++) {
      positions.set(level[nodeIdx], {
        x: nodeIdx * H_SPACING + ORIGIN_OFFSET,
        y: levelIdx * V_SPACING + ORIGIN_OFFSET
      });
    }
  }
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, {
        x: ORIGIN_OFFSET,
        y: levels.length * V_SPACING + ORIGIN_OFFSET
      });
    }
  }
  const laidOutNodes = nodes.map((node) => {
    const pos = positions.get(node.id);
    return pos ? { ...node, x: pos.x, y: pos.y } : node;
  });
  return { nodes: laidOutNodes, edges };
}
const SEQ_PARTICIPANT_W = 100;
const SEQ_PARTICIPANT_SPACING = 150;
const SEQ_HEAD_HEIGHT = 50;
const SEQ_MESSAGE_SPACING = 40;
const SEQ_MESSAGE_START_Y = SEQ_HEAD_HEIGHT + 20;
const SEQ_MARGIN = 50;
const SEQ_ACTIVATION_W = 16;
const SEQ_ACTIVATION_H = 40;
function autoLayoutSequence(nodes, edges) {
  if (nodes.length === 0) return { nodes, edges };
  const lifelines = nodes.filter((n) => n.shape === "lifeline");
  const activations = nodes.filter((n) => n.shape === "activation");
  const others = nodes.filter(
    (n) => n.shape !== "lifeline" && n.shape !== "activation"
  );
  if (lifelines.length === 0) return autoLayoutGraph(nodes, edges);
  const lifelineIds = new Set(lifelines.map((n) => n.id));
  const messageEdges = edges.filter(
    (e) => lifelineIds.has(e.source) && lifelineIds.has(e.target)
  );
  const numMessages = Math.max(messageEdges.length, 1);
  const lifelineH = Math.max(
    200,
    SEQ_MESSAGE_START_Y + numMessages * SEQ_MESSAGE_SPACING + SEQ_MARGIN
  );
  const lifelineX = /* @__PURE__ */ new Map();
  const laidOutLifelines = lifelines.map((node, i) => {
    const x = SEQ_MARGIN + i * SEQ_PARTICIPANT_SPACING;
    lifelineX.set(node.id, x);
    return {
      ...node,
      x,
      y: SEQ_MARGIN,
      w: SEQ_PARTICIPANT_W,
      h: lifelineH
    };
  });
  const edgesByNode = /* @__PURE__ */ new Map();
  for (const e of edges) {
    for (const id of [e.source, e.target]) {
      if (!edgesByNode.has(id)) edgesByNode.set(id, []);
      edgesByNode.get(id).push({ source: e.source, target: e.target });
    }
  }
  function findConnectedLifeline(nodeId) {
    const conns = edgesByNode.get(nodeId) ?? [];
    for (const c of conns) {
      if (c.source === nodeId && lifelineIds.has(c.target)) return c.target;
      if (c.target === nodeId && lifelineIds.has(c.source)) return c.source;
    }
    return void 0;
  }
  const activationCountByLifeline = /* @__PURE__ */ new Map();
  const laidOutActivations = activations.map((node) => {
    const llId = findConnectedLifeline(node.id) ?? lifelines[0].id;
    const llX = lifelineX.get(llId) ?? SEQ_MARGIN;
    const llW = SEQ_PARTICIPANT_W;
    const idx = activationCountByLifeline.get(llId) ?? 0;
    activationCountByLifeline.set(llId, idx + 1);
    return {
      ...node,
      x: llX + (llW - SEQ_ACTIVATION_W) / 2,
      y: SEQ_MARGIN + SEQ_MESSAGE_START_Y + idx * SEQ_ACTIVATION_H,
      w: SEQ_ACTIVATION_W,
      h: SEQ_ACTIVATION_H
    };
  });
  const otherCountByLifeline = /* @__PURE__ */ new Map();
  const laidOutOthers = others.map((node) => {
    const llId = findConnectedLifeline(node.id) ?? lifelines[0].id;
    const llX = lifelineX.get(llId) ?? SEQ_MARGIN;
    const idx = otherCountByLifeline.get(llId) ?? 0;
    otherCountByLifeline.set(llId, idx + 1);
    const nodeW = node.w || 80;
    const nodeH = node.h || 48;
    return {
      ...node,
      x: llX + (SEQ_PARTICIPANT_W - nodeW) / 2,
      y: SEQ_MARGIN - nodeH - 10 - idx * (nodeH + 10),
      w: nodeW,
      h: nodeH
    };
  });
  const messageEdgeIds = new Set(messageEdges.map((e) => e.id));
  let msgIndex = 0;
  const laidOutEdges = edges.map((e) => {
    if (!messageEdgeIds.has(e.id)) {
      return { ...e, routing: "straight" };
    }
    const srcX = (lifelineX.get(e.source) ?? SEQ_MARGIN) + SEQ_PARTICIPANT_W / 2;
    const dstX = (lifelineX.get(e.target) ?? SEQ_MARGIN) + SEQ_PARTICIPANT_W / 2;
    const msgY = SEQ_MARGIN + SEQ_MESSAGE_START_Y + msgIndex * SEQ_MESSAGE_SPACING;
    msgIndex += 1;
    if (e.source === e.target) {
      const loopW = 40;
      return {
        ...e,
        routing: "straight",
        waypoints: [
          { x: srcX, y: msgY },
          { x: srcX + loopW, y: msgY },
          { x: srcX + loopW, y: msgY + 20 },
          { x: srcX, y: msgY + 20 }
        ]
      };
    }
    return {
      ...e,
      routing: "straight",
      waypoints: [
        { x: srcX, y: msgY },
        { x: dstX, y: msgY }
      ]
    };
  });
  return {
    nodes: [...laidOutLifelines, ...laidOutActivations, ...laidOutOthers],
    edges: laidOutEdges
  };
}
function autoLayoutByType(nodes, edges) {
  const hasLifeline = nodes.some((n) => n.shape === "lifeline");
  if (hasLifeline) return autoLayoutSequence(nodes, edges);
  return autoLayoutGraph(nodes, edges);
}
export {
  autoLayoutByType,
  autoLayoutGraph,
  autoLayoutSequence
};
