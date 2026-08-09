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

import type { SequenceData, SequenceMessage } from './mermaidParser';
import type { GraphNode, GraphEdge, GraphSnapshot } from '../../../components/editor/nodes/graph/graphSnapshot';
import { HEAD_HEIGHT } from '../../../components/editor/nodes/graph/customShapes';

/* ------------------------------------------------------------------ */
/* 布局参数                                                            */
/* ------------------------------------------------------------------ */

/** 生命线起始 Y 坐标 */
const LIFELINE_BASE_Y = 50;

/** 参与者（生命线）之间的水平间距 */
const PARTICIPANT_SPACING = 160;

/** 生命线头部宽度 */
const LIFELINE_WIDTH = 100;

/** 生命线默认高度（头部 + 虚线延伸） */
const LIFELINE_DEFAULT_HEIGHT = 200;

/** 消息之间的垂直间距 */
const MESSAGE_SPACING = 45;

/** 消息起始 Y 坐标（生命线头部下方，绝对坐标） */
const MESSAGE_START_Y = LIFELINE_BASE_Y + HEAD_HEIGHT + 25;

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

  // 计算生命线高度：基于消息数量
  const messageCount = messages.length;
  const lifelineHeight = Math.max(
    LIFELINE_DEFAULT_HEIGHT,
    MESSAGE_START_Y + messageCount * MESSAGE_SPACING + 50,
  );

  // 水平排列参与者
  for (let i = 0; i < actorList.length; i++) {
    const [actorId, actor] = actorList[i];
    const nodeId = genId('lifeline');
    actorIdToNodeId.set(actorId, nodeId);

    const x = 50 + i * PARTICIPANT_SPACING;
    const y = LIFELINE_BASE_Y;

    actorPositions.set(actorId, { x, y });

    nodes.push({
      id: nodeId,
      shape: 'lifeline',
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
    const fromNodeId = actorIdToNodeId.get(msg.from);
    const toNodeId = actorIdToNodeId.get(msg.to);

    if (!fromNodeId || !toNodeId) continue;

    const fromPos = actorPositions.get(msg.from);
    const toPos = actorPositions.get(msg.to);

    if (!fromPos || !toPos) continue;

    // 消息 Y 坐标：按序号递增（绝对坐标，相对于画布）
    const msgY = MESSAGE_START_Y + msgIdx * MESSAGE_SPACING;

    // 消息文本
    const labelText = extractMessageText(msg.message);

    const style = getMessageStyle(msg.type);

    // exit/entry 约束：钉在生命线中心线上（x=0.5），Y 为相对比例
    // 这保证连线端点不会漂移到矩形中点（perimeter 模式），而是精确落在
    // 生命线中心虚线的指定高度上。
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
      },
    };

    if (style.startArrow) {
      edge.startArrow = style.startArrow;
    }

    // 自环消息：添加航点形成右侧 U 形回路
    // 参照 sequenceInteraction A2 场景
    if (msg.from === msg.to) {
      const centerX = fromPos.x + LIFELINE_WIDTH / 2;
      const wpX = centerX + SELF_LOOP_OFFSET;
      edge.waypoints = [
        { x: wpX, y: msgY },
        { x: wpX, y: msgY },
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
