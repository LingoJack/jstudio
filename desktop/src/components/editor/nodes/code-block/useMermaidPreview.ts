/**
 * useMermaidPreview - 从 CodeBlockView 提取的 Mermaid 实时预览逻辑。
 *
 * 职责：
 *   - 在 darkMode 切换时重新初始化 mermaid 全局配置
 *   - 在 showMermaidPreview / mermaidSource 变化时异步渲染 SVG
 *   - 暴露 mermaidSvg / mermaidError / mermaidPreviewRef 供组件渲染
 *
 * 依赖项均为原始值，不引入额外渲染周期。
 */

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import type { MermaidConfig } from "mermaid";
import { buildMermaidConfig } from "./mermaidConfig";
import { fixSequenceLifelines } from "./mermaidLifelineFix";

export interface UseMermaidPreviewParams {
  isDarkMode: boolean;
  showMermaidPreview: boolean;
  mermaidSource: string;
}

export function useMermaidPreview({
  isDarkMode,
  showMermaidPreview,
  mermaidSource,
}: UseMermaidPreviewParams) {
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [mermaidError, setMermaidError] = useState<string | null>(null);
  const mermaidPreviewRef = useRef<HTMLDivElement>(null);

  // Initialize mermaid with high-quality rendering settings. Re-runs when the
  // app toggles dark mode so the global mermaid config picks up the new
  // themeVariables before the render effect below regenerates the SVG.
  useEffect(() => {
    mermaid.initialize(buildMermaidConfig(isDarkMode) as MermaidConfig);
  }, [isDarkMode]);

  // Render mermaid diagram when preview is shown
  useEffect(() => {
    if (!showMermaidPreview || !mermaidSource.trim()) {
      setMermaidSvg(null);
      setMermaidError(null);
      return;
    }

    // Out-of-order guard: fast typing can start overlapping renders.
    let cancelled = false;

    const renderMermaid = async () => {
      try {
        // Date.now() alone collides when two renders start within the same
        // millisecond (StrictMode double-invoke, fast typing) - mermaid
        // injects temp elements keyed by this id.
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await mermaid.render(id, mermaidSource);
        if (cancelled) return;
        // mermaid hardcodes sequence lifelines to a 2000-unit length; extend
        // them on taller diagrams (no-op otherwise, see mermaidLifelineFix).
        setMermaidSvg(fixSequenceLifelines(svg));
        setMermaidError(null);
      } catch (err) {
        if (cancelled) return;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setMermaidError(errorMsg);
        setMermaidSvg(null);
      }
    };

    renderMermaid();
    return () => {
      cancelled = true;
    };
  }, [showMermaidPreview, mermaidSource, isDarkMode]);

  return { mermaidSvg, mermaidError, mermaidPreviewRef };
}
