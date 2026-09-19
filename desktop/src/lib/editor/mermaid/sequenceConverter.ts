/**
 * sequenceConverter - Mermaid SequenceDiagram -> GraphSnapshot 转换
 *
 * 将 Mermaid sequenceDiagram 语法解析后的数据转换为 GraphCanvas 可用的快照格式。
 * 时序图布局特点：
 *   - 参与者（participants/actors）水平排列，从左到右
 *   - 每个参与者是一条 lifeline（矩形头部 + 虚线延伸）
 *   - 消息是水平箭头，从一条生命线到另一条
 *   - 消息按时间顺序垂直排列，从上到下
 *
 * 关键设计：
 *   - exit/entry 约束烘焙到 edge style 上（exitX=0.5, entryX=0.5），
 *     保证连线端点钉在生命线中心线上，不会漂移到矩形中点。
 *   - exitAbsY/entryAbsY 存储绝对 Y，供 attachSequenceResizeSync 在
 *     生命线拉长时重算相对 Y，保持连线水平。
 */

import type { SequenceActor, SequenceData, SequenceMessage } from './mermaidParser';
import type { GraphNode, GraphEdge, GraphSnapshot } from '../../../components/editor/nodes/graph/graphSnapshot';
import { HEAD_HEIGHT } from '../../../components/editor/nodes/graph/customShapes';
import { SHAPE_FONT_SIZE } from '../../../components/editor/nodes/graph/graphTheme';
import { measureLabelSize } from '../../../components/editor/nodes/graph/graphTextFit';

/* ------------------------------------------------------------------ */
/* 布局参数                                                            */
/* ------------------------------------------------------------------ */

/** 生命线起始 Y 坐标 */
const LIFELINE_BASE_Y = 50;

/** 参与者（生命线）之间的最小水平间距 */
const PARTICIPANT_SPACING = 160;

/**
 * 消息标签与两端生命线中心线保持的最小水平留白（px）。
 * 相邻生命线间距按其间最长消息标签的估算宽度自适应，保证标签不压到两侧生命线。
 */
const LABEL_EDGE_MARGIN = 10;

/** 生命线头部宽度 */
const LIFELINE_WIDTH = 100;

/** 生命线默认高度（头部 + 虚线延伸），消息很少 / 无消息时的兜底 */
const LIFELINE_DEFAULT_HEIGHT = 150;

/** 最后一条消息结束位置到生命线底端的留白 */
const LIFELINE_BOTTOM_TAIL = 24;

/** 消息之间的最小垂直间距（相邻两条连线的间隔） */
const MESSAGE_SPACING = 40;

/** 标签底边与它自己那条连线的间距（标签整体悬在连线上方） */
const LABEL_LINE_PAD = 4;

/** 自环标签左边缘与 U 形回路竖线的间距 */
const LABEL_LOOP_PAD = 6;

/** 上一条消息的连线 / 自环回路与本条消息标签顶部之间的最小空隙 */
const LABEL_ROW_PAD = 8;

/** 无 DOM 环境（单测）兜底的标签行高 */
const LABEL_LINE_HEIGHT_FALLBACK = 18;

/** 自环消息向右伸出的偏移量 */
const SELF_LOOP_OFFSET = 35;

/* ------------------------------------------------------------------ */
/* Mermaid LINETYPE 常量                                               */
/* ------------------------------------------------------------------ */

/**
 * Mermaid v11 sequence diagram 消息类型常量。
 * 通过运行时测试确认（非 .d.ts 声明值，实际 getMessages() 返回的 type 字段）：
 *   ->> = 0, -->> = 1, -x = 3, --x = 4, -> = 5, --> = 6
 */
const LINETYPE = {
  SOLID_POINT: 0,     // 实线填充箭头 (->>)
  DOTTED_POINT: 1,    // 虚线填充箭头 (-->>
  NOTE: 2,            // 注释（非消息）
  SOLID_CROSS: 3,     // 实线十字 (-x)
  DOTTED_CROSS: 4,    // 虚线十字 (--x)
  SOLID_OPEN: 5,      // 实线开放箭头 (->)
  DOTTED_OPEN: 6,     // 虚线开放箭头 (-->)
} as const;

