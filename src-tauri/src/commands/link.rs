/**
 * Link preview backend — Chrome cookie extraction + native WebviewWindow.
 *
 * Two Tauri commands:
 *   1. `fetch_link_metadata` — async, fetches OG/title/description for card mode.
 *   2. `open_link_preview`   — creates a native WebviewWindow loading the real URL,
 *      with Chrome cookies injected via `initialization_script` as `document.cookie`.
 *
 * Cookie extraction chain (macOS):
 *   Keychain → Chrome Safe Storage password → PBKDF2-HMAC-SHA1 → AES-128 key
 *   → decrypt Chrome Cookies SQLite DB (skip 32-byte app-bound prefix)
 *   → inject as `document.cookie` in the WebviewWindow.
 */
use aes::Aes128;
use cbc::Decryptor;
use cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7};
use pbkdf2::pbkdf2_hmac;
use rusqlite::Connection;
use serde::Serialize;
use sha1::Sha1;
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::webview::NewWindowResponse;
use tauri::{WebviewUrl, WebviewWindowBuilder};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct LinkMetadata {
    pub title: String,
    pub description: String,
    pub favicon_url: String,
    pub og_image: String,
    pub site_name: String,
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

    // Chrome 127+ (macOS) adds an app-bound encryption layer. The AES
    // decrypted output is `[32-byte app-bound hash][actual cookie value]`.
    let cookie_value = if plaintext.len() > 32 {
        &plaintext[32..]
    } else {
        &plaintext[..]
    };

    String::from_utf8(cookie_value.to_vec()).map_err(|e| format!("decrypted cookie not UTF-8: {e}"))
}

pub fn extract_domain(url: &str) -> Result<String, String> {
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

/// Read all cookies for a given URL from Chrome's cookie database.
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
                 WHERE host_key = ?1 OR host_key = ?2 OR host_key = ?3 OR host_key = ?4",
            )
            .map_err(|e| format!("cookies query failed: {e}"))?;

        let pattern1 = format!(".{domain}");
        let pattern2 = domain.clone();
        let pattern3 = format!(".{host}");
        let pattern4 = host.clone();

        let raw_rows: Vec<(String, Vec<u8>)> = stmt
            .query_map([&pattern1, &pattern2, &pattern3, &pattern4], |row| {
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
// Cookie cache (30s TTL — avoid re-reading SQLite on rapid calls)
// ---------------------------------------------------------------------------

struct CookieCacheEntry {
    domain: String,
    cookies: Vec<(String, String)>,
    timestamp: Instant,
}

static COOKIE_CACHE: Mutex<Option<CookieCacheEntry>> = Mutex::new(None);
const COOKIE_CACHE_TTL: Duration = Duration::from_secs(30);

pub fn read_chrome_cookies_cached(url: &str) -> Vec<(String, String)> {
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

pub const BROWSER_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Tauri command: fetch_link_metadata (async)
// ---------------------------------------------------------------------------

static ASYNC_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn async_http_client() -> &'static reqwest::Client {
    ASYNC_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(5))
            .timeout(Duration::from_secs(15))
            .danger_accept_invalid_certs(true)
            .build()
            .expect("failed to build async HTTP client")
    })
}

