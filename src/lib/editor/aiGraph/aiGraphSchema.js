import { JGRAPH_KIND, JGRAPH_VERSION } from "../../../components/editor/nodes/graph/graphSnapshot";
const VALID_NODE_SHAPES = [
  "rectangle",
  // 矩形（流程：处理步骤）
  "rounded",
  // 圆角矩形（流程：起止）
  "ellipse",
  // 椭圆 / 圆（用例图：用例）
  "diamond",
  // 菱形（流程：判定）
  "text",
  // 纯文本标签（无边框）
  "actor",
  // 用例图：角色（小人图标）
  "swimlane-v",
  // 泳道图：垂直泳道
  "swimlane-h",
  // 泳道图：水平泳道
  "lifeline",
  // 时序图：生命线（虚线垂直线）
  "activation",
  // 时序图：激活框（窄矩形）
  "note",
  // 注释框（折角矩形）
  "database"
  // 数据库（圆柱体）
];
const AI_GRAPH_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "JGraph Snapshot",
  description: "A diagram snapshot for JStudio's graph canvas. Output ONLY a JSON object matching this schema \u2014 no markdown fences, no surrounding text.",
  type: "object",
  required: ["kind", "version", "nodes", "edges"],
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      const: JGRAPH_KIND,
      description: 'Magic discriminator. MUST be "jgraph".'
    },
    version: {
      type: "number",
      const: JGRAPH_VERSION,
      description: `Schema version. MUST be ${JGRAPH_VERSION}.`
    },
    nodes: {
      type: "array",
      description: "Diagram nodes (shapes). Each node must have a stable unique id; edges reference nodes by id. Coordinates are canvas pixels (top-left origin). If unsure of layout, set x/y to 0 \u2014 the importer will auto-layout.",
      items: {
        type: "object",
        required: ["id", "shape", "x", "y", "w", "h"],
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            description: 'Stable unique id, e.g. "n1", "n2". Referenced by edges.',
            minLength: 1
          },
          shape: {
            type: "string",
            enum: [...VALID_NODE_SHAPES],
            description: "Node shape. rectangle=process step, rounded=start/end, ellipse=use case, diamond=decision, text=plain label, actor=use-case actor, swimlane-v/swimlane-h=swimlane, lifeline=sequence lifeline, activation=sequence activation, note=note box, database=database cylinder."
          },
          x: { type: "number", description: "Canvas x (top-left), pixels.", default: 0 },
          y: { type: "number", description: "Canvas y (top-left), pixels.", default: 0 },
          w: {
            type: "number",
            description: "Width in pixels. Recommended 80-200 depending on label length.",
            default: 120
          },
          h: {
            type: "number",
            description: "Height in pixels. Recommended 40-80.",
            default: 60
          },
          label: {
            type: "string",
            description: "Display text inside the node. Omit or empty for unlabeled shapes."
          },
          style: {
            type: "object",
            description: "Optional style overrides. Omit to use theme defaults.",
            additionalProperties: false,
            properties: {
              fill: { type: "string", description: 'Fill color, e.g. "#dbeafe".' },
              stroke: { type: "string", description: 'Stroke color, e.g. "#2563eb".' },
              fontColor: { type: "string", description: "Font color." },
              strokeWidth: { type: "number", description: "Stroke width in pixels." },
              dashed: { type: "boolean", description: "Dashed border." }
            }
          }
        }
      }
    },
    edges: {
      type: "array",
      description: "Connections between nodes. source/target must reference existing node ids. Dangling edges are silently dropped.",
      items: {
        type: "object",
        required: ["id", "source", "target"],
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            description: 'Stable unique id, e.g. "e1".',
            minLength: 1
          },
          source: {
            type: "string",
            description: "Source node id. MUST match a node in nodes[].id."
          },
          target: {
            type: "string",
            description: "Target node id. MUST match a node in nodes[].id."
          },
          label: {
            type: "string",
            description: 'Edge label, e.g. "yes" / "no" on a decision branch.'
          },
          routing: {
            type: "string",
            enum: ["orthogonal", "straight"],
            description: "orthogonal=right-angle polyline (default), straight=direct line."
          },
          startArrow: {
            type: "string",
            description: 'Arrow style at source end. "none" by default.'
          },
          endArrow: {
            type: "string",
            description: 'Arrow style at target end. "classic" by default.'
          },
          style: {
            type: "object",
            description: "Optional edge style overrides.",
            additionalProperties: false,
            properties: {
              stroke: { type: "string" },
              strokeWidth: { type: "number" },
              dashed: { type: "boolean", description: "Dashed line (e.g. for return arrows)." }
            }
          }
        }
      }
    },
    viewport: {
      type: "object",
      description: "Optional viewport (zoom/pan). Usually omitted \u2014 importer auto-fits the canvas.",
      additionalProperties: false,
      properties: {
        scale: { type: "number", default: 1 },
        dx: { type: "number", default: 0 },
        dy: { type: "number", default: 0 }
      }
    },
    showGrid: {
      type: "boolean",
      description: "Show grid background. Default false."
    }
  }
};
const AI_GRAPH_EXAMPLE = {
  kind: JGRAPH_KIND,
  version: JGRAPH_VERSION,
  nodes: [
    { id: "n1", shape: "rounded", x: 0, y: 0, w: 120, h: 48, label: "\u5F00\u59CB" },
    { id: "n2", shape: "rectangle", x: 0, y: 0, w: 120, h: 48, label: "\u5904\u7406\u8BA2\u5355" },
    { id: "n3", shape: "diamond", x: 0, y: 0, w: 120, h: 64, label: "\u5E93\u5B58\u5145\u8DB3?" },
    { id: "n4", shape: "rounded", x: 0, y: 0, w: 120, h: 48, label: "\u53D1\u8D27" },
    { id: "n5", shape: "rounded", x: 0, y: 0, w: 120, h: 48, label: "\u7F3A\u8D27\u901A\u77E5" }
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n2", target: "n3" },
    { id: "e3", source: "n3", target: "n4", label: "\u662F" },
    { id: "e4", source: "n3", target: "n5", label: "\u5426" }
  ]
};
const AI_GRAPH_EXAMPLE_SEQUENCE = {
  kind: JGRAPH_KIND,
  version: JGRAPH_VERSION,
  nodes: [
    { id: "n1", shape: "lifeline", x: 0, y: 0, w: 100, h: 300, label: "\u7528\u6237" },
    { id: "n2", shape: "lifeline", x: 0, y: 0, w: 100, h: 300, label: "\u6D4F\u89C8\u5668" },
    { id: "n3", shape: "lifeline", x: 0, y: 0, w: 100, h: 300, label: "\u670D\u52A1\u5668" },
    // 浏览器和服务器在处理请求期间的激活期
    { id: "a1", shape: "activation", x: 0, y: 0, w: 16, h: 40, label: "" },
    { id: "a2", shape: "activation", x: 0, y: 0, w: 16, h: 40, label: "" }
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2", label: "\u8F93\u5165\u8D26\u53F7\u5BC6\u7801", routing: "straight" },
    // 浏览器开始处理
    { id: "ea1", source: "n2", target: "a1", routing: "straight" },
    { id: "e2", source: "n2", target: "n3", label: "POST /login", routing: "straight" },
    // 服务器开始处理
    { id: "ea2", source: "n3", target: "a2", routing: "straight" },
    { id: "e3", source: "n3", target: "n2", label: "\u8FD4\u56DE token", routing: "straight", style: { dashed: true } },
    { id: "e4", source: "n2", target: "n1", label: "\u767B\u5F55\u6210\u529F", routing: "straight", style: { dashed: true } }
  ]
};
export {
  AI_GRAPH_EXAMPLE,
  AI_GRAPH_EXAMPLE_SEQUENCE,
  AI_GRAPH_SCHEMA,
  VALID_NODE_SHAPES
};