/** 实际消息类型的白名单（排除 NOTE=2 / LOOP / ALT / OPT 等控制流标记） */
const MESSAGE_TYPES = new Set<number>([
  LINETYPE.SOLID_POINT, LINETYPE.DOTTED_POINT,
  LINETYPE.SOLID_CROSS, LINETYPE.DOTTED_CROSS,
  LINETYPE.SOLID_OPEN, LINETYPE.DOTTED_OPEN,
]);

/* ------------------------------------------------------------------ */
/* 辅助函数                                                            */
/* ------------------------------------------------------------------ */

/**
 * 根据 Mermaid LINETYPE 返回连线样式。
 *
 * @param type mermaid 消息类型数字（LINETYPE 常量）
 */
function getMessageStyle(type: number | undefined): {
  dashed: boolean;
  endArrow: string;
  startArrow?: string;
} {
  switch (type) {
    // 实线填充箭头 ->>
    case LINETYPE.SOLID_POINT:
      return { dashed: false, endArrow: 'classic' };
    // 虚线填充箭头 -->>
    case LINETYPE.DOTTED_POINT:
      return { dashed: true, endArrow: 'classic' };
    // 实线开放箭头 ->
    case LINETYPE.SOLID_OPEN:
      return { dashed: false, endArrow: 'openThin' };
    // 虚线开放箭头 -->
    case LINETYPE.DOTTED_OPEN:
      return { dashed: true, endArrow: 'openThin' };
    // 实线/虚线十字 -x / --x
    case LINETYPE.SOLID_CROSS:
      return { dashed: false, endArrow: 'classic' };
    case LINETYPE.DOTTED_CROSS:
      return { dashed: true, endArrow: 'classic' };
    default:
      return { dashed: false, endArrow: 'classic' };
  }
}

/**
 * 提取消息文本。
 * mermaid v11 中 message 可能是 autonumber 对象 { start, step, visible }，需安全处理。
 */
function extractMessageText(message: unknown): string {
  if (typeof message === 'string') return message;
  return '';
}

/**
 * 过滤出实际的消息条目（排除 note / loop / alt / opt 等控制流标记）。
 */
function filterRealMessages(messages: SequenceMessage[]): SequenceMessage[] {
  return messages.filter((msg) => {
    if (!msg.from || !msg.to) return false;
    if (msg.type != null && !MESSAGE_TYPES.has(msg.type)) return false;
    return true;
  });
}

/**
 * 估算标签在画布上的占位尺寸（图坐标 px）。
 * 有 DOM 时走 measureLabelSize 实测（与画布渲染同字体同字号，零估算误差）：
 * 宽 = 最宽一行，高 = 整块自然高。字符估算只在无 DOM 环境（单测）兜底。
 * 多行标签绝不能把各行宽度加总——那会把间隙撑到实际需要的两倍。
 */
function estimateLabelSize(text: string): { w: number; h: number } {
  if (typeof document !== 'undefined') {
    return measureLabelSize(text);
  }
  // mermaid 消息的换行是 <br>（HTML 标签，画布 htmlLabels 渲染成多行），
  // 与真实的 \n 一并切开。
  const lines = text.replace(/<br\s*\/?>/gi, '\n').split('\n');
  let maxUnits = 0;
  for (const line of lines) {
    let units = 0;
    for (const ch of line) {
      units += ch.charCodeAt(0) > 0xff ? 1 : 0.6;
    }
    maxUnits = Math.max(maxUnits, units);
  }
  return { w: maxUnits * SHAPE_FONT_SIZE, h: lines.length * LABEL_LINE_HEIGHT_FALLBACK };
}

/**
 * 计算相邻生命线之间的水平间距。
 *
 * 相邻两条生命线间的消息标签必须完整落在两条中心线之间，否则会横向溢出、
 * 压到旁边的生命线。因此每个间隙的间距取：
 *   max(默认间距, 其间最长消息标签宽度 + 两侧留白)
 * 自环消息的标签居中于向右伸出的回路竖线上，右半部分也占间隙宽度。
 * 跨多条生命线的消息空间充裕，不参与约束。
 */
