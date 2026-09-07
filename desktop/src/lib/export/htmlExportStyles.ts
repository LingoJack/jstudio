/**
 * Stylesheet capture for the single-file HTML export.
 *
 * A self-contained HTML file cannot reference `dist/assets/*.css`, so the
 * export inlines everything the editor's markup needs:
 *
 *   1. every rule the running app has loaded (Tailwind output, vscode-theme,
 *      ProseMirror / block styles, the KaTeX stylesheet — all of it)
 *   2. the theme's CSS custom properties, read as *computed* values so the
 *      exported file doesn't have to reproduce the `:root` / `.dark` cascade
 *      or the runtime overrides `applyFont()` writes
 *   3. every `@font-face` payload as a base64 data URL (otherwise the webfonts
 *      — bundled Maple Mono CN, KaTeX — don't exist on the reader's machine
 *      and everything falls back to a default face)
 */

import { native } from '../core/tauriShim/native';
import { base64ToText, bytesToBase64 } from './base64';

/** Matches `url(...)` inside a CSS declaration. */
const URL_IN_CSS_RE = /url\((['"]?)([^'")]+?)\1\)/g;

/** Matches a `@font-face { … }` block (font faces never nest braces). */
const FONT_FACE_BLOCK_RE = /@font-face\s*\{([^}]*)\}/g;

/** Matches a custom-property declaration (`--name: value`). */
const CUSTOM_PROPERTY_RE = /(--[A-Za-z0-9_-]+)\s*:/g;

/**
 * Concatenate every stylesheet the application currently has loaded.
 *
 * Rules keep their original selectors, so the exported file renders the same
 * markup the editor renders — as long as the exported body keeps the editor's
 * class names.
 *
 * Two sources, in order of preference:
 *   - `<style>` elements (what Vite injects in dev): read their text.
 *   - `<link rel=stylesheet>`: read the file. Chromium treats `file://` as an
 *     opaque origin, so in a packaged build `sheet.cssRules` throws and
 *     `fetch` is blocked — those go to the main process, which can read
 *     app.asar. Falling back to nothing here is what loses all styling in the
 *     exported file.
 */
export async function collectAppCss(): Promise<string> {
  const chunks: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    const node = sheet.ownerNode;

    if (node instanceof HTMLStyleElement) {
      if (node.textContent) chunks.push(node.textContent);
      continue;
    }

    if (node instanceof HTMLLinkElement && node.href) {
      try {
        chunks.push(await readAppTextFile(node.href));
        continue;
      } catch {
        // Fall through to the CSSOM attempt.
      }
    }

    try {
      const walk = (rules: CSSRuleList): void => {
        for (const rule of Array.from(rules)) {
          const imported = (rule as CSSImportRule).styleSheet;
          // An @import pointing at a dev-server URL is dead weight here.
          if (imported) {
            try {
              walk(imported.cssRules);
            } catch {
              // Cross-origin import — nothing to salvage.
            }
            continue;
          }
          chunks.push(rule.cssText);
        }
      };
      walk(sheet.cssRules);
    } catch {
      // Opaque-origin sheet: nothing readable.
    }
  }
  return chunks.join('\n');
}

/**
 * Read one of the app's own files as text — a stylesheet, or a script the
 * export inlines (dev server: `fetch`; packaged: the main process, since
 * `file://` fetches are blocked and the bytes live inside app.asar).
 */
export async function readAppTextFile(absoluteUrl: string): Promise<string> {
  if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
    return (await fetch(absoluteUrl)).text();
  }
  return base64ToText(await native().appFileBase64(absoluteUrl));
}

/**
 * Read a file relative to the app root (`dist-viewer/viewer.js`) as text.
 *
 * Deliberately not a `fetch`: in dev the Vite server would treat a built
 * bundle as source, transform it and inject `/@vite/client`, which then
 * breaks the exported file with a CORS error. The main process just reads
 * bytes, in dev and packaged alike.
 */
export async function readAppRelativeText(relativePath: string): Promise<string> {
  return base64ToText(await native().appFileBase64(relativePath));
}

/**
 * Emit the *computed* value of every custom property the app CSS declares.
 *
 * Reading computed values (rather than copying the `:root` / `.dark` rules)
 * means the exported file inherits the theme that is actually on screen —
 * including the font family / size / line height picked in Settings.
 */
export function collectComputedThemeVariables(css: string): string {
  const names = new Set<string>();
  for (const match of css.matchAll(CUSTOM_PROPERTY_RE)) {
    names.add(match[1]);
  }
  // Runtime overrides (`applyFont()`, theme switching) are written straight
  // onto the root/body style attribute and never appear in any stylesheet —
  // without these the export loses the user's font and accent colors.
  for (const el of [document.documentElement, document.body]) {
    for (const match of (el.getAttribute('style') ?? '').matchAll(CUSTOM_PROPERTY_RE)) {
      names.add(match[1]);
    }
  }

  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);
  const declarations: string[] = [];
  for (const name of names) {
    const value =
      rootStyle.getPropertyValue(name).trim() ||
      bodyStyle.getPropertyValue(name).trim();
    if (value) declarations.push(`${name}: ${value};`);
  }
  return `:root {\n  ${declarations.join('\n  ')}\n}`;
}

/**
 * Replace every `url(...)` inside `@font-face` blocks with a base64 data URL.
 *
 * Font URLs point into `dist/assets/`, which does not travel with the
 * exported file. Webfonts are the one resource that cannot be left behind:
 * without them the export silently changes typeface.
 */
export async function inlineFontFaces(
  css: string,
  resolveFont?: (url: string) => Promise<string>,
): Promise<string> {
  const fontUrls = new Set<string>();
  for (const match of css.matchAll(FONT_FACE_BLOCK_RE)) {
    for (const url of match[1].matchAll(URL_IN_CSS_RE)) {
      if (!url[2].startsWith('data:')) fontUrls.add(url[2]);
    }
  }

  const dataUrls = new Map<string, string>();
  await Promise.all(
    Array.from(fontUrls, async (url) => {
      dataUrls.set(
        url,
        resolveFont
          ? await resolveFont(url)
          : await readAsDataUrl(new URL(url, document.baseURI).href, mimeTypeForFont(url)),
      );
    }),
  );

  return css.replace(FONT_FACE_BLOCK_RE, (block) =>
    block.replace(URL_IN_CSS_RE, (whole, _quote, url: string) => {
      const dataUrl = dataUrls.get(url);
      return dataUrl ? `url("${dataUrl}")` : whole;
    }),
  );
}

/** Read a file the renderer can already load, as a data URL. */
async function readAsDataUrl(absoluteUrl: string, mime: string): Promise<string> {
  return `data:${mime};base64,${await readAsBase64(absoluteUrl)}`;
}

/**
 * Read one of the app's own files as base64.
 *
 * Dev server: plain `fetch` (http). Packaged build: `file://`, where Chromium
 * blocks fetch — and where the bytes live inside app.asar, which the Rust
 * sidecar cannot read either. That case goes to the main process.
 */
async function readAsBase64(absoluteUrl: string): Promise<string> {
  if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
    const buffer = await (await fetch(absoluteUrl)).arrayBuffer();
    return bytesToBase64(new Uint8Array(buffer));
  }
  return native().appFileBase64(absoluteUrl);
}

function mimeTypeForFont(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}
