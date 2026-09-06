/**
 * chromeLogin.ts — one-time import of Chrome's login cookies into the app's
 * default session, so the inline browser panel (and AI driving it) opens
 * already-signed-in sites without a re-login.
 *
 * The whole chain runs in the Electron main process — no sidecar round-trip.
 * Node covers every step natively (previously done Rust-side in
 * `src-tauri/src/commands/link.rs` for per-URL link metadata):
 *
 *   1. `security` CLI                  → Chrome Safe Storage password
 *      (macOS Keychain; the very first import pops the Keychain consent
 *      dialog for the Electron binary — allow once, remembered afterwards)
 *   2. crypto.pbkdf2Sync               → PBKDF2-HMAC-SHA1("saltysalt",
 *      1003 iterations) → AES-128 key
 *   3. node:sqlite                     → read every profile's Cookies DB;
 *      copied to a temp dir first (Chrome holds an exclusive lock on it)
 *   4. crypto.createDecipheriv         → decrypt `v10`/`v11` blobs, then skip
 *      the 32-byte app-bound hash Chrome 127+ prepends to the plaintext
 *   5. session.defaultSession.cookies.set() → inject. Browser-panel tabs
 *      (WebContentsView without a partition) use the default session, so
 *      every subsequent navigation picks the cookies up.
 */

import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { session } from "electron";

export interface ChromeLoginImportResult {
  imported: number;
  failed: number;
}

/** One decrypted Chrome cookie, in `session.cookies.set`-ready shape. */
interface ChromeCookie {
  /** Chrome `host_key`; a leading dot means a domain cookie (subdomains too). */
  host: string;
  name: string;
  value: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  /** Seconds since the unix epoch; absent for session cookies. */
  expirationDate?: number;
  sameSite?: "no_restriction" | "lax" | "strict";
  /** Creation time (unix seconds) — newest wins when profiles overlap. */
  creationSec: number;
}

interface ChromeCookieRow {
  name: string;
  value: string | null;
  encrypted_value: Uint8Array | null;
  host_key: string;
  path: string;
  is_secure: number | null;
  is_httponly: number | null;
  expires_utc: number | bigint | null;
  creation_utc: number | bigint | null;
  samesite: number | bigint | null;
}

/** WebKit epoch offset (micros since 1601-01-01 → unix seconds). */
const WEBKIT_EPOCH_OFFSET = 11644473600;
/** Chrome's fixed AES-CBC IV (all-0x20 bytes). */
const AES_IV = Buffer.alloc(16, 0x20);

function asNumber(v: number | bigint | null | undefined): number {
  if (typeof v === "bigint") return Number(v);
  return v ?? 0;
}

/** Micros since 1601 → unix seconds; `undefined` for session cookies (0). */
function webkitMicrosToUnixSec(micros: number): number | undefined {
  if (micros <= 0) return undefined;
  const sec = micros / 1e6 - WEBKIT_EPOCH_OFFSET;
  return sec > 0 ? sec : undefined;
}

// ── Keychain ────────────────────────────────────────────────────────────────

/**
 * Read the "Chrome Safe Storage" secret from the macOS Keychain. `security`
 * prints it on stderr as either hex (`password: 0x61 62 …`) or a literal
 * string, mirroring the Rust-side parser in link.rs.
 */
