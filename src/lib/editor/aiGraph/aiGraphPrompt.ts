/**
 * aiGraphPrompt - LLM prompt 模板组装。
 *
 * 两个出口：
 *   - `buildSystemPrompt()`：内部调用时作为 chat completions 的 system message
 *   - `buildExamplePromptForClipboard()`：用户点「复制示例 Prompt」后粘贴到
 *     外部 AI（ChatGPT/Claude 网页版等）使用，自包含 schema + 示例 + 指令
 *
 * 两者共享 schema/example 片段，避免重复。
 */

import { AI_GRAPH_SCHEMA, AI_GRAPH_EXAMPLE, AI_GRAPH_EXAMPLE_SEQUENCE } from './aiGraphSchema';

/* ------------------------------------------------------------------ */
/* 共享片段                                                            */
/* ------------------------------------------------------------------ */

/** Schema + 示例片段，内部/外部 prompt 都用。 */
function schemaAndExampleBlock(): string {
  return [
    '## Output Schema (JSON)',
    '```json',
    JSON.stringify(AI_GRAPH_SCHEMA, null, 2),
    '```',
    '',
    '## Diagram Type Guide',
    'Choose the most appropriate diagram type based on the user description:',
    '',
    '### Flowchart (default)',
    '- Use for: processes, algorithms, decision flows, workflows.',
    '- Shapes: rounded=start/end, rectangle=process step, diamond=decision, ' +
      'text=plain annotation.',
    '- Edges: orthogonal routing. Label decision branches (e.g. "yes"/"no").',
    '',
    '### Sequence Diagram',
    '- Use for: interactions between participants over time, API call flows, ' +
      'request/response cycles, protocol exchanges.',
    '- Participants: one `lifeline` node per participant (User, Service, Database, etc.). ' +
      'Set w=100, h=300. Set x/y to 0 (auto-layouted horizontally).',
    '- Messages: edges with `routing: "straight"`. Use `style.dashed: true` for ' +
      'return/response messages.',
    '- Activations: `activation` shape on a lifeline to show when a participant is busy.',
    '- Self-messages: edge where source===target (a participant calling itself).',
    '- Label each message with the action (e.g. "POST /login", "query DB").',
    '',
    '### Use Case Diagram',
    '- Use for: system requirements, actor-system interactions, feature scoping.',
    '- Shapes: actor=human/external system role, ellipse=use case.',
    '- Connect actors to their use cases with straight edges.',
    '- Group related use cases spatially.',
    '',
    '## Example: Flowchart',
    'A simple flowchart with a decision branch:',
    '```json',
    JSON.stringify(AI_GRAPH_EXAMPLE, null, 2),
    '```',
    '',
    '## Example: Sequence Diagram',
    'A user login flow with 3 participants and 4 messages (2 returns):',
    '```json',
    JSON.stringify(AI_GRAPH_EXAMPLE_SEQUENCE, null, 2),
    '```',
  ].join('\n');
}

/** 输出约束（共用）。 */
const OUTPUT_RULES = [
  'Output ONLY a single JSON object matching the schema above.',
  'Do NOT wrap it in markdown fences (```).',
  'Do NOT include any explanation before or after the JSON.',
  'Every edge.source and edge.target MUST reference an existing node id.',
  'If unsure about coordinates, set x/y to 0 - the importer will auto-layout.',
  'Choose the diagram type that best fits the user description. ' +
    'When the user explicitly asks for a sequence/timing diagram, use lifeline nodes. ' +
    'When they describe a process or flow, use a flowchart.',
  'Use concise but meaningful labels.',
  'For sequence diagrams: use straight routing for all edges, ' +
    'dashed style for return/response messages.',
].join('\n');

/* ------------------------------------------------------------------ */
/* 内部 system prompt                                                  */
/* ------------------------------------------------------------------ */

/**
 * 内部调用的 system prompt。配合用户自然语言输入使用。
 */
export function buildSystemPrompt(): string {
  return [
    'You are a diagram generator for JStudio. Given a user\'s natural language description,',
    'generate a jgraph diagram JSON object.',
    '',
    schemaAndExampleBlock(),
    '',
    '## Rules',
    OUTPUT_RULES,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* 外部剪贴板 prompt                                                   */
/* ------------------------------------------------------------------ */

/**
 * 自包含的 prompt 模板，供用户复制到外部 AI 使用。
 * 包含 {PROMPT} 占位符，用户在外部 AI 里替换为自己的描述。
 */
export function buildExamplePromptForClipboard(): string {
  return [
    'You are a diagram generator for JStudio. Given a description, generate a jgraph diagram JSON object.',
    '',
    schemaAndExampleBlock(),
    '',
    '## Rules',
    OUTPUT_RULES,
    '',
    '## User Request',
    '{PROMPT}',
    '',
    'Generate the jgraph JSON now:',
  ].join('\n');
}
