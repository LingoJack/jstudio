/**
 * previewIframeWiring — 每个 sandboxed 预览 <iframe> 都需要的宿主侧装配。
 *
 * 关闭预览 iframe 的两种失控路径：
 *
 *  1. 滚动链（scroll chaining）：预览内部滚动器到达边界后，剩余的滚动量会
 *     交给宿主页面 —— 在预览里持续滚动会把整个编辑器页面带走。
 *  2. 自导航（self-navigation）：预览页里点击任何非 `#锚点` 链接都会把
 *     iframe 导航走。相对 href 会继承宿主页面的 base URL，例如
 *     `href="./other.html"` 会解析到应用自身 bundle 上 —— 应用随即在
 *     sandboxed iframe 内启动，而 Electron preload 不注入子框架
 *     （nodeIntegrationInSubFrames 默认关闭），首次访问
 *     `window.jstudioNative` 即抛 "[platform] window.jstudioNative missing"。
 *
 * 两者的修复都在宿主侧、每次文档加载后应用：iframe 文档根滚动器设
 * `overscroll-behavior: contain`；并在 iframe 文档上挂委托 click 监听，
 * 放行页内锚点、把绝对链接交给系统浏览器（shell.openExternal），
 * 其余一律阻止 iframe 导航。
 */

import { openUrl } from '../platform';

/** 永远不能交给 shell.openExternal 的 scheme。 */
const BLOCKED_SCHEMES = new Set(['javascript', 'data', 'blob', 'about', 'file']);

export function wirePreviewIframe(iframe: HTMLIFrameElement): void {
  const onLoad = () => {
    containOverscroll(iframe);
    guardLinkClicks(iframe);
  };
  // srcdoc/src 每次变更都会换新文档；监听器挂在 iframe 元素上，
  // 因此每次重载后的新文档都会重新装配。
  iframe.addEventListener('load', onLoad);
  // 调用时文档可能已加载完成（load 不再触发）—— 立即补一次。
  onLoad();
}

/** 预览滚到边界后截断，不把滚动链到宿主页面。 */
function containOverscroll(iframe: HTMLIFrameElement): void {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.documentElement.style.overscrollBehavior = 'contain';
    if (doc.body) doc.body.style.overscrollBehavior = 'contain';
  } catch {
    // 不可同源访问的文档 —— 静默降级（行为同未装配）。
  }
}

/**
 * 委托拦截 iframe 内的链接点击：
 *   `#…`      → 保留默认的页内锚点滚动
 *   绝对链接  → preventDefault + 系统浏览器打开
 *   其余      → 仅 preventDefault（相对链接解析到宿主 base URL 上毫无意义）
 */
function guardLinkClicks(iframe: HTMLIFrameElement): void {
  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    return;
  }
  if (!doc) return;
  doc.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    const link = target?.closest?.('a');
    if (!link) return;
    const href = link.getAttribute('href');
    // 页内锚点 —— 保持默认的同文档滚动。
    if (href && href.startsWith('#')) return;
    // 其余一律不允许 iframe 导航（见文件头第 2 点）。
    event.preventDefault();
    const scheme = href?.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme && !BLOCKED_SCHEMES.has(scheme)) {
      openUrl(href!).catch(() => {});
    }
  });
}
