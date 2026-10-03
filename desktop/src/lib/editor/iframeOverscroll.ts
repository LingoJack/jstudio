/**
 * iframeOverscroll - 阻止 iframe 预览的滚动泄漏到宿主页面。
 *
 * 现象：iframe 内部文档滚到底/顶后继续滚动，默认会把滚动"链"（scroll
 * chaining）到父框架，导致整个编辑器页面跟着滚。
 *
 * 原理：在 iframe 文档的根滚动器（<html>/<body>）上设置
 * `overscroll-behavior: contain`，滚动到达边界后即被截断在 iframe 内，
 * 不影响 iframe 内部的正常滚动。iframe 的 srcdoc/src 每次变更都会重新
 * 触发 load，监听器挂在 iframe 元素上因此每次重载后都会重新应用。
 */

export function preventIframeScrollChaining(iframe: HTMLIFrameElement): void {
  const apply = () => {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.documentElement.style.overscrollBehavior = "contain";
      if (doc.body) doc.body.style.overscrollBehavior = "contain";
    } catch {
      // 未授予 same-origin 的文档无法访问内部样式 —— 静默降级（行为同旧版）
    }
  };
  iframe.addEventListener("load", apply);
  // 若调用时文档已完成加载（load 不再触发），立即补一次。
  apply();
}
