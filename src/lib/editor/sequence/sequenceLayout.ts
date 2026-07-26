/**
 * sequenceLayout — 时序图节点/边生成的**唯一**入口。
 *
 * 输入：抽象领域模型（参与者 + 消息列表）
 * 输出：一份可直接塞进 GraphSnapshot 的 nodes / edges 片段
 *
 * 这是本次重构（plan-unify-sequence-diagram-logic.md）的核心。
 *
 * 三条生成路径都调用它：
 *   1. Mermaid 导入   (mermaid/sequenceConverter.ts)
 *   2. AI 生成布局    (aiGraph/aiGraphLayout.ts autoLayoutSequence)
 *   3. 手绘 auto-act  (graph/sequenceInteraction.ts attachAutoActivation)
 *
 * 输出的时序图结构保证一致：
 *   - 参与者 = shape 'lifeline'（不再用 'actor'——umlActor 只用于用例图）
 *   - 活动块 = shape 'activation'，位于 target lifeline 的中心线上
 *   - 消息   = edge，target 指向 activation（如启用 autoActivation），
 *              带 waypoints 固化 msgY，确保多条消息不叠加
 *
 * 布局参数全部来自 sequenceConstants.ts，不再有本地魔法数。
 */

import type {
  GraphEdge,
  GraphNode,
} from '../../../components/editor/nodes/graph/graphSnapshot';
import type { Participant, SeqMessage } from './sequenceModel';
import {
  ACTIVATION_HEIGHT,
  ACTIVATION_WIDTH,
  CANVAS_MARGIN,
  LIFELINE_BOTTOM_PADDING,
  LIFELINE_DEFAULT_HEIGHT,
  LIFELINE_WIDTH,
  MESSAGE_SPACING,
  MESSAGE_START_Y,
  PARTICIPANT_SPACING,
} from './sequenceConstants';

/* ------------------------------------------------------------------ */
/* Options / Result                                                    */
/* ------------------------------------------------------------------ */

export interface SequenceLayoutOptions {
  /**
   * 是否为每条入站消息在 target lifeline 上自动生成一个 activation 节点，
   * 并把消息 edge 的 target 改为该 activation。默认 true。
   *
   * 关掉后可产出"极简时序图"（无活动块，消息直接连生命线）——
   * 目前没有调用方使用，保留为未来扩展。
   */
  autoActivation?: boolean;

  /**
   * activation 节点 id 生成器；默认为 `${message.id}-act`。
   * 允许外部（如手绘交互）用自己的 id 方案。
   */
  activationIdFor?: (message: SeqMessage, index: number) => string;

  /**
   * lifeline / activation / edge 生成时的可选前缀（用于 AI 场景避免 id 冲突）。
   * 默认为空。
   */
  idPrefix?: string;
}

export interface SequenceLayoutResult {
  /** lifeline + activation 节点。 */
  nodes: GraphNode[];
  /** 消息 edge（含 waypoints；若 autoActivation，target 指向 activation）。 */
  edges: GraphEdge[];
  /** msgId → activationNodeId 的映射（未启用 autoActivation 时为空）。 */
  activationByMessage: Map<string, string>;
  /** 每条 lifeline 的最终几何信息，便于调用方追加 note 等挂件。 */
  lifelineGeometry: Map<string, LifelineGeometry>;
}

