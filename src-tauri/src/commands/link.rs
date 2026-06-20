use aes::Aes128;
use cbc::Decryptor;
use cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use pbkdf2::pbkdf2_hmac;
use rusqlite::Connection;
use serde::Serialize;
use sha1::Sha1;
/**
 * Link preview backend — Chrome cookie extraction + HTTP fetch.
 *
 * Provides two Tauri commands:
 *   - `fetch_link_metadata` — fetch OG/title/description/favicon for a URL
 *   - `fetch_link_page` — fetch full page HTML for inline preview
 *
 * Both commands read Chrome's cookie database (macOS), decrypt the values
 * using the Keychain-stored Chrome Safe Storage password, and inject them
 * as Cookie headers in the HTTP request.  This preserves the user's login
 * state for sites like GitHub, Jira, Notion, etc.
 *
 * If Chrome is not installed or cookie decryption fails, requests are
 * still made without cookies — public pages work fine.
 */
use std::process::Command;

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

#[derive(Serialize, Clone)]
pub struct LinkPageResponse {
    /// Full HTML response body (may be modified to inject `<base>`).
    pub html: String,
    /// Final URL after redirects — used as `<base href>`.
    pub base_url: String,
    pub content_type: String,
}

// ---------------------------------------------------------------------------
// Chrome cookie decryption (macOS)
// ---------------------------------------------------------------------------

/// Retrieve the Chrome Safe Storage password from macOS Keychain.
///
/// Chrome stores its cookie encryption key in the Keychain under the
/// service name "Chrome Safe Storage" and account name "Chrome".
/// The `security` CLI prints it to stderr in the line:
///   `password: 0xXXXX...` (hex) — or as a plain string.
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

    // The password is printed on stderr by `security`.
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Try hex format first: `password: 0x68656c6c6f`
    for line in stderr.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("password:") {
            let rest = rest.trim();
            if let Some(hex) = rest.strip_prefix("0x") {
                // Decode hex → bytes → UTF-8
                let bytes = decode_hex(hex)?;
                return String::from_utf8(bytes)
                    .map_err(|e| format!("keychain password not valid UTF-8: {e}"));
            }
            // Plain string password
            if !rest.is_empty() {
                return Ok(rest.to_string());
            }
        }
    }

    Err("could not find Chrome Safe Storage password in Keychain".into())
}

/// Derive the AES-128 key from the Keychain password.
///
/// Chrome uses PBKDF2-HMAC-SHA1 with:
///   salt = b"saltysalt", iterations = 1003, key length = 16
fn derive_aes_key(password: &str) -> [u8; 16] {
    let salt = b"saltysalt";
    let mut key = [0u8; 16];
    pbkdf2_hmac::<Sha1>(password.as_bytes(), salt, 1003, &mut key);
    key
}

