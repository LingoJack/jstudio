/**
 * mermaidParser — Mermaid 代码解析封装
 *
 * 使用 mermaid 官方解析器获取图表数据，不渲染 SVG，直接提取 db 数据。
 * 支持的图表类型：flowchart / graph、sequenceDiagram
 */

import mermaid from 'mermaid';

/** Mermaid 图表类型 */
export type MermaidDiagramType = 'flowchart' | 'sequence' | 'unsupported';

/** 解析结果 */
export interface MermaidParseResult {
  type: MermaidDiagramType;
  data: unknown;
  error?: string;
}

/** Flowchart 节点数据（从 db.getVertices() 返回） */
export interface MermaidVertex {
  id: string;
  labelType: 'text' | 'markdown';
  text: string;
  domId?: string;
  styles?: string[];
  classes?: string[];
  type?: string; // 节点形状类型，如 'round', 'diamond', 'circle' 等
  shape?: string; // mermaid v11 渲染形状（ShapeID），如 'rect', 'question', 'stadium' 等
}

/** Flowchart 边数据（从 db.getEdges() 返回） */
export interface MermaidEdge {
  id?: string;
  start: string;
  end: string;
  type: string; // 箭头类型：'arrow_point', 'arrow_cross', 'arrow_open', etc.
  text: string;
  labelType: 'text' | 'markdown';
  /**
   * 线型：'normal' | 'dotted' | 'thick' | 'invisible'。
   * 'invisible' 对应 `~~~` 语句——mermaid 渲染时不给样式类（SVG 不描边，看不见），
   * 只用于参与布局分层。
   */
  stroke: string;
  length?: number;
  /** linkStyle 行内声明（如 `['stroke:#1d4ed8', 'stroke-width:3px']`）。 */
  style?: string[];
}

/** Flowchart 子图数据 */
export interface MermaidSubgraph {
  id: string;
  /**
   * 直接子项：叶子节点 id 或**嵌套子图 id**（mermaid 只列直接成员，不含孙辈）。
   * 例：`subgraph AL` 内含 `subgraph G1` 时，AL.nodes === ['G1']。
   */
  nodes: string[];
  title: string;
  classes?: string[];
  labelType: 'text' | 'markdown';
  /** subgraph 内显式声明的方向（`direction LR`），未声明时缺省。 */
  dir?: string;
}

/** classDef 定义（从 db.getClasses() 返回的映射值） */
export interface MermaidClassDef {
  id: string;
  /** CSS 声明数组，如 `['fill:#dbe9fb', 'stroke:#2b6cb0', 'color:#1a365d']`。 */
  styles?: string[];
  /** 文字相关声明（多为 color 的重复），与 styles 合并使用。 */
  textStyles?: string[];
}

/** Flowchart 完整数据 */
export interface FlowchartData {
  vertices: Map<string, MermaidVertex>;
  edges: MermaidEdge[];
  subgraphs: MermaidSubgraph[];
  direction?: string; // TB, BT, LR, RL
  /** classDef 名称 -> 定义。旧调用方（测试）不传时按无样式处理。 */
  classes?: Map<string, MermaidClassDef>;
}

/** Sequence 参与者数据 */
export interface SequenceActor {
  name: string;
  description?: string;
  id?: string;
  type?: string; // 'actor' | 'participant'
}

/** Sequence 消息数据 */
export interface SequenceMessage {
  id?: string | number;
  from?: string;
  to?: string;
  message: string | { start: number; step: number; visible: boolean };
  type?: number; // Mermaid LINETYPE: 0=->>, 1=-->>, 3=-x, 4=--x, 5=->, 6=-->
}

/** Sequence 注释数据 */
export interface SequenceNote {
  id?: string | number;
  from: string;
  to?: string;
  message: string;
  type?: string; // 'left', 'right', 'over', 'across'
}

/** Sequence 完整数据 */
export interface SequenceData {
  actors: Map<string, SequenceActor>;
  messages: SequenceMessage[];
  notes: SequenceNote[];
}

// 标记是否已初始化（mermaid.initialize 只需调用一次）
let initialized = false;

/**
 * 空白类 HTML 实体 → 对应 Unicode 字符。
 * 这些实体在渲染上等价于原义空格，解码后不影响显示。
 */
const WHITESPACE_ENTITIES: Record<string, string> = {
  '&emsp;': '\u2003',
  '&ensp;': '\u2002',
  '&thinsp;': '\u2009',
  '&nbsp;': '\u00a0',
};