function computeGapSpacings(
  actorList: [string, SequenceActor][],
  messages: SequenceMessage[],
  labelSizes: { w: number; h: number }[],
): number[] {
  const actorIndex = new Map<string, number>();
  actorList.forEach(([id], i) => actorIndex.set(id, i));
  const gapCount = Math.max(actorList.length - 1, 0);
  const gapSpacing: number[] = new Array(gapCount).fill(PARTICIPANT_SPACING);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.from || !msg.to) continue;
    const fi = actorIndex.get(msg.from);
    const ti = actorIndex.get(msg.to);
    if (fi === undefined || ti === undefined) continue;

    const textW = labelSizes[i].w;
    if (fi !== ti) {
      if (Math.abs(fi - ti) !== 1) continue;
      const lo = Math.min(fi, ti);
      gapSpacing[lo] = Math.max(gapSpacing[lo], textW + 2 * LABEL_EDGE_MARGIN);
    } else if (fi < gapCount) {
      // 自环：标签整体在回路竖线（centerX + SELF_LOOP_OFFSET）右侧，
      // 右端到中心线的距离为 SELF_LOOP_OFFSET + LABEL_LOOP_PAD + textW。
      const need =
        SELF_LOOP_OFFSET + LABEL_LOOP_PAD + textW + LABEL_EDGE_MARGIN;
      gapSpacing[fi] = Math.max(gapSpacing[fi], need);
    }
  }
  return gapSpacing;
}

/**
 * 生成唯一 ID
 */
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------------------------------------------ */
/* 转换函数                                                            */
/* ------------------------------------------------------------------ */

/**
 * 将 Sequence 数据转换为 GraphSnapshot
 */
