/**
 * aiGraphPrompt — LLM prompt 模板组装。
 *
 * 两个出口：
 *   - `buildSystemPrompt()`：内部调用时作为 chat completions 的 system message
 *   - `buildExamplePromptForClipboard()`：用户点「复制示例 Prompt」后粘贴到
 *     外部 AI（ChatGPT/Claude 网页版等）使用，自包含 schema + 示例 + 指令
 *
 * 两者共享 schema/example 片段，避免重复。
 */

import { AI_GRAPH_SCHEMA, AI_GRAPH_EXAMPLE } from './aiGraphSchema';

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
    '## Example Output',
    'A simple flowchart with a decision branch:',
    '```json',
    JSON.stringify(AI_GRAPH_EXAMPLE, null, 2),
    '```',
  ].join('\n');
}

/** 输出约束（共用）。 */
const OUTPUT_RULES = [
  'Output ONLY a single JSON object matching the schema above.',
  'Do NOT wrap it in markdown fences (```).',
  'Do NOT include any explanation before or after the JSON.',
  'Every edge.source and edge.target MUST reference an existing node id.',
  'If unsure about coordinates, set x/y to 0 — the importer will auto-layout.',
  'Use concise labels (1-6 chars preferred for decision nodes).',
  'Pick shapes semantically: rounded for start/end, diamond for decisions, rectangle for processes.',
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
