/**
 * fetch.ts — HTTP proxy helpers: link metadata (with Chrome cookie
 * injection) and the AI-graph CORS-bypass POST proxy.
 * Port of src-tauri/src/commands/{link.rs, ai_graph.rs}.
 *
 * Known deviation: the Rust link client accepted invalid TLS certs
 * (danger_accept_invalid_certs); Node's fetch has no per-request toggle for
 * that and the process-wide switch would also weaken ai_graph (whose Rust
 * client validated certs), so link fetches here are strict. Sites with
 * broken certs fail metadata fetch instead of succeeding.
 */

import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { HandlerTable } from "./router";
import { takeObject, takeString } from "./params";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── ai_graph.rs — app-data log (shared by ai_graph_fetch / write_graph_log) ──

function appDataDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support");
    case "win32":
      return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    default:
      return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  }
}

function aiGraphLogPath(): string {
  return path.join(appDataDir(), "jstudio", "ai_graph.log");
}

function logToFile(msg: string): void {
  const p = aiGraphLogPath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // chrono's "%Y-%m-%d %H:%M:%S%.3f", local time.
    const d = new Date();
    const ts =
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` +
      `-${String(d.getDate()).padStart(2, "0")}` +
      ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` +
      `:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
    fs.appendFileSync(p, `[${ts}] ${msg}\n`);
  } catch {
    // logging is best-effort, same as the Rust side's `let _ =`
  }
}

interface AiGraphRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutSecs?: number;
}

async function aiGraphFetch(req: AiGraphRequest): Promise<Record<string, unknown>> {
  const timeoutMs = req.timeoutSecs && req.timeoutSecs > 0 ? req.timeoutSecs * 1000 : 60_000;
  // Mirror reqwest's redirect::Policy::limited(5).
  let target = req.url;
  for (let redirects = 0; ; redirects++) {
    let resp: Response;
    try {
      resp = await fetch(target, {
        method: "POST",
        headers: req.headers,
        body: req.body === "" ? undefined : req.body,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const chain = String(e instanceof Error ? e.message : e);
      logToFile(`POST ${req.url} -> send failed: ${chain}`);
      throw new Error(`HTTP request failed: ${chain}`);
    }
    if (resp.status >= 300 && resp.status < 400 && redirects < 5) {
      const loc = resp.headers.get("location");
      if (loc) {
        target = new URL(loc, target).toString();
        continue;
      }
    }
    const status = resp.status;
    const body = await resp.text().catch((e: unknown) => {
      const chain = String(e instanceof Error ? e.message : e);
      logToFile(`POST ${req.url} (status ${status}) -> read body failed: ${chain}`);
      throw new Error(`failed to read response body: ${chain}`);
    });
    logToFile(`POST ${req.url} -> status ${status}, body ${body.length} bytes`);
    return { status, ok: resp.ok, body };
  }
}

// ── link.rs — Chrome cookie decryption chain (macOS) ─────────────────────────

function decodeHex(hex: string): Buffer {
  const h = hex.trim();
  if (h.length % 2 !== 0) throw new Error("hex string has odd length");
  return Buffer.from(h, "hex");
}

function getChromeKeychainPassword(): string {
  const res = spawnSync(
    "security",
    ["find-generic-password", "-ga", "Chrome", "-s", "Chrome Safe Storage"],
    { encoding: "utf8" },
  );
  // `security` prints the password to stderr ("password: 0x…").
  for (const line of (res.stderr ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("password:")) {
      const rest = trimmed.slice("password:".length).trim();
      if (rest.startsWith("0x")) return decodeHex(rest.slice(2)).toString("utf8");
      if (rest !== "") return rest;
    }
  }
  throw new Error("could not find Chrome Safe Storage password in Keychain");
}

function deriveAesKey(password: string): Buffer {
  // salt "saltysalt", 1003 iterations, 16 bytes — Chrome's classic key.
  return crypto.pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
}

function decryptCookieValue(encrypted: Buffer, key: Buffer): string {
  if (encrypted.length < 4) return encrypted.toString("utf8");

  const prefix = encrypted.subarray(0, 3);
  const isV10 = prefix.toString("latin1") === "v10";
  const isV11 = prefix.toString("latin1") === "v11";
  if (!isV10 && !isV11) return encrypted.toString("utf8");

  const ciphertext = encrypted.subarray(3);
  const iv = Buffer.alloc(16, 0x20);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Strip PKCS7 padding manually (the Rust side used Pkcs7 unpadding).
  const pad = plaintext[plaintext.length - 1];
  const plain =
    pad >= 1 && pad <= 16 ? plaintext.subarray(0, plaintext.length - pad) : plaintext;

  // Chrome 127+ (macOS) app-bound layer: [32-byte hash][cookie value].
  const value = plain.length > 32 ? plain.subarray(32) : plain;
  return value.toString("utf8");
}

function extractDomain(url: string): string {
  const parsed = new URL(url);
  if (!parsed.hostname) throw new Error("URL has no host");
  // trim_start_matches strips REPEATED leading "www." — match that.
  return parsed.hostname.replace(/^(?:www\.)+/, "");
}

function parentDomain(host: string): string {
  const parts = host.split(".");
  return parts.length <= 2 ? host : parts.slice(-2).join(".");
}

function openChromeCookiesDb(): DatabaseSync {
  const cookiesPath = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "Default",
    "Cookies",
  );
  if (!fs.existsSync(cookiesPath)) throw new Error("Chrome cookies database not found");

  const tmp = path.join(os.tmpdir(), `jstudio_chrome_cookies_${process.pid}.db`);
  fs.copyFileSync(cookiesPath, tmp);
  try {
    return new DatabaseSync(tmp);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`failed to open cookies db: ${String(e)}`);
  }
}

function readChromeCookiesRaw(url: string): Array<[string, string]> {
  let host: string;
  try {
    host = extractDomain(url);
  } catch {
    return [];
  }
  const domain = parentDomain(host);

  let key: Buffer;
  try {
    key = deriveAesKey(getChromeKeychainPassword());
  } catch {
    return []; // no keychain access — proceed cookie-less, same as Rust
  }

  let conn: DatabaseSync;
  try {
    conn = openChromeCookiesDb();
  } catch {
    return [];
  }

  const tmpDb = path.join(os.tmpdir(), `jstudio_chrome_cookies_${process.pid}.db`);
  try {
    const rows = conn
      .prepare(
        "SELECT name, encrypted_value, host_key FROM cookies WHERE host_key = ?1 OR host_key = ?2 OR host_key = ?3 OR host_key = ?4",
      )
      .all(`.${domain}`, domain, `.${host}`, host) as Array<{
      name: string;
      encrypted_value: Buffer;
    }>;

    const cookies: Array<[string, string]> = [];
    for (const row of rows) {
      try {
        cookies.push([row.name, decryptCookieValue(row.encrypted_value, key)]);
      } catch {
        // undecryptable cookie — skipped, same as Rust's filter_map
      }
    }
    return cookies;
  } finally {
    conn.close();
    fs.rmSync(tmpDb, { force: true });
  }
}

// 30s TTL cache — avoid re-reading the cookies SQLite on rapid calls.
let cookieCache: { domain: string; cookies: Array<[string, string]>; ts: number } | null = null;
const COOKIE_CACHE_TTL = 30_000;

function readChromeCookiesCached(url: string): Array<[string, string]> {
  let domain = "";
  try {
    domain = parentDomain(extractDomain(url));
  } catch {
    return [];
  }
  if (cookieCache && cookieCache.domain === domain && Date.now() - cookieCache.ts < COOKIE_CACHE_TTL) {
    return cookieCache.cookies;
  }
  const cookies = readChromeCookiesRaw(url);
  cookieCache = { domain, cookies, ts: Date.now() };
  return cookies;
}

// ── link.rs — HTML parsing helpers ───────────────────────────────────────────

function decodeHtmlEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractHtmlTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const title = m[1].trim();
  return title === "" ? null : decodeHtmlEntities(title);
}

function extractMetaContent(html: string, attr: string, key: string): string | null {
  const k = escapeRe(key);
  // attr="key" … content="value"
  let m = new RegExp(
    `<meta[^>]*${attr}=["']${k}["'][^>]*content=["']([^"']*)["']`,
    "is",
  ).exec(html);
  if (m && m[1] !== "") return decodeHtmlEntities(m[1]);
  // content="value" … attr="key"
  m = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${k}["']`,
    "is",
  ).exec(html);
  if (m && m[1] !== "") return decodeHtmlEntities(m[1]);
  return null;
}

function resolveUrl(href: string, base: string): string {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) {
    if (href.startsWith("//")) {
      try {
        return `${new URL(base).protocol}${href}`;
      } catch {
        return href;
      }
    }
    return href;
  }
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function extractFaviconUrl(html: string, baseUrl: string): string {
  for (const rel of ["shortcut icon", "icon", "apple-touch-icon"]) {
    const r = escapeRe(rel);
    let m = new RegExp(`<link[^>]*rel=["']${r}["'][^>]*href=["']([^"']*)["']`, "is").exec(html);
    if (m && m[1] !== "") return resolveUrl(m[1], baseUrl);
    m = new RegExp(`<link[^>]*href=["']([^"']*)["'][^>]*rel=["']${r}["']`, "is").exec(html);
    if (m && m[1] !== "") return resolveUrl(m[1], baseUrl);
  }
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.protocol}//${parsed.host}/favicon.ico`;
  } catch {
    return "";
  }
}

