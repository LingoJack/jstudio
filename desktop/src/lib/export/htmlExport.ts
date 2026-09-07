/**
 * Single-file HTML export.
 *
 * Produces one `.html` file that renders a document on its own: no asset
 * folder, no external CSS, no network.
 *
 * How fidelity is achieved: the document is mounted into an offscreen editor
 * built with the *real* editor extensions, and the export clones what the
 * editor actually painted — node views and all. Model serialization
 * (`editor.getHTML()`) cannot do this: React node views (tables, code chrome,
 * collapsible, image figures, diagram canvases, KaTeX) render their structure
 * and their grid lines / gutters / canvases only in the DOM.
 *
 * On top of the clone:
 *   - styles: every stylesheet the app loaded, the current theme's computed
 *     CSS variables, and every `@font-face` payload as base64
 *   - assets: `blob:` images (how an open document displays them) become
 *     `data:` URLs
 *   - interaction: collapsible / collapsed blocks are rebuilt as native
 *     `<details>`, so folding works in any browser with no script at all
 *
 * See `htmlExportStyles.ts` (styles) and `htmlExportBlocks.ts` (fallbacks).
 */

import { Editor } from '@tiptap/core';

import type { Block, Document } from '../../types';
import type { ViewerPayload } from '../../viewer/viewerPayload';
import { createSectionExtensions } from '../../components/editor/sectionEditor/extensions';
import { logger } from '../core/logger';
import { fitTiptapJSON } from '../editor/schemaFit';
import { splitIntoSections } from '../editor/sectioning';
import { ourBlocksToTiptapJSON } from '../editor/tiptapAdapter';
import { bytesToBase64, bytesToDataUrl } from './base64';
import { escapeHtml, renderDiagramSvg } from './htmlExportBlocks';
import { native } from '../core/tauriShim/native';
import {
  collectAppCss,
  collectComputedThemeVariables,
  inlineFontFaces,
  readAppRelativeText,
} from './htmlExportStyles';

/** Width of the offscreen editor used to render the document. */
const OFFSCREEN_WIDTH = 900;

/** How long to wait for images / diagram canvases to finish rendering. */
const RENDER_TIMEOUT_MS = 5000;

/** Below this the stylesheet capture has clearly failed — warn, don't export blind. */
const CSS_SIZE_WARNING_THRESHOLD = 10_000;

/** Where `vite.viewer.config.ts` emits the standalone viewer bundle. */
const VIEWER_DIRECTORY = 'dist-viewer';
const VIEWER_JS_PATH = `${VIEWER_DIRECTORY}/viewer.js`;
const VIEWER_CSS_PATH = `${VIEWER_DIRECTORY}/viewer.css`;

/** Dev-server artifact that must never reach an exported file. */
const VITE_CLIENT_MARKER = '/@vite/client';

/** Build a data URL from an app-relative file (webfonts of the viewer CSS). */
async function readAsDataUrlFromApp(relativePath: string, mime: string): Promise<string> {
  const base64 = await native().appFileBase64(relativePath);
  return `data:${mime};base64,${base64}`;
}