export function convertSequenceToSnapshot(data: SequenceData): GraphSnapshot {
  const { actors, messages: rawMessages } = data;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 过滤出实际消息
  const messages = filterRealMessages(rawMessages);

  // 1. 处理参与者 -> lifeline nodes
  const actorList = Array.from(actors.entries());
  const actorIdToNodeId = new Map<string, string>();
  const actorPositions = new Map<string, { x: number; y: number }>();

  // 每条消息的标签占位尺寸：宽用于水平间隙，高用于垂直行距与抬升
  const labelSizes = messages.map((msg) => estimateLabelSize(extractMessageText(msg.message)));

  // 预计算每条消息的 Y 坐标、标签抬升量与自环回路高度。
  // 标签整体悬在连线上方（底边距连线 LABEL_LINE_PAD），抬升量随标签高度走：
  // 单行标签抬 ~13px，三行标签抬 ~31px，标签顶永远不高于上一条连线。
  // 行距按相邻标签高度自适应（multi-line 标签高，固定 40px 会上下互相挤压，
  // 首条消息的标签也会顶进生命线头部框）。
  const msgYs: number[] = [];
  const lifts: number[] = [];
  const loopHs: number[] = [];
  let lastMsgEndY = LIFELINE_BASE_Y + HEAD_HEIGHT;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const selfLoop = msg.from === msg.to;
    const h = labelSizes[i].h;
    // 自环标签水平挪到回路右侧、垂直居中于回路，不需要抬升
    const lift = selfLoop ? 0 : h / 2 + LABEL_LINE_PAD;

    let y: number;
    if (i === 0) {
      // 首条消息：标签（含向上抬升的部分）整体落在头部框之下；
      // 自环标签在回路中部，顶部本来就低于回路顶端
      y = selfLoop
        ? LIFELINE_BASE_Y + HEAD_HEIGHT + LABEL_ROW_PAD
        : LIFELINE_BASE_Y + HEAD_HEIGHT + lift + h + LABEL_ROW_PAD;
    } else {
      const prevMsgY = msgYs[i - 1];
      const prevExtra = loopHs[i - 1] ?? 0; // 上一条是自环时，回路向下多占的高度
      // 两条约束取大：默认节奏；本条标签顶部不压上一条连线 / 自环回路
      y = Math.max(
        prevMsgY + MESSAGE_SPACING,
        prevMsgY + prevExtra + lift + h + LABEL_ROW_PAD,
      );
    }
    msgYs.push(y);
    lifts.push(lift);

    if (selfLoop) {
      // 自环回路高度至少容纳标签（U 形主体在连线下方）
      const loopH = Math.max(40, h + 12);
      loopHs[i] = loopH;
      lastMsgEndY = y + loopH;
    } else {
      loopHs[i] = 0;
      lastMsgEndY = y;
    }
  }

  // 生命线高度：到最后一条消息结束为止，加一小段底部留白。
  const lifelineHeight = Math.max(
    LIFELINE_DEFAULT_HEIGHT,
    lastMsgEndY + LIFELINE_BOTTOM_TAIL,
  );

  // 水平排列参与者：间距按相邻消息标签宽度自适应（见 computeGapSpacings）
  const gapSpacing = computeGapSpacings(actorList, messages, labelSizes);
  let cursorX = 50;
  for (let i = 0; i < actorList.length; i++) {
    const [actorId, actor] = actorList[i];
    const nodeId = genId('lifeline');
    actorIdToNodeId.set(actorId, nodeId);

    const x = cursorX;
    cursorX += gapSpacing[i] ?? 0;
    const y = LIFELINE_BASE_Y;

    actorPositions.set(actorId, { x, y });

    nodes.push({
      id: nodeId,
      shape: actor.type === 'actor' ? 'actor' : 'lifeline',
      x,
      y,
      w: LIFELINE_WIDTH,
      h: lifelineHeight,
      label: actor.description ?? actor.name,
    });
  }

  // 2. 处理消息 -> edges（水平连线）
  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const msg = messages[msgIdx];
    if (!msg.from || !msg.to) continue;

    const fromNodeId = actorIdToNodeId.get(msg.from);
    const toNodeId = actorIdToNodeId.get(msg.to);

    if (!fromNodeId || !toNodeId) continue;

    const fromPos = actorPositions.get(msg.from);
    const toPos = actorPositions.get(msg.to);

    if (!fromPos || !toPos) continue;

    // 消息 Y 坐标：使用预计算的值（自环消息已考虑额外高度）
    const msgY = msgYs[msgIdx];

    // 消息文本
    const labelText = extractMessageText(msg.message);

    const style = getMessageStyle(msg.type);

    // exit/entry 约束：钉在生命线中心线上（x=0.5），Y 为相对比例
    const exitY = (msgY - fromPos.y) / lifelineHeight;
    const entryY = (msgY - toPos.y) / lifelineHeight;

    const edge: GraphEdge = {
      id: genId('msg'),
      source: fromNodeId,
      target: toNodeId,
      label: labelText,
      routing: 'straight', // edgeStyle: 'none'，不做自动路由
      endArrow: style.endArrow,
      exit: { x: 0.5, y: exitY },
      entry: { x: 0.5, y: entryY },
      exitAbsY: msgY,
      entryAbsY: msgY,
      style: {
        dashed: style.dashed,
        labelLift: lifts[msgIdx],
        // 自环标签水平挪到回路竖线右侧（普通消息不偏移）
        labelShiftX:
          msg.from === msg.to
            ? SELF_LOOP_OFFSET + labelSizes[msgIdx].w / 2 + LABEL_LOOP_PAD
            : undefined,
      },
    };

    if (style.startArrow) {
      edge.startArrow = style.startArrow;
    }

    // 自环消息：U 形回路（参照 sequenceInteraction A2 场景），
    // 回路高度与垂直布局阶段一致（loopHs）
    if (msg.from === msg.to) {
      const loopH = loopHs[msgIdx];
      const centerX = fromPos.x + LIFELINE_WIDTH / 2;
      const wpX = centerX + SELF_LOOP_OFFSET;
      const topY = msgY;
      const bottomY = msgY + loopH;
      // 重写 exit/entry 使其在不同 Y 位置
      edge.exit = { x: 0.5, y: (topY - fromPos.y) / lifelineHeight };
      edge.entry = { x: 0.5, y: (bottomY - fromPos.y) / lifelineHeight };
      edge.exitAbsY = topY;
      edge.entryAbsY = bottomY;
      edge.waypoints = [
        { x: wpX, y: topY },
        { x: wpX, y: bottomY },
      ];
    }

    edges.push(edge);
  }

  // 3. 构建快照
  return {
    kind: 'jgraph',
    version: 1,
    nodes,
    edges,
    viewport: {
      scale: 1,
      dx: 0,
      dy: 0,
    },
  };
}
