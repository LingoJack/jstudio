/**
 * Link preview backend — Chrome cookie extraction + HTTP reverse proxy.
 *
 * Two main entry points:
 *   1. `fetch_link_metadata` — Tauri command, fetches OG/title/description for card mode.
 *   2. `handle_webpreview_request` — Tauri custom protocol handler (`webpreview://`),
 *      acts as a transparent HTTP reverse proxy that injects Chrome cookies.
 *
 * How the proxy works:
 *   - iframe loads `webpreview://github.com/repo`
 *   - Handler reconstructs `https://github.com/repo`, reads Chrome cookies,
 *     makes an HTTP GET with cookies injected.
 *   - For HTML responses, rewrites absolute `https://` / `http://` / `//` URLs in
 *     attributes to `webpreview://` so all sub-resources (CSS, JS, images, AJAX)
 *     also route through the proxy.
 *   - Strips `X-Frame-Options` and `Content-Security-Policy` response headers so
 *     the page can be embedded in an iframe.
 *   - All relative URLs resolve naturally against the `webpreview://host/path` base.
 *
 * Cookie extraction chain (macOS):
 *   Keychain → Chrome Safe Storage password → PBKDF2-HMAC-SHA1 → AES-128 key
 *   → decrypt Chrome Cookies SQLite DB → inject as `Cookie` header.
 */
use aes::Aes128;
use cbc::Decryptor;
use cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use pbkdf2::pbkdf2_hmac;
use rusqlite::Connection;
use serde::Serialize;
use sha1::Sha1;
use std::borrow::Cow;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::http::{Request, Response};

// ---------------------------------------------------------------------------
// Types returned to the frontend
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct LinkMetadata {
    pub title: String,
    pub description: String,
    pub favicon_url: String,
    pub og_image: String,
    pub site_name: String,
    /// Final URL after HTTP redirects.
    pub url: String,
}

// ---------------------------------------------------------------------------
// Chrome cookie decryption (macOS)
// ---------------------------------------------------------------------------

fn get_chrome_keychain_password() -> Result<String, String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-ga",
            "Chrome",
            "-s",
            "Chrome Safe Storage",
        ])
        .output()
        .map_err(|e| format!("failed to run `security`: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    for line in stderr.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("password:") {
            let rest = rest.trim();
            if let Some(hex) = rest.strip_prefix("0x") {
                let bytes = decode_hex(hex)?;
                return String::from_utf8(bytes)
                    .map_err(|e| format!("keychain password not valid UTF-8: {e}"));
            }
            if !rest.is_empty() {
                return Ok(rest.to_string());
            }
        }
    }

    Err("could not find Chrome Safe Storage password in Keychain".into())
}

fn derive_aes_key(password: &str) -> [u8; 16] {
    let salt = b"saltysalt";
    let mut key = [0u8; 16];
    pbkdf2_hmac::<Sha1>(password.as_bytes(), salt, 1003, &mut key);
    key
}

fn decrypt_cookie_value(encrypted: &[u8], key: &[u8; 16]) -> Result<String, String> {
    if encrypted.len() < 4 {
        return String::from_utf8(encrypted.to_vec())
            .map_err(|e| format!("plain cookie not UTF-8: {e}"));
    }

    let prefix = &encrypted[..3];
    let is_v10 = prefix == b"v10";
    let is_v11 = prefix == b"v11";

    if !is_v10 && !is_v11 {
        return String::from_utf8(encrypted.to_vec())
            .map_err(|e| format!("cookie value not UTF-8: {e}"));
    }

    let ciphertext = &encrypted[3..];
    let iv = [0x20u8; 16];

    let decryptor = Decryptor::<Aes128>::new(key.into(), &iv.into());
    let plaintext = decryptor
        .decrypt_padded_vec_mut::<Pkcs7>(ciphertext)
        .map_err(|e| format!("AES decrypt failed: {e}"))?;

    String::from_utf8(plaintext).map_err(|e| format!("decrypted cookie not UTF-8: {e}"))
}

fn extract_domain(url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("invalid URL: {e}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?;
    Ok(host.trim_start_matches("www.").to_string())
}

fn parent_domain(host: &str) -> String {
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() <= 2 {
        host.to_string()
    } else {
        parts[parts.len() - 2..].join(".")
    }
}

fn open_chrome_cookies_db() -> Result<Connection, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not determine home directory".to_string())?;

    let cookies_path = home.join("Library/Application Support/Google/Chrome/Default/Cookies");

    if !cookies_path.exists() {
        return Err("Chrome cookies database not found".into());
    }

    let tmp =
        std::env::temp_dir().join(format!("jstudio_chrome_cookies_{}.db", std::process::id()));
    std::fs::copy(&cookies_path, &tmp).map_err(|e| format!("failed to copy cookies db: {e}"))?;

    Connection::open(&tmp).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("failed to open cookies db: {e}")
    })
}