#[tauri::command]
pub async fn fetch_link_metadata(url: String) -> Result<LinkMetadata, String> {
    let cookies = read_chrome_cookies_cached(&url);
    let cookie_header = build_cookie_header(&cookies);

    let client = async_http_client();
    let mut req = client
        .get(&url)
        .header("User-Agent", BROWSER_UA)
        .header("Accept-Encoding", "identity");

    if !cookie_header.is_empty() {
        req = req.header("Cookie", cookie_header);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;
    let final_url = resp.url().to_string();
    let html = resp
        .text()
        .await
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

fn build_cookie_header(cookies: &[(String, String)]) -> String {
    cookies
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

// ---------------------------------------------------------------------------
// Tauri command: open_link_preview — native WebviewWindow
// ---------------------------------------------------------------------------

/// Create a native WebviewWindow that loads the real URL, with Chrome cookies
/// injected via `initialization_script`.
///
/// The WKWebView (macOS) / WebView2 (Windows) engine handles all rendering,
/// JS execution, AJAX, etc. natively — no proxy or URL rewriting needed.
///
/// ## window.open() support
///
/// Uses `on_new_window` to intercept `window.open()` and `target="_blank"` requests.
/// Each such request creates a new independent preview window, allowing pages
/// that rely on popup flows (OAuth, external links) to work correctly.
#[tauri::command]
pub async fn open_link_preview(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let cookies = read_chrome_cookies_cached(&url);
    let host = extract_domain(&url).unwrap_or_else(|_| "site".to_string());

    // Build a JS initialization script that sets document.cookie for each
    // Chrome cookie. This runs before the page's own scripts, ensuring
    // the login state is present when the page loads.
    let cookie_script = if cookies.is_empty() {
        String::new()
    } else {
        let mut lines = Vec::new();
        for (name, value) in &cookies {
            // Escape single quotes in values to avoid breaking the JS string.
            let safe_value = value.replace('\\', "\\\\").replace('\'', "\\'");
            let safe_name = name.replace('\\', "\\\\").replace('\'', "\\'");
            // Only inject if the cookie doesn't already exist in the webview's
            // persistent cookie store. This prevents Chrome's (potentially stale)
            // cookies from overwriting cookies set during a previous session.
            lines.push(format!(
                "if(document.cookie.indexOf('{}=')===-1){{document.cookie='{}={}; path=/; domain=.{}; SameSite=None; Secure';}}",
                safe_name, safe_name, safe_value, host
            ));
        }
        lines.join("\n")
    };

    let label = format!(
        "link-preview-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let title = url::Url::parse(&url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "Link Preview".to_string());

    let url_parsed = url::Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;

    // Wrap AppHandle in Arc for sharing across 'static closures in on_new_window.
    let app_handle = Arc::new(app);

    let mut builder =
        WebviewWindowBuilder::new(&*app_handle, &label, WebviewUrl::External(url_parsed))
            .title(&title)
            .inner_size(1100.0, 800.0)
            .min_inner_size(400.0, 300.0)
            .resizable(true)
            .user_agent(BROWSER_UA)
            .data_store_identifier([
                0x4a, 0x53, 0x74, 0x75, 0x64, 0x69, 0x6f, 0x42, 0x72, 0x6f, 0x77, 0x73, 0x65, 0x72,
                0x00, 0x01,
            ])
            .on_new_window({
                let app_handle = app_handle.clone();
                move |new_url, features| {
                    // Generate unique label for the new window
                    let new_label = format!(
                        "link-preview-{}",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis()
                    );

                    // Parse the requested URL
                    let url_parsed: url::Url = match new_url.as_str().parse() {
                        Ok(u) => u,
                        Err(_) => return NewWindowResponse::Deny,
                    };

                    // Extract hostname for window title
                    let new_title = url_parsed
                        .host_str()
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "Link Preview".to_string());

                    // Create a new preview window for the window.open() request
                    // The new window also supports on_new_window (recursive)
                    let app_for_nested = app_handle.clone();
                    let builder = WebviewWindowBuilder::new(
                        &*app_handle,
                        &new_label,
                        WebviewUrl::External(url_parsed),
                    )
                    .title(&new_title)
                    .inner_size(900.0, 600.0)
                    .min_inner_size(400.0, 300.0)
                    .resizable(true)
                    .user_agent(BROWSER_UA)
                    .data_store_identifier([
                        0x4a, 0x53, 0x74, 0x75, 0x64, 0x69, 0x6f, 0x42, 0x72, 0x6f, 0x77, 0x73,
                        0x65, 0x72, 0x00, 0x01,
                    ])
                    .window_features(features)
                    .on_new_window({
                        let app_handle = app_for_nested.clone();
                        move |nested_url, nested_features| {
                            // Recursively handle nested window.open()
                            let nested_label = format!(
                                "link-preview-{}",
                                std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis()
                            );

                            let nested_url_parsed: url::Url = match nested_url.as_str().parse() {
                                Ok(u) => u,
                                Err(_) => return NewWindowResponse::Deny,
                            };

                            let nested_title = nested_url_parsed
                                .host_str()
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| "Link Preview".to_string());

                            let builder = WebviewWindowBuilder::new(
                                &*app_handle,
                                &nested_label,
                                WebviewUrl::External(nested_url_parsed),
                            )
                            .title(&nested_title)
                            .inner_size(900.0, 600.0)
                            .min_inner_size(400.0, 300.0)
                            .resizable(true)
                            .user_agent(BROWSER_UA)
                            .data_store_identifier([
                                0x4a, 0x53, 0x74, 0x75, 0x64, 0x69, 0x6f, 0x42, 0x72, 0x6f, 0x77,
                                0x73, 0x65, 0x72, 0x00, 0x01,
                            ])
                            .window_features(nested_features);

                            match builder.build() {
                                Ok(window) => NewWindowResponse::Create { window },
                                Err(_) => NewWindowResponse::Deny,
                            }
                        }
                    });

                    match builder.build() {
                        Ok(window) => NewWindowResponse::Create { window },
                        Err(_) => NewWindowResponse::Deny,
                    }
                }
            });

    if !cookie_script.is_empty() {
        builder = builder.initialization_script(&cookie_script);
    }

    builder
        .build()
        .map_err(|e| format!("failed to create webview window: {e}"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// HTML parsing helpers (used by fetch_link_metadata)
// ---------------------------------------------------------------------------

fn extract_html_title(html: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?is)<title[^>]*>(.*?)</title>").ok()?;
    let title = re
        .captures(html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim())?;
    if title.is_empty() {
        None
    } else {
        Some(decode_html_entities(title))
    }
}

fn extract_meta_content(html: &str, attr: &str, key: &str) -> Option<String> {
    let attr_escaped = regex::escape(key);
    // attr="key" ... content="value"
    let pattern =
        format!(r#"(?is)<meta[^>]*{attr}=["']{attr_escaped}["'][^>]*content=["']([^"']*)["']"#);
    if let Some(c) = regex::Regex::new(&pattern).ok()?.captures(html) {
        if let Some(m) = c.get(1) {
            let v = m.as_str();
            if !v.is_empty() {
                return Some(decode_html_entities(v));
            }
        }
    }
    // content="value" ... attr="key"
    let pattern2 =
        format!(r#"(?is)<meta[^>]*content=["']([^"']*)["'][^>]*{attr}=["']{attr_escaped}["']"#);
    if let Some(c) = regex::Regex::new(&pattern2).ok()?.captures(html) {
        if let Some(m) = c.get(1) {
            let v = m.as_str();
            if !v.is_empty() {
                return Some(decode_html_entities(v));
            }
        }
    }
    None
}

fn extract_favicon_url(html: &str, base_url: &str) -> String {
    for rel in ["shortcut icon", "icon", "apple-touch-icon"] {
        let pattern = format!(r#"(?is)<link[^>]*rel=["']{rel}["'][^>]*href=["']([^"']*)["']"#);
        if let Some(c) = regex::Regex::new(&pattern)
            .ok()
            .and_then(|re| re.captures(html))
        {
            if let Some(m) = c.get(1) {
                let href = m.as_str();
                if !href.is_empty() {
                    return resolve_url(href, base_url);
                }
            }
        }
        let pattern2 = format!(r#"(?is)<link[^>]*href=["']([^"']*)["'][^>]*rel=["']{rel}["']"#);
        if let Some(c) = regex::Regex::new(&pattern2)
            .ok()
            .and_then(|re| re.captures(html))
        {
            if let Some(m) = c.get(1) {
                let href = m.as_str();
                if !href.is_empty() {
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
