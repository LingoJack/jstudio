import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { buildMermaidConfig } from "./mermaidConfig";
function useMermaidPreview({
  isDarkMode,
  showMermaidPreview,
  mermaidSource
}) {
  const [mermaidSvg, setMermaidSvg] = useState(null);
  const [mermaidError, setMermaidError] = useState(null);
  const mermaidPreviewRef = useRef(null);
  useEffect(() => {
    mermaid.initialize(buildMermaidConfig(isDarkMode));
  }, [isDarkMode]);
  useEffect(() => {
    if (!showMermaidPreview || !mermaidSource.trim()) {
      setMermaidSvg(null);
      setMermaidError(null);
      return;
    }
    const renderMermaid = async () => {
      try {
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidSource);
        setMermaidSvg(svg);
        setMermaidError(null);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setMermaidError(errorMsg);
        setMermaidSvg(null);
      }
    };
    renderMermaid();
  }, [showMermaidPreview, mermaidSource, isDarkMode]);
  return { mermaidSvg, mermaidError, mermaidPreviewRef };
}
export {
  useMermaidPreview
};