/// Decrypt a single Chrome cookie value.
///
/// Encrypted values start with a 3-byte version prefix (`v10` or `v11`),
/// followed by AES-128-CBC ciphertext.  IV is always 16 × 0x20.
fn decrypt_cookie_value(encrypted: &[u8], key: &[u8; 16]) -> Result<String, String> {
    if encrypted.len() < 4 {
        // Not encrypted (plain-text cookie)
        return String::from_utf8(encrypted.to_vec())
            .map_err(|e| format!("plain cookie not UTF-8: {e}"));
    }

    let prefix = &encrypted[..3];
    let is_v10 = prefix == b"v10";
    let is_v11 = prefix == b"v11";

    if !is_v10 && !is_v11 {
        // Not a Chrome-encrypted cookie — return as-is
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

/// Extract the registered domain from a URL.
///
/// For `https://www.example.com/path` this returns `example.com` so we can
/// match parent-domain cookies.
fn extract_domain(url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("invalid URL: {e}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?;

    // Strip leading `www.` and get the last two labels (e.g. example.com)
    let host = host.trim_start_matches("www.");

    // For matching purposes return the full host; we'll also try parent domain
    Ok(host.to_string())
}

/// Get the parent domain (last two labels) from a host.
fn parent_domain(host: &str) -> String {
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() <= 2 {
        host.to_string()
    } else {
        parts[parts.len() - 2..].join(".")
    }
}

/// Copy the Chrome Cookies SQLite DB to a temp file and open it read-only.
///
/// Chrome locks the DB while running.  By copying first we avoid lock issues.
fn open_chrome_cookies_db() -> Result<Connection, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not determine home directory".to_string())?;

    let cookies_path = home.join("Library/Application Support/Google/Chrome/Default/Cookies");

    if !cookies_path.exists() {
        return Err("Chrome cookies database not found".into());
    }

    // Copy to temp to avoid lock
    let tmp =
        std::env::temp_dir().join(format!("jstudio_chrome_cookies_{}.db", std::process::id()));
    std::fs::copy(&cookies_path, &tmp).map_err(|e| format!("failed to copy cookies db: {e}"))?;

    Connection::open(&tmp).map_err(|e| {
        // Clean up temp on error
        let _ = std::fs::remove_file(&tmp);
        format!("failed to open cookies db: {e}")
    })
}

/// Read all cookies for a given URL from Chrome's cookie database.
///
/// Returns a vector of `(name, value)` pairs.
fn read_chrome_cookies(url: &str) -> Result<Vec<(String, String)>, String> {
    let host = extract_domain(url)?;
    let domain = parent_domain(&host);

    // Try to get the Chrome Keychain password + derived AES key.
    // If this fails, we simply return an empty vec (no cookies).
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

        // Match both `.<domain>` (parent cookies) and `<host>` (exact)
        let pattern1 = format!("%{domain}%");
        let pattern2 = format!("%{host}%");

        // Collect raw rows first to end the borrow of `stmt`
        let raw_rows: Vec<(String, Vec<u8>)> = stmt
            .query_map([&pattern1, &pattern2], |row| {
                let name: String = row.get(0)?;
                let encrypted: Vec<u8> = row.get(1)?;
                Ok((name, encrypted))
            })
            .map_err(|e| format!("cookies query iter failed: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        // Now decrypt outside the statement borrow scope
        raw_rows
            .into_iter()
            .filter_map(|(name, encrypted)| {
                decrypt_cookie_value(&encrypted, &key)
                    .ok()
                    .map(|value| (name, value))
            })
            .collect()
    };

    // Clean up temp db
    drop(conn);
    let _ = std::fs::remove_file(
        std::env::temp_dir().join(format!("jstudio_chrome_cookies_{}.db", std::process::id())),
    );

    Ok(cookies)
}

/// Build a `Cookie` header value from cookie pairs.
fn build_cookie_header(cookies: &[(String, String)]) -> String {
    cookies
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

// ---------------------------------------------------------------------------
// HTTP fetch with cookies
// ---------------------------------------------------------------------------

/// Build a reqwest blocking client with a realistic User-Agent.
fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(15))
        .danger_accept_invalid_certs(true) // some internal/dev sites
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Fetch link metadata (title, description, favicon, OG image) for a URL.
///
/// Uses Chrome cookies to preserve login state.
#[tauri::command]
pub async fn fetch_link_metadata(url: String) -> Result<LinkMetadata, String> {
    // Read Chrome cookies (may be empty if Chrome is not installed)
    let cookies = read_chrome_cookies(&url)?;
    let cookie_header = build_cookie_header(&cookies);

    let client = http_client()?;
    let mut req = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

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

/// Fetch full page HTML for inline preview.
///
/// Uses Chrome cookies to preserve login state.
#[tauri::command]
pub async fn fetch_link_page(url: String) -> Result<LinkPageResponse, String> {
    let cookies = read_chrome_cookies(&url)?;
    let cookie_header = build_cookie_header(&cookies);

    let client = http_client()?;
    let mut req = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    if !cookie_header.is_empty() {
        req = req.header("Cookie", cookie_header);
    }

    let resp = req
        .send()
        .map_err(|e| format!("HTTP request failed: {e}"))?;
    let final_url = resp.url().to_string();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("text/html")
        .to_string();
    let html = resp
        .text()
        .map_err(|e| format!("failed to read body: {e}"))?;

    Ok(LinkPageResponse {
        html,
        base_url: final_url,
        content_type,
    })
}

// ---------------------------------------------------------------------------
// HTML parsing helpers (simple regex/string based — no heavy dependency)
// ---------------------------------------------------------------------------

/// Extract `<title>...</title>` content from HTML.
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

/// Extract `<meta property/name="key" content="value">` content.
fn extract_meta_content(html: &str, attr: &str, key: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let search = format!("{attr}=\"{key}\"");

    // Find all occurrences and check for `content` attribute nearby
    let mut pos = 0;
    while let Some(idx) = lower[pos..].find(&search) {
        let abs = pos + idx;
        // Look within ±300 chars for `content="..."`
        let win_start = abs.saturating_sub(200);
        let win_end = (abs + search.len() + 300).min(html.len());
        let window = &html[win_start..win_end];
        let window_lower = &lower[win_start..win_end];

        if let Some(c_idx) = window_lower.find("content=\"") {
            let c_start = c_idx + 9; // len("content=\"") == 9
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

/// Extract favicon URL from `<link rel="icon" href="...">`.
fn extract_favicon_url(html: &str, base_url: &str) -> String {
    let lower = html.to_lowercase();

    // Try `rel="icon"`, `rel="shortcut icon"`, `rel="apple-touch-icon"`
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

    // Fallback: `{scheme}://{host}/favicon.ico`
    if let Ok(parsed) = url::Url::parse(base_url) {
        if let Some(host) = parsed.host_str() {
            return format!("{}://{}/favicon.ico", parsed.scheme(), host);
        }
    }
    String::new()
}

/// Resolve a possibly-relative URL against a base.
fn resolve_url(href: &str, base: &str) -> String {
    // Already absolute?
    if href.starts_with("http://") || href.starts_with("https://") || href.starts_with("//") {
        if href.starts_with("//") {
            if let Ok(parsed) = url::Url::parse(base) {
                return format!("{}:{}", parsed.scheme(), href);
            }
        }
        return href.to_string();
    }
    // Resolve relative
    if let Ok(base_url) = url::Url::parse(base) {
        if let Ok(resolved) = base_url.join(href) {
            return resolved.to_string();
        }
    }
    href.to_string()
}

/// Decode basic HTML entities.
fn decode_html_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

/// Decode a hex string to bytes.
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
