/**
 * aiGraphGenerator — LLM 调用编排。
 *
 * 流程：读 agent 配置 → 取 active provider → 通过 Rust 代理转发到
 * OpenAI-compatible chat completions（绕过 webview CORS）→ 抽 content
 * → JSON.parse → 校验 → 自动布局 → 序列化。
 *
 * 为什么走 Rust 代理：
 *   Tauri v2 WKWebView 跨域 fetch 带 `Authorization` 头会触发 CORS
 *   preflight，远端不返回 `Access-Control-Allow-Headers: Authorization`
 *   就会被拦截。Rust 端用 reqwest 转发完全绕过此限制。见
 *   `src-tauri/src/commands/ai_graph.rs`。
 *
 * `response_format: {type:'json_object'}` 兼容性：OpenAI/DeepSeek 支持，
 * 部分兼容层不支持（返回 400）。先尝试带该字段，遇 400 降级重试不带。
 */

import { storage } from '../../core/storage';
import type { AiGraphFetchRequest } from '../../../types/browser';
import { serializeGraphSnapshot } from '../../../components/editor/nodes/graph/graphSnapshot';
import { validateAiGraph } from './aiGraphValidator';
import { autoLayoutByType } from './aiGraphLayout';
import { buildSystemPrompt } from './aiGraphPrompt';

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

/** 错误码——对话框层据此查 i18n 并插值。 */
export type AiGraphErrorCode =
  | 'aiGraph.noProvider'
  | 'aiGraph.networkError'
  | 'aiGraph.parseError'
  | 'aiGraph.validationError'
  | 'aiGraph.emptyResponse';

/** 生成结果。 */
export interface GenerateResult {
  success: boolean;
  /** 成功时为序列化后的 snapshot JSON。 */
  snapshot?: string;
  /** 失败时的 i18n 错误码。 */
  errorCode?: AiGraphErrorCode;
  /** 用于插值到 i18n 占位符 {error} 的细节字符串。 */
  errorDetail?: string;
  /** 校验过程的非致命警告（即便 success=true 也可能有）。 */
  warnings?: string[];
}

/* ------------------------------------------------------------------ */
/* 内部工具                                                            */
/* ------------------------------------------------------------------ */

/**
 * 从 LLM 响应文本中提取 JSON 对象。
 *
 * LLM 偶尔会：
 *   - 在 JSON 前后加文字（"Here is the diagram:\n{...}"）
 *   - 用 ```json ... ``` 包裹
 *
 * 先尝试直接 parse；失败则用正则提取首个 {...} 块再 parse。
 */
function extractJson(content: string): unknown {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // 剥 markdown fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      /* fall through */
    }
  }

  // 提取首个 {...} 块（贪婪到最外层闭合大括号）
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      /* fall through */
    }
  }

  throw new Error('No JSON object found in LLM response');
}

/** 构造请求体。`withJsonMode=false` 时去掉 response_format（兼容性降级）。 */
function buildRequestBody(
  model: string,
  userPrompt: string,
  withJsonMode: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  };
  if (withJsonMode) body.response_format = { type: 'json_object' };
  return body;
}

/** 单次代理调用尝试。返回 { ok, status, content }。 */
async function callOnce(
  apiBase: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; content: string }> {
  // api_base 形如 "https://api.openai.com/v1" — 拼上 /chat/completions
  const url = apiBase.replace(/\/+$/, '') + '/chat/completions';

  const request: AiGraphFetchRequest = {
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    timeoutSecs: 60,
  };

  // Rust 代理转发，绕过 webview CORS
  const resp = await storage.aiGraphFetch(request);

  if (!resp.ok) {
    // 尝试从响应体抽错误信息
    let errText = '';
    try {
      const errBody = JSON.parse(resp.body);
      errText = errBody?.error?.message ?? errBody?.message ?? '';
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: resp.status,
      content: errText || `HTTP ${resp.status}`,
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(resp.body);
  } catch {
    return { ok: false, status: 200, content: 'Invalid JSON response' };
  }

  const content =
    (data as any)?.choices?.[0]?.message?.content ??
    (data as any)?.choices?.[0]?.text ??
    '';
  if (!content) {
    return { ok: false, status: 200, content: 'Empty response content' };
  }
  return { ok: true, status: 200, content };
}

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

/**
 * 根据自然语言描述生成 jgraph 快照。
 *
 * @param userPrompt 用户的自然语言描述（如「画一个订单处理流程图」）
 * @returns 生成结果。失败时 `errorCode` 是 i18n key，`errorDetail` 用于 {error} 插值
 */
export async function generateGraphFromAI(
  userPrompt: string,
): Promise<GenerateResult> {
  // 1. 读配置
  let config;
  try {
    config = await storage.loadAgentConfig();
  } catch (e) {
    return {
      success: false,
      errorCode: 'aiGraph.networkError',
      errorDetail: e instanceof Error ? e.message : String(e),
    };
  }

  const provider = config?.providers?.[config?.active_index ?? 0];
  if (
    !provider ||
    !provider.api_base ||
    !provider.api_key ||
    !provider.model
  ) {
    return { success: false, errorCode: 'aiGraph.noProvider' };
  }

  // 2. 调用 LLM（通过 Rust 代理）
  let result;
  try {
    // 第一次尝试：带 response_format: json_object
    result = await callOnce(
      provider.api_base,
      provider.api_key,
      buildRequestBody(provider.model, userPrompt, true),
    );

    // 400 降级：某些 OpenAI-compatible 端点不支持 response_format
    if (!result.ok && result.status === 400) {
      result = await callOnce(
        provider.api_base,
        provider.api_key,
        buildRequestBody(provider.model, userPrompt, false),
      );
    }
  } catch (e) {
    return {
      success: false,
      errorCode: 'aiGraph.networkError',
      errorDetail: e instanceof Error ? e.message : String(e),
    };
  }

  if (!result.ok) {
    return {
      success: false,
      errorCode: 'aiGraph.networkError',
      errorDetail: result.content,
    };
  }

  // 3. 解析 JSON
  let parsed: unknown;
  try {
    parsed = extractJson(result.content);
  } catch {
    return { success: false, errorCode: 'aiGraph.parseError' };
  }

  // 4. 校验
  const validation = validateAiGraph(parsed);
  if (!validation.valid || !validation.snapshot) {
    return {
      success: false,
      errorCode: 'aiGraph.validationError',
      errorDetail: validation.errors.join('; ') || 'invalid schema',
    };
  }

  // 5. 自动布局
  const { nodes, edges } = autoLayoutByType(
    validation.snapshot.nodes,
    validation.snapshot.edges,
  );

  // 6. 序列化
  const snapshotJson = serializeGraphSnapshot(
    nodes,
    edges,
    validation.snapshot.viewport,
    validation.snapshot.showGrid,
  );

  return {
    success: true,
    snapshot: snapshotJson,
    warnings: validation.errors.length > 0 ? validation.errors : undefined,
  };
}