/// Read all cookies for a given URL from Chrome's cookie database (uncached).
fn read_chrome_cookies_raw(url: &str) -> Result<Vec<(String, String)>, String> {
    let host = extract_domain(url)?;
    let domain = parent_domain(&host);

    let key = match get_chrome_keychain_password() {
        Ok(pwd) => derive_aes_key(&pwd),
        Err(_) => return Ok(vec![]),
    };

    let conn = match open_chrome_cookies_db() {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let cookies: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT name, encrypted_value, host_key FROM cookies
                 WHERE host_key LIKE ?1 OR host_key LIKE ?2",
            )
            .map_err(|e| format!("cookies query failed: {e}"))?;

        let pattern1 = format!("%{domain}%");
        let pattern2 = format!("%{host}%");

        let raw_rows: Vec<(String, Vec<u8>)> = stmt
            .query_map([&pattern1, &pattern2], |row| {
                let name: String = row.get(0)?;
                let encrypted: Vec<u8> = row.get(1)?;
                Ok((name, encrypted))
            })
            .map_err(|e| format!("cookies query iter failed: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        raw_rows
            .into_iter()
            .filter_map(|(name, encrypted)| {
                decrypt_cookie_value(&encrypted, &key)
                    .ok()
                    .map(|value| (name, value))
            })
            .collect()
    };

    drop(conn);
    let _ = std::fs::remove_file(
        std::env::temp_dir().join(format!("jstudio_chrome_cookies_{}.db", std::process::id())),
    );

    Ok(cookies)
}

// ---------------------------------------------------------------------------
// Cookie cache (avoid re-reading SQLite DB on every sub-resource request)
// ---------------------------------------------------------------------------

struct CookieCacheEntry {
    domain: String,
    cookies: Vec<(String, String)>,
    timestamp: Instant,
}

static COOKIE_CACHE: Mutex<Option<CookieCacheEntry>> = Mutex::new(None);
const COOKIE_CACHE_TTL: Duration = Duration::from_secs(30);

/// Read Chrome cookies with a 30-second in-memory cache keyed by parent domain.
fn read_chrome_cookies_cached(url: &str) -> Vec<(String, String)> {
    let domain = match extract_domain(url) {
        Ok(h) => parent_domain(&h),
        Err(_) => return vec![],
    };

    {
        let cache = COOKIE_CACHE.lock().unwrap();
        if let Some(ref entry) = *cache {
            if entry.domain == domain && entry.timestamp.elapsed() < COOKIE_CACHE_TTL {
                return entry.cookies.clone();
            }
        }
    }

    // Cache miss — read fresh.
    match read_chrome_cookies_raw(url) {
        Ok(cookies) => {
            let mut cache = COOKIE_CACHE.lock().unwrap();
            *cache = Some(CookieCacheEntry {
                domain,
                cookies: cookies.clone(),
                timestamp: Instant::now(),
            });
            cookies
        }
        Err(_) => vec![],
    }
}

fn build_cookie_header(cookies: &[(String, String)]) -> String {
    cookies
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

// ---------------------------------------------------------------------------
// Shared HTTP client
// ---------------------------------------------------------------------------

static HTTP_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::blocking::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(5))
            .timeout(Duration::from_secs(15))
            .danger_accept_invalid_certs(true)
            .build()
            .expect("failed to build HTTP client")
    })
}

const BROWSER_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Tauri command: fetch_link_metadata
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fetch_link_metadata(url: String) -> Result<LinkMetadata, String> {
    let cookies = read_chrome_cookies_cached(&url);
    let cookie_header = build_cookie_header(&cookies);

    let client = http_client();
    let mut req = client
        .get(&url)
        .header("User-Agent", BROWSER_UA)
        .header("Accept-Encoding", "identity"); // no compression

    if !cookie_header.is_empty() {
        req = req.header("Cookie", cookie_header);
    }

    let resp = req
        .send()
        .map_err(|e| format!("HTTP request failed: {e}"))?;
    let final_url = resp.url().to_string();
    let html = resp
        .text()
        .map_err(|e| format!("failed to read body: {e}"))?;

    let title = extract_html_title(&html).unwrap_or_default();
    let description = extract_meta_content(&html, "name", "description")
        .or_else(|| extract_meta_content(&html, "property", "og:description"))
        .unwrap_or_default();
    let og_image = extract_meta_content(&html, "property", "og:image").unwrap_or_default();
    let favicon_url = extract_favicon_url(&html, &final_url);
    let site_name = extract_meta_content(&html, "property", "og:site_name").unwrap_or_default();

    Ok(LinkMetadata {
        title,
        description,
        favicon_url,
        og_image,
        site_name,
        url: final_url,
    })
}

