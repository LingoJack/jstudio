import { ipc } from "../../core/ipc";
import { serializeGraphSnapshot } from "../../../components/editor/nodes/graph/graphSnapshot";
import { validateAiGraph } from "./aiGraphValidator";
import { autoLayoutByType } from "./aiGraphLayout";
import { buildSystemPrompt } from "./aiGraphPrompt";
function extractJson(content) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
    }
  }
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
    }
  }
  throw new Error("No JSON object found in LLM response");
}
function buildRequestBody(model, userPrompt, withJsonMode) {
  const body = {
    model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2
  };
  if (withJsonMode) body.response_format = { type: "json_object" };
  return body;
}
async function callOnce(apiBase, apiKey, body) {
  const url = apiBase.replace(/\/+$/, "") + "/chat/completions";
  const request = {
    url,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    timeoutSecs: 60
  };
  const resp = await ipc.aiGraphFetch(request);
  if (!resp.ok) {
    let errText = "";
    try {
      const errBody = JSON.parse(resp.body);
      errText = errBody?.error?.message ?? errBody?.message ?? "";
    } catch {
    }
    return {
      ok: false,
      status: resp.status,
      content: errText || `HTTP ${resp.status}`
    };
  }
  let data;
  try {
    data = JSON.parse(resp.body);
  } catch {
    return { ok: false, status: 200, content: "Invalid JSON response" };
  }
  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
  if (!content) {
    return { ok: false, status: 200, content: "Empty response content" };
  }
  return { ok: true, status: 200, content };
}
async function generateGraphFromAI(userPrompt) {
  let config;
  try {
    config = await ipc.loadAgentConfig();
  } catch (e) {
    return {
      success: false,
      errorCode: "aiGraph.networkError",
      errorDetail: e instanceof Error ? e.message : String(e)
    };
  }
  const provider = config?.providers?.[config?.active_index ?? 0];
  if (!provider || !provider.api_base || !provider.api_key || !provider.model) {
    return { success: false, errorCode: "aiGraph.noProvider" };
  }
  let result;
  try {
    result = await callOnce(
      provider.api_base,
      provider.api_key,
      buildRequestBody(provider.model, userPrompt, true)
    );
    if (!result.ok && result.status === 400) {
      result = await callOnce(
        provider.api_base,
        provider.api_key,
        buildRequestBody(provider.model, userPrompt, false)
      );
    }
  } catch (e) {
    return {
      success: false,
      errorCode: "aiGraph.networkError",
      errorDetail: e instanceof Error ? e.message : String(e)
    };
  }
  if (!result.ok) {
    return {
      success: false,
      errorCode: "aiGraph.networkError",
      errorDetail: result.content
    };
  }
  let parsed;
  try {
    parsed = extractJson(result.content);
  } catch {
    return { success: false, errorCode: "aiGraph.parseError" };
  }
  const validation = validateAiGraph(parsed);
  if (!validation.valid || !validation.snapshot) {
    return {
      success: false,
      errorCode: "aiGraph.validationError",
      errorDetail: validation.errors.join("; ") || "invalid schema"
    };
  }
  const { nodes, edges } = autoLayoutByType(
    validation.snapshot.nodes,
    validation.snapshot.edges
  );
  const snapshotJson = serializeGraphSnapshot(
    nodes,
    edges,
    validation.snapshot.viewport,
    validation.snapshot.showGrid
  );
  return {
    success: true,
    snapshot: snapshotJson,
    warnings: validation.errors.length > 0 ? validation.errors : void 0
  };
}
export {
  generateGraphFromAI
};
