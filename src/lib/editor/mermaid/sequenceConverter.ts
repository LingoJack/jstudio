/**
 * sequenceConverter — Mermaid SequenceDiagram → GraphSnapshot 转换
 *
 * 将 Mermaid sequenceDiagram 语法解析后的数据转换为 GraphCanvas 可用的快照格式。
 * 时序图布局特点：
 *   - 参与者（participants/actors）水平排列，从左到右
 *   - 每个参与者是一条 lifeline（矩形头部 + 虚线延伸）
 *   - 消息是水平箭头，从一条生命线到另一条
 *   - 消息按时间顺序垂直排列，从上到下
 *   - 激活框贴在生命线上，表示对象处于活跃状态
 *   - 注释（note）附在生命线旁边
 */

import type { SequenceData, SequenceActor, SequenceMessage, SequenceNote } from './mermaidParser';
import type { GraphNode, GraphEdge, GraphSnapshot } from '../../../components/editor/nodes/graph/graphSnapshot';
import { HEAD_HEIGHT } from '../../../components/editor/nodes/graph/customShapes';

/* ------------------------------------------------------------------ */
/* 布局参数                                                            */
/* ------------------------------------------------------------------ */

/** 参与者（生命线）之间的水平间距 */
const PARTICIPANT_SPACING = 150;

/** 生命线头部宽度 */
const LIFELINE_WIDTH = 100;

/** 生命线默认高度（头部 + 虚线延伸） */
const LIFELINE_DEFAULT_HEIGHT = 200;

/** 消息之间的垂直间距 */
const MESSAGE_SPACING = 40;

/** 消息起始 Y 坐标（头部下方） */
const MESSAGE_START_Y = HEAD_HEIGHT + 20;

/** 激活框宽度 */
const ACTIVATION_WIDTH = 16;

/** 激活框默认高度 */
const ACTIVATION_DEFAULT_HEIGHT = 40;

/** 注释框宽度 */
const NOTE_WIDTH = 100;

/** 注释框高度 */
const NOTE_HEIGHT = 60;

/* ------------------------------------------------------------------ */
/* 辅助函数                                                            */
/* ------------------------------------------------------------------ */

/**
 * 判断消息类型对应的连线样式
 *
 * Mermaid 消息类型：
 *   - 实线箭头: -> 或 ->
 *   - 实线无箭头: - 或 -x
 *   - 虚线箭头: --> 或 --> 或 ~~>
 *   - 虚线无箭头: -- 或 --x
 *
 * @param type 消息类型数字（-1, 0, 1, 2）
 */
function getMessageStyle(type: number | undefined): {
  dashed: boolean;
  endArrow: string;
} {
  // mermaid 内部 type 定义：
  // -1: 实线箭头
  // 0: 实线无箭头
  // 1: 虚线箭头
  // 2: 虚线无箭头
  switch (type) {
    case -1:
      return { dashed: false, endArrow: 'classic' };
    case 0:
      return { dashed: false, endArrow: 'none' };
    case 1:
      return { dashed: true, endArrow: 'classic' };
    case 2:
      return { dashed: true, endArrow: 'none' };
    default:
      return { dashed: false, endArrow: 'classic' };
  }
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
  const { actors, messages, notes } = data;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 1. 处理参与者 → lifeline nodes
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
    const y = 50;

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

  // 2. 处理消息 → edges（水平连线）
  // 跟踪每个参与者的当前激活状态（用于生成激活框）
  const activationStates = new Map<string, { active: boolean; startY: number; nodeId?: string }>();
  for (const [actorId] of actorList) {
    activationStates.set(actorId, { active: false, startY: 0 });
  }

  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const msg = messages[msgIdx];
    const fromNodeId = actorIdToNodeId.get(msg.from);
    const toNodeId = actorIdToNodeId.get(msg.to);

    // 跳过无效消息
    if (!fromNodeId || !toNodeId) continue;

    const fromPos = actorPositions.get(msg.from);
    const toPos = actorPositions.get(msg.to);

    if (!fromPos || !toPos) continue;

    // 消息 Y 坐标：按序号递增
    const msgY = MESSAGE_START_Y + msgIdx * MESSAGE_SPACING;

    // 消息连线：从源生命线中心到目标生命线中心
    // lifeline 节点宽度为 LIFELINE_WIDTH，中心 x = x + LIFELINE_WIDTH/2
    const fromCenterX = fromPos.x + LIFELINE_WIDTH / 2;
    const toCenterX = toPos.x + LIFELINE_WIDTH / 2;

    const style = getMessageStyle(msg.type);

    // 创建连线（时序图消息是水平箭头）
    edges.push({
      id: genId('msg'),
      source: fromNodeId,
      target: toNodeId,
      label: msg.message,
      routing: 'straight', // 时序图消息通常是直线
      endArrow: style.endArrow,
      style: {
        dashed: style.dashed,
      },
    });

  }

  // 3. 处理注释 → note nodes
  for (const note of notes) {
    const actorId = note.from;
    const actorPos = actorPositions.get(actorId);

    if (!actorPos) continue;

    const noteNodeId = genId('note');

    // 注释位置：根据 note.type 决定在生命线的左侧或右侧
    const isLeft = note.type === 'left';
    const noteX = isLeft
      ? actorPos.x - NOTE_WIDTH - 20
      : actorPos.x + LIFELINE_WIDTH + 20;

    // 注释 Y：跟随对应消息的位置（如果有）或放在顶部
    const noteY = 50 + HEAD_HEIGHT + 10;

    nodes.push({
      id: noteNodeId,
      shape: 'note',
      x: noteX,
      y: noteY,
      w: NOTE_WIDTH,
      h: NOTE_HEIGHT,
      label: note.message,
    });

    // 注释与生命线的连线（虚线）
    const lifelineNodeId = actorIdToNodeId.get(actorId);
    if (lifelineNodeId) {
      edges.push({
        id: genId('note-edge'),
        source: noteNodeId,
        target: lifelineNodeId,
        routing: 'straight',
        endArrow: 'none',
        style: {
          dashed: true,
        },
      });
    }
  }

  // 4. 构建快照
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