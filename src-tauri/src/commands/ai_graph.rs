/**
 * ai_graph — AI 生成图表的 HTTP 代理命令。
 *
 * 为什么需要这个命令：
 *   Tauri v2 WKWebView 跨域 fetch 到 api.openai.com 等远端时，带
 *   `Authorization` 头会触发 CORS preflight；远端不返回
 *   `Access-Control-Allow-Headers: Authorization` 就会被 webview 拦截。
 *   在 Rust 端用 reqwest 转发则完全绕过浏览器 CORS 限制。
 *
 * 设计：通用 HTTP POST 代理，不耦合 OpenAI 业务语义——
 *   TS 端构造完整请求（url/headers/body），Rust 只负责转发并返回响应。
 *   这样未来其他需要绕过 CORS 的功能也能复用。
 */
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// 代理请求参数。TS 端把整个 fetch 请求包装后传入。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGraphFetchRequest {
    /// 完整的目标 URL（含 scheme + host + path）。
    pub url: String,
    /// 请求头映射（如 Authorization、Content-Type）。
    pub headers: HashMap<String, String>,
    /// 请求体（JSON 字符串）。空字符串表示无 body。
    pub body: String,
    /// 超时秒数。0 表示用默认 60s。
    #[serde(default)]
    pub timeout_secs: u64,
}

/// 代理响应。Rust 把远端响应原样回传给 TS。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGraphFetchResponse {
    /// HTTP 状态码（如 200、400、401、500）。
    pub status: u16,
    /// 是否 2xx。
    pub ok: bool,
    /// 响应体文本（远端返回的 JSON 字符串）。
    pub body: String,
}

static AI_GRAPH_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn ai_graph_client() -> &'static reqwest::Client {
    AI_GRAPH_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(5))
            .timeout(Duration::from_secs(60))
            .build()
            .expect("failed to build ai_graph HTTP client")
    })
}

/// 代理一个 HTTP POST 请求，绕过 webview 的 CORS 限制。
///
/// 仅用于 AI 生成图表场景（调用 OpenAI-compatible chat completions）。
/// TS 端通过 `storage.aiGraphFetch()` 调用，无需直接 fetch。
#[tauri::command]
pub async fn ai_graph_fetch(request: AiGraphFetchRequest) -> Result<AiGraphFetchResponse, String> {
    let client = ai_graph_client();

    // 超时覆盖：若调用方指定了正数，按调用方；否则用 client 默认 60s。
    let req_builder = if request.timeout_secs > 0 {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(5))
            .timeout(Duration::from_secs(request.timeout_secs))
            .build()
            .map_err(|e| format!("failed to build HTTP client: {e}"))?;
        client.post(&request.url)
    } else {
        client.post(&request.url)
    };

    let mut req_builder = req_builder;
    for (key, value) in &request.headers {
        req_builder = req_builder.header(key, value);
    }
    if !request.body.is_empty() {
        req_builder = req_builder.body(request.body.clone());
    }

    let resp = req_builder
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = resp.status().as_u16();
    let ok = resp.status().is_success();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("failed to read response body: {e}"))?;

    Ok(AiGraphFetchResponse { status, ok, body })
}