// ---------------------------------------------------------------------------
// Tauri custom protocol handler: webpreview://
// ---------------------------------------------------------------------------

/// Handle a `webpreview://` protocol request.
///
/// This is the transparent HTTP reverse proxy. It:
///   1. Reconstructs the original HTTPS URL from the proxy URI.
///   2. Reads Chrome cookies for the target domain (cached).
///   3. Forwards the request (method, select headers, body) with cookies.
///   4. For HTML responses, rewrites absolute URLs to use `webpreview://`.
///   5. Strips iframe-blocking headers (`X-Frame-Options`, CSP).
pub fn handle_webpreview_request(request: &Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let uri = request.uri().to_string();

    let target_url = match reconstruct_target_url(&uri) {
        Ok(u) => u,
        Err(e) => return error_response(400, &e),
    };

    let cookies = read_chrome_cookies_cached(&target_url);
    let cookie_header = build_cookie_header(&cookies);

    let client = http_client();
    let method = request.method();
    let mut req = match method.as_str() {
        "POST" => client.post(&target_url),
        "PUT" => client.put(&target_url),
        "DELETE" => client.delete(&target_url),
        "HEAD" => client.head(&target_url),
        _ => client.get(&target_url),
    };

    req = req
        .header("User-Agent", BROWSER_UA)
        .header("Accept-Encoding", "identity");

    if !cookie_header.is_empty() {
        req = req.header("Cookie", cookie_header);
    }

    // Forward select request headers, rewriting proxy-specific ones.
    let target_host = extract_domain(&target_url).unwrap_or_default();
    for (name, value) in request.headers() {
        if let Ok(v) = value.to_str() {
            match name.as_str().to_lowercase().as_str() {
                "accept" | "accept-language" | "content-type" => {
                    req = req.header(name.as_str(), v);
                }
                "origin" => {
                    // Rewrite webpreview:// → https://
                    let rewritten = v.replace("webpreview://", "https://");
                    req = req.header("Origin", &rewritten);
                }
                "referer" => {
                    let rewritten = v.replace("webpreview://", "https://");
                    req = req.header("Referer", &rewritten);
                }
                "host" => {
                    req = req.header("Host", &target_host);
                }
                _ => {} // skip all other headers
            }
        }
    }

    // Forward body for POST/PUT.
    if method == "POST" || method == "PUT" {
        let body = request.body().clone();
        if !body.is_empty() {
            req = req.body(body);
        }
    }

    let resp = match req.send() {
        Ok(r) => r,
        Err(e) => return error_response(502, &format!("proxy fetch failed: {e}")),
    };

    let status = resp.status();
    let headers = resp.headers().clone();
    let content_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body_bytes = resp.bytes().unwrap_or_default();

    // Rewrite URLs in HTML; pass through everything else.
    let final_body: Vec<u8> = if content_type.contains("text/html") {
        let html = String::from_utf8_lossy(&body_bytes);
        rewrite_html_urls(&html).into_bytes()
    } else {
        body_bytes.to_vec()
    };

    // Build response, stripping headers that prevent iframe embedding.
    let mut builder = Response::builder().status(status);
    for (name, value) in &headers {
        match name.as_str().to_lowercase().as_str() {
            // Strip — these prevent iframe embedding or break proxy
            "x-frame-options"
            | "content-security-policy"
            | "content-security-policy-report-only"
            | "set-cookie"
            | "set-cookie2"
            | "transfer-encoding"
            | "content-encoding"
            | "content-length"
            | "connection"
            | "keep-alive" => {}
            _ => {
                builder = builder.header(name, value);
            }
        }
    }

    builder
        .body(Cow::Owned(final_body))
        .unwrap_or_else(|_| error_response(500, "failed to build proxy response"))
}

/// Reconstruct the real HTTPS URL from a `webpreview://` proxy URI.
///
/// `webpreview://github.com/user/repo?foo=bar` → `https://github.com/user/repo?foo=bar`
fn reconstruct_target_url(proxy_uri: &str) -> Result<String, String> {
    // Standard format: webpreview://host/path
    if let Some(rest) = proxy_uri.strip_prefix("webpreview://") {
        return Ok(format!("https://{rest}"));
    }
    // Fallback: some platforms pass it differently
    if let Some(rest) = proxy_uri.strip_prefix("webpreview/") {
        return Ok(format!("https://{rest}"));
    }
    Err(format!("unrecognized proxy URI: {proxy_uri}"))
}

/// Build a minimal error response.
fn error_response(status: u16, msg: &str) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(Cow::Owned(msg.as_bytes().to_vec()))
        .unwrap()
}

// ---------------------------------------------------------------------------
// HTML URL rewriting
// ---------------------------------------------------------------------------