async function fetchLinkMetadata(url: string): Promise<Record<string, unknown>> {
  const cookies = readChromeCookiesCached(url);
  const cookieHeader = cookies.map(([k, v]) => `${k}=${v}`).join("; ");

  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    "Accept-Encoding": "identity",
  };
  if (cookieHeader !== "") headers["Cookie"] = cookieHeader;

  let resp: Response;
  try {
    resp = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new Error(`HTTP request failed: ${String(e instanceof Error ? e.message : e)}`);
  }
  const finalUrl = resp.url;
  let html: string;
  try {
    html = await resp.text();
  } catch (e) {
    throw new Error(`failed to read body: ${String(e instanceof Error ? e.message : e)}`);
  }

  const title = extractHtmlTitle(html) ?? "";
  const description =
    extractMetaContent(html, "name", "description") ??
    extractMetaContent(html, "property", "og:description") ??
    "";
  const ogImage = extractMetaContent(html, "property", "og:image") ?? "";
  const faviconUrl = extractFaviconUrl(html, finalUrl);
  const siteName = extractMetaContent(html, "property", "og:site_name") ?? "";

  return { title, description, faviconUrl, ogImage, siteName, url: finalUrl };
}

export const fetchHandlers: HandlerTable = {
  fetch_link_metadata: (p) => fetchLinkMetadata(takeString(p, "url")),
  ai_graph_fetch: (p) => aiGraphFetch(takeObject(p, "request") as unknown as AiGraphRequest),
  write_graph_log: (p) => {
    logToFile(`[graph-ui] ${takeString(p, "msg")}`);
    return null;
  },
};