function chromeSafeStorageKey(): Buffer {
  const res = spawnSync("security", [
    "find-generic-password",
    "-ga",
    "Chrome",
    "-s",
    "Chrome Safe Storage",
  ]);
  if (res.error) {
    throw new Error(`only supported on macOS ('security' CLI unavailable): ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(
      "could not read 'Chrome Safe Storage' from Keychain — is Chrome installed, and was the Keychain prompt allowed?",
    );
  }
  const m = /^password:\s*(.+?)\s*$/m.exec(res.stderr.toString());
  if (!m) throw new Error("could not parse 'Chrome Safe Storage' Keychain output");
  const raw = m[1];
  if (raw.startsWith("0x")) return Buffer.from(raw.slice(2).replace(/\s+/g, ""), "hex");
  return Buffer.from(raw, "utf8");
}

// ── Decryption (parity with decrypt_cookie_value in link.rs) ────────────────

function decryptCookieValue(blob: Buffer, plaintextFallback: string, key: Buffer): string {
  if (blob.length === 0) return plaintextFallback;

  const prefix = blob.subarray(0, 3).toString("latin1");
  if (prefix !== "v10" && prefix !== "v11") {
    // Legacy rows stored the value unencrypted inside encrypted_value.
    const raw = blob.toString("utf8");
    return raw || plaintextFallback;
  }

  try {
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, AES_IV);
    let out = Buffer.concat([decipher.update(blob.subarray(3)), decipher.final()]);
    // Chrome 127+ app-bound encryption: the AES plaintext is
    // `[32-byte app-bound hash][actual cookie value]`.
    if (out.length > 32) out = out.subarray(32);
    return out.toString("utf8");
  } catch {
    return ""; // padding/UTF-8 failure → caller skips the cookie
  }
}

// ── Reading Chrome's Cookies DB ─────────────────────────────────────────────

/** Every Chrome profile whose Cookies DB exists (Default + Profile N). */
function chromeCookieDbs(): string[] {
  const root = path.join(os.homedir(), "Library/Application Support/Google/Chrome");
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    throw new Error("Chrome cookies database not found (is Chrome installed?)");
  }
  const dbs = entries
    .filter((d) => d === "Default" || /^Profile \d+$/.test(d))
    .map((p) => path.join(root, p, "Cookies"))
    .filter((p) => fs.existsSync(p));
  if (dbs.length === 0) {
    throw new Error("Chrome cookies database not found (is Chrome installed?)");
  }
  return dbs;
}

function readChromeCookies(): ChromeCookie[] {
  const key = chromeSafeStorageKey();
  const best = new Map<string, ChromeCookie>();
  let hadDbError = false;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jstudio-chrome-"));
  try {
    chromeCookieDbs().forEach((dbPath, i) => {
      const tmp = path.join(tmpDir, `cookies-${i}.db`);
      try {
        // Chrome keeps the original locked; the copy is readable anytime.
        fs.copyFileSync(dbPath, tmp);
        const db = new DatabaseSync(tmp);
        let rows: ChromeCookieRow[];
        try {
          rows = db
            .prepare(
              "SELECT name, value, encrypted_value, host_key, path, is_secure, is_httponly, expires_utc, creation_utc, samesite FROM cookies",
            )
            .all() as ChromeCookieRow[];
        } finally {
          db.close();
        }

        for (const row of rows) {
          if (!row.name) continue;
          const value = decryptCookieValue(
            Buffer.from(row.encrypted_value ?? []),
            row.value ?? "",
            key,
          );
          if (!value) continue;

          const cookie: ChromeCookie = {
            host: row.host_key,
            name: row.name,
            value,
            path: row.path || "/",
            secure: !!row.is_secure,
            httpOnly: !!row.is_httponly,
            expirationDate: webkitMicrosToUnixSec(asNumber(row.expires_utc)),
            sameSite: sameSiteOf(row.samesite),
            creationSec: asNumber(row.creation_utc) / 1e6 - WEBKIT_EPOCH_OFFSET,
          };
          // Chrome purges expired rows lazily — don't carry dead cookies over.
          if (
            cookie.expirationDate !== undefined &&
            cookie.expirationDate * 1000 < Date.now()
          ) {
            continue;
          }
          // Profiles overlap; newest creation wins per (host, name, path).
          const k = `${cookie.host}\u0000${cookie.name}\u0000${cookie.path}`;
          const prev = best.get(k);
          if (!prev || prev.creationSec <= cookie.creationSec) best.set(k, cookie);
        }
      } catch {
        hadDbError = true; // unreadable profile → try the remaining ones
      }
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  if (best.size === 0 && hadDbError) {
    throw new Error("no cookies could be read from Chrome's profile database");
  }
  return [...best.values()];
}

/** Chrome `samesite` column (0 none / 1 lax / 2 strict / -1+ unspecified). */
function sameSiteOf(v: number | bigint | null): ChromeCookie["sameSite"] {
  switch (asNumber(v)) {
    case 0:
      return "no_restriction";
    case 1:
      return "lax";
    case 2:
      return "strict";
    default:
      return undefined;
  }
}

// ── Injection into the default session ──────────────────────────────────────

/**
 * Read Chrome's cookies and inject them into the default session so browser
 * tabs (and AI navigation) reuse the user's Chrome logins. Resolves with the
 * per-cookie outcome counts.
 */
export async function importChromeLoginState(): Promise<ChromeLoginImportResult> {
  const cookies = readChromeCookies();
  let imported = 0;
  let failed = 0;

  const CHUNK = 50; // bounded parallelism for the native cookie store
  for (let i = 0; i < cookies.length; i += CHUNK) {
    await Promise.all(
      cookies.slice(i, i + CHUNK).map(async (c) => {
        const bare = c.host.replace(/^\./, "");
        if (!bare) {
          failed++;
          return;
        }
        const details: Electron.CookiesSetDetails = {
          url: `https://${bare}${c.path || "/"}`,
          name: c.name,
          value: c.value,
          path: c.path || "/",
          secure: c.secure,
          httpOnly: c.httpOnly,
        };
        // Host-only cookies must NOT pass an explicit domain — Electron would
        // widen them to subdomains (leading-dot host_key is the domain kind).
        if (c.host.startsWith(".")) details.domain = c.host;
        if (c.expirationDate !== undefined) details.expirationDate = c.expirationDate;
        if (c.sameSite) details.sameSite = c.sameSite;
        try {
          await session.defaultSession.cookies.set(details);
          imported++;
        } catch {
          failed++; // e.g. rejected __Host-/__Secure- prefix rules → skip
        }
      }),
    );
  }

  return { imported, failed };
}
