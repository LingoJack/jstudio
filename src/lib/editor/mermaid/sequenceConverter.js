import { HEAD_HEIGHT } from "../../../components/editor/nodes/graph/customShapes";
const LIFELINE_BASE_Y = 50;
const PARTICIPANT_SPACING = 160;
const LIFELINE_WIDTH = 100;
const LIFELINE_DEFAULT_HEIGHT = 200;
const MESSAGE_SPACING = 45;
const MESSAGE_START_Y = LIFELINE_BASE_Y + HEAD_HEIGHT + 25;
const SELF_LOOP_OFFSET = 35;
const LINETYPE = {
  SOLID_POINT: 0,
  // 实线填充箭头 (->>)
  DOTTED_POINT: 1,
  // 虚线填充箭头 (-->>
  NOTE: 2,
  // 注释（非消息）
  SOLID_CROSS: 3,
  // 实线十字 (-x)
  DOTTED_CROSS: 4,
  // 虚线十字 (--x)
  SOLID_OPEN: 5,
  // 实线开放箭头 (->)
  DOTTED_OPEN: 6
  // 虚线开放箭头 (-->)
};
const MESSAGE_TYPES = /* @__PURE__ */ new Set([
  LINETYPE.SOLID_POINT,
  LINETYPE.DOTTED_POINT,
  LINETYPE.SOLID_CROSS,
  LINETYPE.DOTTED_CROSS,
  LINETYPE.SOLID_OPEN,
  LINETYPE.DOTTED_OPEN
]);
function getMessageStyle(type) {
  switch (type) {
    // 实线填充箭头 ->>
    case LINETYPE.SOLID_POINT:
      return { dashed: false, endArrow: "classic" };
    // 虚线填充箭头 -->>
    case LINETYPE.DOTTED_POINT:
      return { dashed: true, endArrow: "classic" };
    // 实线开放箭头 ->
    case LINETYPE.SOLID_OPEN:
      return { dashed: false, endArrow: "openThin" };
    // 虚线开放箭头 -->
    case LINETYPE.DOTTED_OPEN:
      return { dashed: true, endArrow: "openThin" };
    // 实线/虚线十字 -x / --x
    case LINETYPE.SOLID_CROSS:
      return { dashed: false, endArrow: "classic" };
    case LINETYPE.DOTTED_CROSS:
      return { dashed: true, endArrow: "classic" };
    default:
      return { dashed: false, endArrow: "classic" };
  }
}
function extractMessageText(message) {
  if (typeof message === "string") return message;
  return "";
}
function filterRealMessages(messages) {
  return messages.filter((msg) => {
    if (!msg.from || !msg.to) return false;
    if (msg.type != null && !MESSAGE_TYPES.has(msg.type)) return false;
    return true;
  });
}
function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
function convertSequenceToSnapshot(data) {
  const { actors, messages: rawMessages } = data;
  const nodes = [];
  const edges = [];
  const messages = filterRealMessages(rawMessages);
  const actorList = Array.from(actors.entries());
  const actorIdToNodeId = /* @__PURE__ */ new Map();
  const actorPositions = /* @__PURE__ */ new Map();
  const msgYs = [];
  let currentY = MESSAGE_START_Y;
  for (const msg of messages) {
    msgYs.push(currentY);
    if (msg.from === msg.to) {
      const text = extractMessageText(msg.message);
      const loopH = Math.max(40, Math.ceil(text.length * 2.5));
      currentY += loopH + 15;
    } else {
      currentY += MESSAGE_SPACING;
    }
  }
  const totalMsgHeight = currentY - MESSAGE_START_Y;
  const lifelineHeight = Math.max(
    LIFELINE_DEFAULT_HEIGHT,
    MESSAGE_START_Y + totalMsgHeight + 50
  );
  for (let i = 0; i < actorList.length; i++) {
    const [actorId, actor] = actorList[i];
    const nodeId = genId("lifeline");
    actorIdToNodeId.set(actorId, nodeId);
    const x = 50 + i * PARTICIPANT_SPACING;
    const y = LIFELINE_BASE_Y;
    actorPositions.set(actorId, { x, y });
    nodes.push({
      id: nodeId,
      shape: actor.type === "actor" ? "actor" : "lifeline",
      x,
      y,
      w: LIFELINE_WIDTH,
      h: lifelineHeight,
      label: actor.description ?? actor.name
    });
  }
  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const msg = messages[msgIdx];
    if (!msg.from || !msg.to) continue;
    const fromNodeId = actorIdToNodeId.get(msg.from);
    const toNodeId = actorIdToNodeId.get(msg.to);
    if (!fromNodeId || !toNodeId) continue;
    const fromPos = actorPositions.get(msg.from);
    const toPos = actorPositions.get(msg.to);
    if (!fromPos || !toPos) continue;
    const msgY = msgYs[msgIdx];
    const labelText = extractMessageText(msg.message);
    const style = getMessageStyle(msg.type);
    const exitY = (msgY - fromPos.y) / lifelineHeight;
    const entryY = (msgY - toPos.y) / lifelineHeight;
    const edge = {
      id: genId("msg"),
      source: fromNodeId,
      target: toNodeId,
      label: labelText,
      routing: "straight",
      // edgeStyle: 'none'，不做自动路由
      endArrow: style.endArrow,
      exit: { x: 0.5, y: exitY },
      entry: { x: 0.5, y: entryY },
      exitAbsY: msgY,
      entryAbsY: msgY,
      style: {
        dashed: style.dashed
      }
    };
    if (style.startArrow) {
      edge.startArrow = style.startArrow;
    }
    if (msg.from === msg.to) {
      const loopH = Math.max(40, Math.ceil(labelText.length * 2.5));
      const centerX = fromPos.x + LIFELINE_WIDTH / 2;
      const wpX = centerX + SELF_LOOP_OFFSET;
      const topY = msgY;
      const bottomY = msgY + loopH;
      edge.exit = { x: 0.5, y: (topY - fromPos.y) / lifelineHeight };
      edge.entry = { x: 0.5, y: (bottomY - fromPos.y) / lifelineHeight };
      edge.exitAbsY = topY;
      edge.entryAbsY = bottomY;
      edge.waypoints = [
        { x: wpX, y: topY },
        { x: wpX, y: bottomY }
      ];
    }
    edges.push(edge);
  }
  return {
    kind: "jgraph",
    version: 1,
    nodes,
    edges,
    viewport: {
      scale: 1,
      dx: 0,
      dy: 0
    }
  };
}
export {
  convertSequenceToSnapshot
};
