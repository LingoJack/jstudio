/**
 * aiGraphSchema — AI 生成图表的 JSON Schema 单一定义源。
 *
 * 设计目标：
 *   1. **单一来源**：Schema 同时供 (a) LLM system prompt 和 (b) 校验器使用，
 *      避免类型定义与 Schema 双向漂移。
 *   2. **人类可读**：每个字段带 `description`，LLM 据此理解字段语义。
 *   3. **TS 文件而非 .json**：可引用 `JGRAPH_KIND`/`JGRAPH_VERSION` 常量，
 *      避免 magic string；Vite import 友好；可附 JSDoc。
 *
 * 用法：
 *   - `JSON.stringify(AI_GRAPH_SCHEMA)` → 塞进 LLM system prompt
 *   - `VALID_NODE_SHAPES` → 校验器 enum 检查
 *   - `AI_GRAPH_EXAMPLE` → prompt 里的 few-shot 示例
 */

import { JGRAPH_KIND, JGRAPH_VERSION } from '../../../components/editor/nodes/graph/graphSnapshot';

/* ------------------------------------------------------------------ */
/* 节点形状枚举（与 GraphNodeShape 中节点类形状一致，排除 edge-*）       */
/* ------------------------------------------------------------------ */

/**
 * 节点可用形状。`edge-*` 形状是连线默认样式选择器，不作为节点形状。
 * 校验器据此检查 `nodes[].shape` 合法性。
 */
export const VALID_NODE_SHAPES = [
  'rectangle', // 矩形（流程：处理步骤）
  'rounded', // 圆角矩形（流程：起止）
  'ellipse', // 椭圆 / 圆（用例图：用例）
  'diamond', // 菱形（流程：判定）
  'text', // 纯文本标签（无边框）
  'actor', // 用例图：角色（小人图标）
  'swimlane-v', // 泳道图：垂直泳道
  'swimlane-h', // 泳道图：水平泳道
  'lifeline', // 时序图：生命线（虚线垂直线）
  'activation', // 时序图：激活框（窄矩形）
  'note', // 注释框（折角矩形）
] as const;

/* ------------------------------------------------------------------ */
/* JSON Schema（draft-07 风格，用于 LLM prompt）                        */
/* ------------------------------------------------------------------ */

/**
 * 完整的 jgraph 快照 JSON Schema。
 * 字段 description 写给 LLM 看，描述字段语义而非校验规则。
 */
export const AI_GRAPH_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'JGraph Snapshot',
  description:
    'A diagram snapshot for JStudio\'s graph canvas. Output ONLY a JSON object matching this schema — no markdown fences, no surrounding text.',
  type: 'object',
  required: ['kind', 'version', 'nodes', 'edges'],
  additionalProperties: false,
  properties: {
    kind: {
      type: 'string',
      const: JGRAPH_KIND,
      description: 'Magic discriminator. MUST be "jgraph".',
    },
    version: {
      type: 'number',
      const: JGRAPH_VERSION,
      description: `Schema version. MUST be ${JGRAPH_VERSION}.`,
    },
    nodes: {
      type: 'array',
      description:
        'Diagram nodes (shapes). Each node must have a stable unique id; edges reference nodes by id. Coordinates are canvas pixels (top-left origin). If unsure of layout, set x/y to 0 — the importer will auto-layout.',
      items: {
        type: 'object',
        required: ['id', 'shape', 'x', 'y', 'w', 'h'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: 'Stable unique id, e.g. "n1", "n2". Referenced by edges.',
            minLength: 1,
          },
          shape: {
            type: 'string',
            enum: [...VALID_NODE_SHAPES],
            description:
              'Node shape. rectangle=process step, rounded=start/end, ellipse=use case, diamond=decision, text=plain label, actor=use-case actor, swimlane-v/swimlane-h=swimlane, lifeline=sequence lifeline, activation=sequence activation, note=note box.',
          },
          x: { type: 'number', description: 'Canvas x (top-left), pixels.', default: 0 },
          y: { type: 'number', description: 'Canvas y (top-left), pixels.', default: 0 },
          w: {
            type: 'number',
            description: 'Width in pixels. Recommended 80-200 depending on label length.',
            default: 120,
          },
          h: {
            type: 'number',
            description: 'Height in pixels. Recommended 40-80.',
            default: 60,
          },
          label: {
            type: 'string',
            description: 'Display text inside the node. Omit or empty for unlabeled shapes.',
          },
          style: {
            type: 'object',
            description: 'Optional style overrides. Omit to use theme defaults.',
            additionalProperties: false,
            properties: {
              fill: { type: 'string', description: 'Fill color, e.g. "#dbeafe".' },
              stroke: { type: 'string', description: 'Stroke color, e.g. "#2563eb".' },
              fontColor: { type: 'string', description: 'Font color.' },
              strokeWidth: { type: 'number', description: 'Stroke width in pixels.' },
              dashed: { type: 'boolean', description: 'Dashed border.' },
            },
          },
        },
      },
    },
    edges: {
      type: 'array',
      description:
        'Connections between nodes. source/target must reference existing node ids. Dangling edges are silently dropped.',
      items: {
        type: 'object',
        required: ['id', 'source', 'target'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: 'Stable unique id, e.g. "e1".',
            minLength: 1,
          },
          source: {
            type: 'string',
            description: 'Source node id. MUST match a node in nodes[].id.',
          },
          target: {
            type: 'string',
            description: 'Target node id. MUST match a node in nodes[].id.',
          },
          label: {
            type: 'string',
            description: 'Edge label, e.g. "yes" / "no" on a decision branch.',
          },
          routing: {
            type: 'string',
            enum: ['orthogonal', 'straight'],
            description: 'orthogonal=right-angle polyline (default), straight=direct line.',
          },
          startArrow: {
            type: 'string',
            description: 'Arrow style at source end. "none" by default.',
          },
          endArrow: {
            type: 'string',
            description: 'Arrow style at target end. "classic" by default.',
          },
          style: {
            type: 'object',
            description: 'Optional edge style overrides.',
            additionalProperties: false,
            properties: {
              stroke: { type: 'string' },
              strokeWidth: { type: 'number' },
              dashed: { type: 'boolean', description: 'Dashed line (e.g. for return arrows).' },
            },
          },
        },
      },
    },
    viewport: {
      type: 'object',
      description:
        'Optional viewport (zoom/pan). Usually omitted — importer auto-fits the canvas.',
      additionalProperties: false,
      properties: {
        scale: { type: 'number', default: 1 },
        dx: { type: 'number', default: 0 },
        dy: { type: 'number', default: 0 },
      },
    },
    showGrid: {
      type: 'boolean',
      description: 'Show grid background. Default false.',
    },
  },
} as const;

