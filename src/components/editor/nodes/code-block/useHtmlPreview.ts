/**
 * useHtmlPreview - 从 CodeBlockView 提取的 HTML iframe 预览逻辑。
 *
 * 职责：
 *   - 通过原生 DOM 创建/更新/销毁 sandboxed iframe（React 19 sandbox workaround）
 *   - 在 collapsed / showHtmlPreview / htmlSource 变化时同步 iframe 生命周期
 *   - 暴露 previewContainerRef 供 JSX 渲染容器
 *
 * 注意：iframe 通过 document.createElement 创建，React 不参与其 reconciliation，
 * 从而避免 dev 模式下访问 sandboxed iframe 内部 DOM 触发 SecurityError。
 */

import { useEffect, useRef } from "react";
import { useI18n } from "../../../../lib/core/i18n";

export interface UseHtmlPreviewParams {
  showHtmlPreview: boolean;
  htmlSource: string;
  collapsed: boolean;
}

export function useHtmlPreview({
  showHtmlPreview,
  htmlSource,
  collapsed,
}: UseHtmlPreviewParams) {
  const { t } = useI18n();
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // ── Native DOM iframe management (React 19 sandbox workaround) ──
  // React 19's development-mode reconciliation traverses DOM trees including
  // sandboxed iframes, triggering SecurityError: Sandbox access violation.
  // We render the iframe via native DOM so React never sees its internals.
  useEffect(() => {
    const container = previewContainerRef.current;
    // When collapsed, the preview container is unmounted - drop the iframe
    // so we don't keep a detached iframe (and its srcdoc) around.
    if (collapsed && iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
      return;
    }
    // If preview is hidden (or content emptied), remove the iframe before
    // the early return below - the container may have already unmounted,
    // leaving a dangling ref to a detached iframe.
    if (!showHtmlPreview && iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }
    if (!container) return;

    // If preview should be shown and iframe doesn't exist yet, create it.
    if (showHtmlPreview && !iframeRef.current) {
      const iframe = document.createElement("iframe");
      iframe.className = "code-html-preview";
      iframe.title = t("code.previewHtml");
      iframe.sandbox.add(
        "allow-scripts",
        "allow-forms",
        "allow-popups",
        "allow-modals",
        "allow-same-origin",
      );
      iframe.srcdoc = htmlSource;
      container.appendChild(iframe);
      iframeRef.current = iframe;
    }

    // Update srcdoc when htmlSource changes (only if iframe exists).
    if (
      showHtmlPreview &&
      iframeRef.current &&
      iframeRef.current.srcdoc !== htmlSource
    ) {
      iframeRef.current.srcdoc = htmlSource;
    }
  }, [showHtmlPreview, htmlSource, collapsed, t]);

  return { previewContainerRef };
}