/** 一条 lifeline 的最终几何（画布绝对坐标）。 */
export interface LifelineGeometry {
  /** lifeline 节点 id。 */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** lifeline 中心 X（消息水平线的落点）。 */
  centerX: number;
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

/**
 * 从参与者 + 消息列表生成时序图的 nodes/edges。
 */
export function layoutSequence(
  participants: Participant[],
  messages: SeqMessage[],
  opts: SequenceLayoutOptions = {},
): SequenceLayoutResult {
  const autoActivation = opts.autoActivation !== false;
  const activationIdFor =
    opts.activationIdFor ?? ((msg, _idx) => `${msg.id}-act`);
  const prefix = opts.idPrefix ?? '';

  if (participants.length === 0) {
    return {
      nodes: [],
      edges: [],
      activationByMessage: new Map(),
      lifelineGeometry: new Map(),
    };
  }

  /* -------- 1. 生命线高度 ------------------------------------------ */
  const numMessages = Math.max(messages.length, 1);
  const lifelineH = Math.max(
    LIFELINE_DEFAULT_HEIGHT,
    MESSAGE_START_Y + numMessages * MESSAGE_SPACING + LIFELINE_BOTTOM_PADDING,
  );

  /* -------- 2. 水平排列 lifeline ----------------------------------- */
  const lifelineGeometry = new Map<string, LifelineGeometry>();
  const lifelineNodes: GraphNode[] = participants.map((p, i) => {
    const x = CANVAS_MARGIN + i * PARTICIPANT_SPACING;
    const y = CANVAS_MARGIN;
    const geo: LifelineGeometry = {
      id: prefix + p.id,
      x,
      y,
      w: LIFELINE_WIDTH,
      h: lifelineH,
      centerX: x + LIFELINE_WIDTH / 2,
    };
    lifelineGeometry.set(p.id, geo);
    return {
      id: prefix + p.id,
      shape: 'lifeline',
      x,
      y,
      w: LIFELINE_WIDTH,
      h: lifelineH,
      label: p.label,
    };
  });

  /* -------- 3. 消息 + activation ----------------------------------- */
  const activationNodes: GraphNode[] = [];
  const activationByMessage = new Map<string, string>();
  const messageEdges: GraphEdge[] = [];

  messages.forEach((msg, i) => {
    const fromGeo = lifelineGeometry.get(msg.fromParticipantId);
    const toGeo = lifelineGeometry.get(msg.toParticipantId);
    if (!fromGeo || !toGeo) return; // 悬空消息忽略

    const msgY = CANVAS_MARGIN + MESSAGE_START_Y + i * MESSAGE_SPACING;
    const srcX = fromGeo.centerX;
    const dstX = toGeo.centerX;

    /* 生成 activation（自动模式，且非自消息才生成——自消息目标在同一 lifeline，
       落点位置歧义，暂不生成 activation，与既有手绘/AI 实现保持一致）。 */
    let edgeTargetId = toGeo.id;
    let edgeDstX = dstX;
    const isSelf = msg.fromParticipantId === msg.toParticipantId;

    if (autoActivation && !isSelf) {
      const actId = prefix + activationIdFor(msg, i);
      const actX = toGeo.centerX - ACTIVATION_WIDTH / 2;
      const actY = msgY - ACTIVATION_HEIGHT / 2;
      activationNodes.push({
        id: actId,
        shape: 'activation',
        x: actX,
        y: actY,
        w: ACTIVATION_WIDTH,
        h: ACTIVATION_HEIGHT,
        label: '',
      });
      activationByMessage.set(msg.id, actId);
      edgeTargetId = actId;
      // 消息终点从生命线中心右移到 activation 左边缘，看起来更像"消息触达激活块"
      edgeDstX = actX + (srcX < actX ? 0 : ACTIVATION_WIDTH);
    }

    /* 组装 edge */
    // UML 惯例：dashed（返回/异步响应）默认用 openThin 开放箭头；
    // 非 dashed（同步调用）用 classic 实心三角箭头。
    // 若 msg.endArrow 显式指定则以其为准（如 Mermaid `-)` 使用 oval）。
    const defaultEndArrow = msg.dashed ? 'openThin' : 'classic';
    const edge: GraphEdge = {
      id: prefix + msg.id,
      source: fromGeo.id,
      target: edgeTargetId,
      label: msg.label ?? '',
      routing: 'straight',
      endArrow: msg.endArrow ?? defaultEndArrow,
    };
    if (msg.dashed) edge.style = { ...(edge.style ?? {}), dashed: true };

    /* waypoints：静态固化 msgY，保证多消息不叠加 */
    if (isSelf) {
      // 自消息回路：右移 40 画一个"回自身"的方框
      const loopW = 40;
      edge.waypoints = [
        { x: srcX, y: msgY },
        { x: srcX + loopW, y: msgY },
        { x: srcX + loopW, y: msgY + 20 },
        { x: srcX, y: msgY + 20 },
      ];
    } else {
      edge.waypoints = [
        { x: srcX, y: msgY },
        { x: edgeDstX, y: msgY },
      ];
    }

    messageEdges.push(edge);
  });

  return {
    nodes: [...lifelineNodes, ...activationNodes],
    edges: messageEdges,
    activationByMessage,
    lifelineGeometry,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers（供手绘交互复用）                                            */
/* ------------------------------------------------------------------ */

/**
 * 计算一个"贴在 target lifeline 中心线上、Y 中心为 msgY"的 activation 几何。
 *
 * 用于手绘 auto-activation（`sequenceInteraction.attachAutoActivation`）——
 * 那里没有完整的消息列表，需要基于单个 lifeline 与鼠标落点即时算出 activation 位置。
 *
 * 与 `layoutSequence` 内部使用的公式**完全一致**，保证手绘与批量生成视觉对齐。
 */
export function activationGeometryOnLifeline(
  lifelineX: number,
  lifelineWidth: number,
  msgY: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: lifelineX + (lifelineWidth - ACTIVATION_WIDTH) / 2,
    y: msgY - ACTIVATION_HEIGHT / 2,
    w: ACTIVATION_WIDTH,
    h: ACTIVATION_HEIGHT,
  };
}