/* ------------------------------------------------------------------ */
/* Few-shot 示例（塞进 prompt 帮助 LLM 理解输出格式）                    */
/* ------------------------------------------------------------------ */

/**
 * 一个简单的流程图示例：5 节点 + 4 边，覆盖常见形状（rounded/rectangle/diamond）
 * 与带标签的判定分支。供 prompt few-shot 用。
 */
export const AI_GRAPH_EXAMPLE = {
  kind: JGRAPH_KIND,
  version: JGRAPH_VERSION,
  nodes: [
    { id: 'n1', shape: 'rounded', x: 0, y: 0, w: 120, h: 48, label: '开始' },
    { id: 'n2', shape: 'rectangle', x: 0, y: 0, w: 120, h: 48, label: '处理订单' },
    { id: 'n3', shape: 'diamond', x: 0, y: 0, w: 120, h: 64, label: '库存充足?' },
    { id: 'n4', shape: 'rounded', x: 0, y: 0, w: 120, h: 48, label: '发货' },
    { id: 'n5', shape: 'rounded', x: 0, y: 0, w: 120, h: 48, label: '缺货通知' },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4', label: '是' },
    { id: 'e4', source: 'n3', target: 'n5', label: '否' },
  ],
} as const;

/**
 * 时序图示例：3 个参与者（lifeline）+ 4 条消息（含返回消息）。
 *
 * lifeline 节点的 x/y 设为 0，由布局器水平排列。
 * 消息用 straight routing，返回消息用 dashed 样式。
 */
export const AI_GRAPH_EXAMPLE_SEQUENCE = {
  kind: JGRAPH_KIND,
  version: JGRAPH_VERSION,
  nodes: [
    { id: 'n1', shape: 'lifeline', x: 0, y: 0, w: 100, h: 300, label: '用户' },
    { id: 'n2', shape: 'lifeline', x: 0, y: 0, w: 100, h: 300, label: '浏览器' },
    { id: 'n3', shape: 'lifeline', x: 0, y: 0, w: 100, h: 300, label: '服务器' },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', label: '输入账号密码', routing: 'straight' },
    { id: 'e2', source: 'n2', target: 'n3', label: 'POST /login', routing: 'straight' },
    { id: 'e3', source: 'n3', target: 'n2', label: '返回 token', routing: 'straight', style: { dashed: true } },
    { id: 'e4', source: 'n2', target: 'n1', label: '登录成功', routing: 'straight', style: { dashed: true } },
  ],
} as const;