/// Rewrite absolute `https://` / `http://` / `//` URLs in HTML attributes and
/// inline CSS to use the `webpreview://` proxy scheme.
///
/// Relative URLs (e.g. `/about`, `../style.css`) resolve naturally against the
/// proxy base URL and need no rewriting.
fn rewrite_html_urls(html: &str) -> String {
    let mut result = html.to_string();

    // 1. Rewrite absolute URLs in HTML attributes:
    //    src="https://..." → src="webpreview://..."
    //    href="http://..."  → href="webpreview://..."
    {
        let re = regex::Regex::new(
            r#"(?i)((?:src|href|action|poster|data-src|srcset|content|formaction)\s*=\s*["'])https?://"#,
        )
        .unwrap();
        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                format!("{}webpreview://", &caps[1])
            })
            .to_string();
    }

    // 2. Rewrite protocol-relative URLs in attributes:
    //    src="//cdn.example.com/..." → src="webpreview://cdn.example.com/..."
    {
        let re =
            regex::Regex::new(r#"(?i)((?:src|href|action|poster|data-src)\s*=\s*["'])//"#).unwrap();
        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                format!("{}webpreview://", &caps[1])
            })
            .to_string();
    }

    // 3. Rewrite CSS url() references:
    //    url(https://...) → url(webpreview://...)
    //    url('https://...) → url('webpreview://...)
    {
        // Capture group 1 = optional opening quote
        let re = regex::Regex::new(r#"(?i)url\(\s*(['"]?)https?://"#).unwrap();
        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let quote = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                format!("url({quote}webpreview://")
            })
            .to_string();
    }

    // 4. Rewrite CSS @import statements
    {
        // Capture group 1 = the quote character
        let re = regex::Regex::new(r#"(?i)@import\s+(['"])https?://"#).unwrap();
        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let quote = caps.get(1).map(|m| m.as_str()).unwrap_or("\"");
                format!("@import {quote}webpreview://")
            })
            .to_string();
    }

    result
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

fn extract_html_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let content_start = lower[start..].find('>')? + start + 1;
    let end = lower[content_start..].find("</title>")? + content_start;
    let title = html[content_start..end].trim();
    if title.is_empty() {
        None
    } else {
        Some(decode_html_entities(title))
    }
}

fn extract_meta_content(html: &str, attr: &str, key: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let search = format!("{attr}=\"{key}\"");

    let mut pos = 0;
    while let Some(idx) = lower[pos..].find(&search) {
        let abs = pos + idx;
        let win_start = abs.saturating_sub(200);
        let win_end = (abs + search.len() + 300).min(html.len());
        let window = &html[win_start..win_end];
        let window_lower = &lower[win_start..win_end];

        if let Some(c_idx) = window_lower.find("content=\"") {
            let c_start = c_idx + 9;
            if let Some(c_end) = window[c_start..].find('"') {
                let value = &window[c_start..c_start + c_end];
                if !value.is_empty() {
                    return Some(decode_html_entities(value));
                }
            }
        }

        pos = abs + search.len();
    }
    None
}

fn extract_favicon_url(html: &str, base_url: &str) -> String {
    let lower = html.to_lowercase();

    for rel in ["shortcut icon", "icon", "apple-touch-icon"] {
        let search = format!("rel=\"{rel}\"");
        if let Some(idx) = lower.find(&search) {
            let win_end = (idx + 300).min(html.len());
            let window = &html[idx..win_end];
            let window_lower = &lower[idx..win_end];

            if let Some(h_idx) = window_lower.find("href=\"") {
                let h_start = h_idx + 6;
                if let Some(h_end) = window[h_start..].find('"') {
                    let href = &window[h_start..h_start + h_end];
                    return resolve_url(href, base_url);
                }
            }
        }
    }

    if let Ok(parsed) = url::Url::parse(base_url) {
        if let Some(host) = parsed.host_str() {
            return format!("{}://{}/favicon.ico", parsed.scheme(), host);
        }
    }
    String::new()
}

fn resolve_url(href: &str, base: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") || href.starts_with("//") {
        if href.starts_with("//") {
            if let Ok(parsed) = url::Url::parse(base) {
                return format!("{}:{}", parsed.scheme(), href);
            }
        }
        return href.to_string();
    }
    if let Ok(base_url) = url::Url::parse(base) {
        if let Ok(resolved) = base_url.join(href) {
            return resolved.to_string();
        }
    }
    href.to_string()
}

fn decode_html_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

fn decode_hex(hex: &str) -> Result<Vec<u8>, String> {
    let hex = hex.trim();
    if hex.len() % 2 != 0 {
        return Err("hex string has odd length".into());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&hex[i..i + 2], 16)
                .map_err(|e| format!("hex decode error at {i}: {e}"))
        })
        .collect()
}
