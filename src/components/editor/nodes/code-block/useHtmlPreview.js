import { useEffect, useRef } from "react";
import { useI18n } from "../../../../lib/core/i18n";
function useHtmlPreview({
  showHtmlPreview,
  htmlSource,
  collapsed
}) {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const previewContainerRef = useRef(null);
  const iframeRef = useRef(null);
  useEffect(() => {
    const container = previewContainerRef.current;
    if (collapsed && iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
      return;
    }
    if (!showHtmlPreview && iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }
    if (!container) return;
    if (showHtmlPreview && !iframeRef.current) {
      const iframe = document.createElement("iframe");
      iframe.className = "code-html-preview";
      iframe.title = tRef.current("code.previewHtml");
      iframe.sandbox.add(
        "allow-scripts",
        "allow-forms",
        "allow-popups",
        "allow-modals",
        "allow-same-origin"
      );
      iframe.srcdoc = htmlSource;
      container.appendChild(iframe);
      iframeRef.current = iframe;
    }
    if (showHtmlPreview && iframeRef.current && iframeRef.current.srcdoc !== htmlSource) {
      iframeRef.current.srcdoc = htmlSource;
    }
  }, [showHtmlPreview, htmlSource, collapsed]);
  return { previewContainerRef };
}
export {
  useHtmlPreview
};