function mimeTypeForFont(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

/** Classes of elements that are editor UI, not document content. */
const UI_ELEMENT_SELECTOR =
  '.ProseMirror-gapcursor, .ProseMirror-dropcursor, .ProseMirror-widget, [data-export-remove]';

/**
 * The only script the export carries.
 *
 * Folding is native (`<details>`), so this just re-implements the copy
 * buttons the React node views own in the app: copy the block's text and
 * flash the button's checked state.
 */
const EXPORT_SCRIPT = `
<script>
document.addEventListener('click', function (event) {
  var button = event.target.closest('[data-code-action="copy"]');
  if (!button) return;
  // The button lives inside a <summary> of a folded block — don't fold it.
  event.preventDefault();
  event.stopPropagation();
  var block = button.closest('.code-block-figure, details');
  if (!block) return;
  var text;
  if (block.tagName === 'DETAILS') {
    text = Array.prototype.slice.call(block.children)
      .filter(function (child) { return child.tagName !== 'SUMMARY'; })
      .map(function (child) { return child.textContent; })
      .join('\\n');
  } else {
    var source = block.querySelector('.code-block-body, .hljs');
    text = source ? source.textContent : block.textContent;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text || '').then(function () {
      button.classList.add('is-copied');
      setTimeout(function () { button.classList.remove('is-copied'); }, 1200);
    });
  }
});
</script>
`;

/** Extra rules on top of the app CSS: page frame + export-only elements. */
const EXPORT_CSS = `
html.jstudio-html-export, body.jstudio-html-export {
  margin: 0;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--jstudio-font-family);
  font-size: var(--jstudio-font-size);
  line-height: var(--jstudio-line-height);
}
.jstudio-html-export img { max-width: 100%; }
.jstudio-html-export details > summary {
  cursor: default;
  list-style: none;
}
.jstudio-html-export details > summary::-webkit-details-marker { display: none; }
.jstudio-html-export [data-code-action="copy"].is-copied { color: var(--vscode-focusBorder); }
.jstudio-html-export-placeholder {
  padding: 8px 12px;
  border: 1px dashed var(--vscode-input-border);
  border-radius: 16px;
  opacity: 0.7;
}
`;

export interface HtmlExportOptions {
  /** Data root, used to resolve `assets/…` references. */
  studioRoot: string;
  /** Theme at export time — the exported page has no settings to read. */
  dark: boolean;
  language: 'zh' | 'en';
}

/**
 * Build the complete HTML file for `doc`.
 *
 * Preferred output boots the standalone viewer bundle (`dist-viewer/viewer.js`,
 * built by vite.viewer.config.ts) — a real React app rendering the document
 * with the editor's own components, so folding, copy buttons and every other
 * node-view interaction keep working. When that bundle isn't available (it is
 * a build artefact), the export falls back to a frozen snapshot of the same
 * DOM rendered offscreen: complete, but without live interactions.
 */
export async function buildDocumentHtml(
  doc: Document,
  options: HtmlExportOptions,
): Promise<string> {
  const payload: ViewerPayload = {
    doc: { id: doc.id, title: doc.title ?? '' },
    blocks: doc.blocks ?? [],
    dark: options.dark,
    language: options.language,
    assets: await collectAssets(doc.blocks ?? [], options.studioRoot, doc.id),
  };
  const bundle = await loadViewerBundle();
  if (bundle) {
    return assembleViewerDocument(payload, bundle, options.dark);
  }

  const bodyHtml = await renderBody(doc, options.studioRoot);
  const css = await buildStyleSheet();
  const isDark = options.dark;

  const title = escapeHtml(doc.title?.trim() || 'Untitled');
  return `<!DOCTYPE html>
<html lang="zh-CN" class="jstudio-html-export${isDark ? ' dark' : ''}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
${css}
</style>
</head>
<body class="jstudio-html-export">
<div class="editor-scroll-container">
<div class="px-4 md:px-12 lg:px-20 pb-4"><h1 class="text-4xl font-bold text-[var(--vscode-editor-foreground)] pb-1">${title}</h1></div>
<div class="tiptap-editor-container relative">
<div class="ProseMirror max-w-none focus:outline-none px-4 md:px-12 lg:px-20">${bodyHtml}</div>
</div>
</div>
${EXPORT_SCRIPT}
</body>
</html>
`;
}

/**
 * Load the viewer bundle the export boots.
 *
 * Dev: Vite serves `dist-viewer/` from the project root. Packaged: it sits
 * next to `dist/`, inside app.asar, and is read by the main process.
 */
async function loadViewerBundle(): Promise<{ js: string; css: string } | null> {
  try {
    const [js, css] = await Promise.all([
      readAppRelativeText(VIEWER_JS_PATH),
      readAppRelativeText(VIEWER_CSS_PATH),
    ]);
    // A dev-server-transformed bundle would drag `/@vite/client` into the
    // export (blocked by CORS in a file:// page). Refuse it and let the
    // caller fall back to the frozen-DOM export.
    if (js.includes(VITE_CLIENT_MARKER)) return null;
    return { js, css };
  } catch {
    return null;
  }
}

function assembleViewerDocument(
  payload: ViewerPayload,
  bundle: { js: string; css: string },
  dark: boolean,
): Promise<string> {
  // The viewer CSS references its webfonts relatively (`viewer5.ttf`); they
  // live next to it in `dist-viewer/`, so resolve them there via the same
  // main-process read.
  return inlineFontFaces(
    `${bundle.css}\n${collectComputedThemeVariables(bundle.css)}`,
    (url) =>
      readAsDataUrlFromApp(
        `${VIEWER_DIRECTORY}/${url.replace(/^\.\//, '')}`,
        mimeTypeForFont(url),
      ),
  ).then((css) => {
    const title = escapeHtml(payload.doc.title.trim() || 'Untitled');
    const darkClass = dark ? ' dark' : '';
    // `</script` inside an inline script (or the JSON island) would end the
    // tag early — escape it in both payloads.
    const data = JSON.stringify(payload).replace(/<\//g, '<\\/');
    const script = bundle.js.replace(/<\/script/gi, '<\\/script');
    return `<!DOCTYPE html>
<html lang="${payload.language}" class="jstudio-html-export${darkClass}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
${css}
${EXPORT_CSS}
</style>
</head>
<body class="jstudio-html-export">
<div id="viewer-root"></div>
<script type="application/json" id="jstudio-viewer-data">${data}</script>
<script type="module">${script}</script>
</body>
</html>
`;
  });
}

/**
 * Read every asset the document references as base64, so the exported file
 * needs neither the sidecar nor the document's `assets/` folder.
 */
async function collectAssets(
  blocks: Block[],
  studioRoot: string,
  docId: string,
): Promise<Record<string, string>> {
  const refs = new Set<string>();
  for (const match of JSON.stringify(blocks).matchAll(/"(assets\/[^"\\]+)"/g)) {
    refs.add(match[1]);
  }
  if (refs.size === 0 || !studioRoot || !docId) return {};

  const { ipc } = await import('../core/ipc');
  const { resolveAssetFilePath } = await import('../editor/content/assetUrl');
  const assets: Record<string, string> = {};
  await Promise.all(
    Array.from(refs, async (relPath) => {
      try {
        const bytes = await ipc.readFileBytes(resolveAssetFilePath(studioRoot, docId, relPath));
        assets[relPath] = bytesToBase64(new Uint8Array(bytes));
      } catch {
        // A missing asset simply stays unresolved in the exported file.
      }
    }),
  );
  return assets;
}

/** App CSS + current theme variables + inlined webfonts + export-only rules. */
async function buildStyleSheet(): Promise<string> {
  const appCss = await collectAppCss();
  if (appCss.length < CSS_SIZE_WARNING_THRESHOLD) {
    logger.warn('export', `html export captured only ${appCss.length} bytes of CSS`);
  }
  const themed = `${appCss}\n${collectComputedThemeVariables(appCss)}`;
  const withFonts = await inlineFontFaces(themed);
  return `${withFonts}\n${EXPORT_CSS}`;
}

/**
 * Render the document in an offscreen editor and return the painted DOM.
 *
 * The editor is created with `element` (not headless) precisely so React node
 * views mount — that is where tables, code chrome, collapsibles, diagram
 * canvases and KaTeX live.
 */
async function renderBody(doc: Document, studioRoot: string): Promise<string> {
  // One editor per section, mirroring the app: a single editor holding a very
  // long document has to build every node view at once and can hang the
  // export (and the browser opening the result) outright.
  const sections = splitIntoSections(doc.blocks ?? []);
  const parts: string[] = [];
  for (const section of sections) {
    parts.push(await renderSection(section.blocks, studioRoot, doc.id));
  }
  return parts.join('\n');
}

async function renderSection(blocks: Block[], studioRoot: string, docId: string): Promise<string> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${OFFSCREEN_WIDTH}px;visibility:hidden;`;
  document.body.appendChild(host);

  const editor = new Editor({
    element: host,
    extensions: createSectionExtensions({ placeholder: '' }),
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: false,
  });

  try {
    const json = ourBlocksToTiptapJSON(blocks);
    editor.commands.setContent(fitTiptapJSON({ type: 'doc', content: json }, editor.schema));
    await waitForNodeViews(editor.view.dom);

    const clone = editor.view.dom.cloneNode(true) as HTMLElement;
    await inlineAssets(clone, studioRoot, docId);
    cleanClone(clone);
    await fillUnrenderedDiagrams(clone);
    return clone.innerHTML;
  } finally {
    editor.destroy();
    host.remove();
  }
}

/**
 * Wait until the offscreen render is complete: every image has a source (the
 * asset resolver fills them asynchronously) and every diagram canvas has been
 * drawn by maxGraph.
 */
async function waitForNodeViews(dom: HTMLElement): Promise<void> {
  const deadline = Date.now() + RENDER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const images = Array.from(dom.querySelectorAll('img'));
    const diagrams = Array.from(dom.querySelectorAll('.diagram-block-canvas'));
    const imagesReady = images.every((img) => (img.getAttribute('src') ?? '').length > 0);
    const diagramsReady = diagrams.every((canvas) => canvas.querySelector('svg'));
    if (imagesReady && diagramsReady) return;
  }
}

/** Replace `blob:` / doc-relative asset sources with inline data URLs. */
async function inlineAssets(clone: HTMLElement, studioRoot: string, docId: string): Promise<void> {
  const sources = Array.from(
    clone.querySelectorAll('img[src], [data-src], source[src], video[src], audio[src]'),
  );
  for (const el of sources) {
    const attr = el.hasAttribute('src') ? 'src' : 'data-src';
    const value = el.getAttribute(attr) ?? '';
    if (!value || value.startsWith('data:')) continue;
    if (value.startsWith('blob:')) {
      const response = await fetch(value);
      el.setAttribute(attr, bytesToDataUrl(new Uint8Array(await response.arrayBuffer()), 'application/octet-stream'));
      continue;
    }
    // Doc-relative paths (`assets/…`) are written out by the block adapter;
    // they resolve through the sidecar, not the renderer.
    if (value.startsWith('assets/') && studioRoot && docId) {
      const { ipc } = await import('../core/ipc');
      const { resolveAssetFilePath } = await import('../editor/content/assetUrl');
      const { getExtension, getMimeType } = await import('../editor/fileUtils');
      try {
        const bytes = await ipc.readFileBytes(resolveAssetFilePath(studioRoot, docId, value));
        el.setAttribute(attr, bytesToDataUrl(new Uint8Array(bytes), getMimeType(getExtension(value))));
      } catch {
        // Leave the reference as-is; a missing asset stays visible as such.
      }
    }
  }
}

/** Strip editor affordances and rebuild foldable blocks as native `<details>`. */
function cleanClone(clone: HTMLElement): void {
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  clone.querySelectorAll('[data-placeholder]').forEach((el) => el.removeAttribute('data-placeholder'));
  clone.querySelectorAll(UI_ELEMENT_SELECTOR).forEach((el) => el.remove());

  // The chevron lives inside a <button> in the app; keep the icon, drop the
  // button (<details> handles the click on the whole summary anyway).
  clone.querySelectorAll('button.code-collapse-toggle').forEach((btn) => {
    const span = document.createElement('span');
    span.className = btn.className;
    span.append(...Array.from(btn.childNodes));
    btn.replaceWith(span);
  });

  makeFoldableNative(clone, '.collapsible-block-figure', '.collapsible-block-header');
  makeFoldableNative(clone, '.code-block-figure.is-collapsed', '.code-block-header');

  // Inputs can carry real content (the collapsible summary, a code block
  // title), so flatten them to text rather than dropping them.
  clone.querySelectorAll('input').forEach((el) => {
    const span = document.createElement('span');
    span.textContent = (el as HTMLInputElement).value;
    el.replaceWith(span);
  });
  clone.querySelectorAll('textarea').forEach((el) => {
    const span = document.createElement('span');
    span.textContent = (el as HTMLTextAreaElement).value;
    el.replaceWith(span);
  });
  // Remaining controls (language pickers, toolbars, "open in new window")
  // are editor UI — dead weight in a document. Copy buttons keep working:
  // the trailing inline script re-implements them.
  clone
    .querySelectorAll('button:not([data-code-action="copy"]), select')
    .forEach((el) => el.remove());
}

/**
 * Rebuild a block the app folds with React state into `<details>` / `<summary>`,
 * so folding works in the exported file without any script.
 */
function makeFoldableNative(root: HTMLElement, figureSelector: string, headerSelector: string): void {
  for (const figure of Array.from(root.querySelectorAll(figureSelector))) {
    const header = figure.querySelector(headerSelector);
    if (!header) continue;
    const content = Array.from(figure.children).find((child) => child !== header);
    if (!content) continue;

    const details = document.createElement('details');
    if (!figure.classList.contains('is-collapsed')) details.open = true;
    const summary = document.createElement('summary');
    summary.append(...Array.from(header.childNodes).map((node) => node.cloneNode(true)));
    details.appendChild(summary);
    details.appendChild(content.cloneNode(true));
    figure.replaceWith(details);
  }
}

/** Diagram canvases that never drew (timeout) get a rendered SVG or a marker. */
async function fillUnrenderedDiagrams(clone: HTMLElement): Promise<void> {
  const dark = document.documentElement.classList.contains('dark');
  for (const canvas of Array.from(clone.querySelectorAll('.diagram-block-canvas'))) {
    if (canvas.querySelector('svg')) continue;
    const figure = canvas.closest('[data-type="diagram-block"]');
    const snapshot = figure?.getAttribute('data-snapshot') ?? '';
    const svg = await renderDiagramSvg(snapshot, dark);
    const box = document.createElement('div');
    box.className = 'jstudio-html-export-placeholder';
    box.innerHTML = svg ?? '图表';
    canvas.replaceChildren(box);
  }
}