/**
 * 预处理：把 HTML 实体还原为字面字符。
 *
 * mermaid 时序图的语句以 `;` 分隔，消息文本词法规则是 `[^#\n;]*`——
 * 不允许出现 `;`。而 `&emsp;` 这类命名实体自带 `;`，会把一条消息拦腰截断：
 * `&emsp` 被当成消息结尾、`;` 被当成语句分隔符，剩余文本被当作新语句解析，
 * 直接报 "Expecting ARROW ... got ','"。空格类实体还原为对应 Unicode 空格
 * （渲染等价），数值实体解码后若引入语法字符则保留原文。
 */
function decodeEntities(code: string): string {
  let out = code;
  for (const [entity, ch] of Object.entries(WHITESPACE_ENTITIES)) {
    out = out.split(entity).join(ch);
  }
  // 数值实体（&#8195; / &#x2003; 形式）：解码为对应字符；
  // 会引入 mermaid 语法字符（< > & ;）的保留原文不动。
  out = out.replace(/&#(\d+);|&#x([0-9a-fA-F]+);/g, (entity, dec, hex) => {
    const codePoint = dec !== undefined ? Number(dec) : parseInt(hex, 16);
    if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
      return entity;
    }
    const ch = String.fromCodePoint(codePoint);
    return /[<>&;]/.test(ch) ? entity : ch;
  });
  return out;
}

/**
 * 初始化 mermaid 解析器（仅需一次）
 */
function ensureMermaidInitialized(): void {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    suppressErrorRendering: true,
    // 禁用安全模式以支持更多语法
    securityLevel: 'loose',
  });
  initialized = true;
}

/**
 * 解析 Mermaid 代码，返回图表数据
 *
 * @param code Mermaid 代码文本
 * @returns 解析结果，包含图表类型和数据
 */
export async function parseMermaidCode(code: string): Promise<MermaidParseResult> {
  ensureMermaidInitialized();

  try {
    // 使用 mermaid API 解析代码（v11: getDiagramFromText 在 mermaidAPI 下）
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(decodeEntities(code));
    const diagramType = diagram.type as string;
    // db 是内部数据对象，包含解析后的数据
    const db = diagram.db as Record<string, unknown>;

    if (diagramType === 'flowchart' || diagramType === 'graph' || diagramType === 'flowchart-v2') {
      // Flowchart 数据提取
      // getVertices 返回 Map<string, FlowVertex>
      const verticesMap = (db.getVertices as () => Map<string, MermaidVertex>)?.() ?? new Map();
      const edges = (db.getEdges as () => MermaidEdge[])?.() ?? [];
      // 方法名注意：mermaid v11 FlowDB 上是 `getSubGraphs`（大写 G）；
      // 写成 getSubgraphs 会拿到 undefined，再配可选调用会被静默吞成空数组。
      const subgraphs = (db.getSubGraphs as () => MermaidSubgraph[])() ?? [];
      // classDef 定义：节点 / 子图只带 classes 名称数组，样式在这里按名查。
      const classes = (db.getClasses as () => Map<string, MermaidClassDef>)?.() ?? new Map();
      // 方向（TB/BT/LR/RL）
      const direction = (db.getDirection as () => string)?.() ?? 'TB';

      return {
        type: 'flowchart',
        data: {
          vertices: verticesMap,
          edges,
          subgraphs,
          direction,
          classes,
        } as FlowchartData,
      };
    }

    if (diagramType === 'sequenceDiagram' || diagramType === 'sequence') {
      // Sequence 数据提取
      // getActors 返回 Map<string, Actor>
      const actorsMap = (db.getActors as () => Map<string, SequenceActor>)?.() ?? new Map();
      const messages = (db.getMessages as () => SequenceMessage[])?.() ?? [];
      // getNotes 可能不存在或返回不同格式
      const notes: SequenceNote[] = [];

      return {
        type: 'sequence',
        data: {
          actors: actorsMap,
          messages,
          notes,
        } as SequenceData,
      };
    }

    return {
      type: 'unsupported',
      data: null,
      error: `不支持的图表类型: ${diagramType}`,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      type: 'unsupported',
      data: null,
      error: `解析失败: ${errorMessage}`,
    };
  }
}

/**
 * 判断 Mermaid 代码是否有效（不抛异常）
 */
export async function isValidMermaidCode(code: string): Promise<boolean> {
  const result = await parseMermaidCode(code);
  return result.type !== 'unsupported' && !result.error;
}