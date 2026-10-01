/**
 * CodeBlockActions - 从 CodeBlockView 提取的代码块操作按钮组。
 *
 * 渲染 HTML/Mermaid 预览切换、新窗口打开、复制按钮（折叠切换已移回
 * CodeBlockView，与标题一起排在胶囊右侧的"块管理"分组）。
 * `copied` state 完全内聚于此组件，无需外部传入。
 *
 * 参照 LanguageDropdown 的 props 风格：接收 t 翻译函数。
 */

import { useCallback, useState } from "react";
import type { TranslationKey } from "../../../../lib/core/i18n";
import { useStore } from "../../../../store/useStore";
import { copyMermaidPngToClipboard } from "./mermaidImageClipboard";
import {
  Code2,
  Eye,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

export interface CodeBlockActionsProps {
  isHtml: boolean;
  isMermaid: boolean;
  isSvg: boolean;
  hasContent: boolean;
  showHtmlPreview: boolean;
  showMermaidPreview: boolean;
  showSvgPreview: boolean;
  mermaidSvg: string | null;
  onToggleHtmlPreview: () => void;
  onToggleMermaidPreview: () => void;
  onToggleSvgPreview: () => void;
  onOpenHtmlWindow: () => void;
  onOpenMermaidWindow: () => void;
  onOpenSvgWindow: () => void;
  getCodeText: () => string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export function CodeBlockActions({
  isHtml,
  isMermaid,
  isSvg,
  hasContent,
  showHtmlPreview,
  showMermaidPreview,
  showSvgPreview,
  mermaidSvg,
  onToggleHtmlPreview,
  onToggleMermaidPreview,
  onToggleSvgPreview,
  onOpenHtmlWindow,
  onOpenMermaidWindow,
  onOpenSvgWindow,
  getCodeText,
  t,
}: CodeBlockActionsProps) {
  const [copied, setCopied] = useState(false);
  // Subscribe to the primitives (per CODEBUDDY.md gotcha — never object refs).
  const isDarkMode = useStore((s) => s.isDarkMode);
  const addToast = useStore((s) => s.addToast);

  // Diagram rendered → the copy button hands out the picture, not the source.
  const showDiagram = isMermaid && showMermaidPreview && !!mermaidSvg;

  const handleCopy = useCallback(() => {
    if (showDiagram && mermaidSvg) {
      // 复制为图片：源码一并传入 —— 内部会用 htmlLabels:false 重渲染一份
      // 无 foreignObject 的 SVG（WebKit 画布对含 foreignObject 的 SVG 会
      // 标记污染，toBlob 抛 SecurityError）。
      copyMermaidPngToClipboard(
        mermaidSvg,
        getCodeText(),
        isDarkMode ? "#1e1e1e" : "#ffffff",
        isDarkMode,
      )
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => addToast("error", t("code.copyImageFailed")));
      return;
    }
    const text = getCodeText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [showDiagram, mermaidSvg, isDarkMode, addToast, t, getCodeText]);

  return (
    <>
      {/* HTML preview toggle */}
      {isHtml && hasContent ? (
        <button
          type="button"
          onClick={onToggleHtmlPreview}
          className={`editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm ${showHtmlPreview ? "is-active" : ""}`}
          title={showHtmlPreview ? t("code.showCode") : t("code.previewHtml")}
          aria-label={
            showHtmlPreview ? t("code.showCode") : t("code.previewHtml")
          }
        >
          {showHtmlPreview ? <Code2 size={14} /> : <Eye size={14} />}
        </button>
      ) : null}

      {/* Mermaid preview toggle */}
      {isMermaid && hasContent ? (
        <button
          type="button"
          onClick={onToggleMermaidPreview}
          className={`editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm ${showMermaidPreview ? "is-active" : ""}`}
          title={
            showMermaidPreview ? t("code.showCode") : t("code.previewMermaid")
          }
          aria-label={
            showMermaidPreview ? t("code.showCode") : t("code.previewMermaid")
          }
        >
          {showMermaidPreview ? <Code2 size={14} /> : <Eye size={14} />}
        </button>
      ) : null}

      {/* SVG preview toggle */}
      {isSvg && hasContent ? (
        <button
          type="button"
          onClick={onToggleSvgPreview}
          className={`editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm ${showSvgPreview ? "is-active" : ""}`}
          title={showSvgPreview ? t("code.showCode") : t("code.previewSvg")}
          aria-label={showSvgPreview ? t("code.showCode") : t("code.previewSvg")}
        >
          {showSvgPreview ? <Code2 size={14} /> : <Eye size={14} />}
        </button>
      ) : null}

      {/* Open in new window */}
      {isHtml && hasContent ? (
        <button
          type="button"
          onClick={onOpenHtmlWindow}
          className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm"
          title={t("code.previewNewWindow")}
          aria-label={t("code.previewNewWindow")}
        >
          <ExternalLink size={14} />
        </button>
      ) : isSvg && hasContent ? (
        <button
          type="button"
          onClick={onOpenSvgWindow}
          className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm"
          title={t("code.previewNewWindow")}
          aria-label={t("code.previewNewWindow")}
        >
          <ExternalLink size={14} />
        </button>
      ) : isMermaid && hasContent && mermaidSvg ? (
        <button
          type="button"
          onClick={onOpenMermaidWindow}
          className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm"
          title={t("code.previewNewWindow")}
          aria-label={t("code.previewNewWindow")}
        >
          <ExternalLink size={14} />
        </button>
      ) : null}

      {/* Copy — code by default, the rendered diagram when it is showing */}
      {hasContent ? (
        <button
          type="button"
          onClick={handleCopy}
          className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm"
          title={showDiagram ? t("code.copyImage") : t("code.copy")}
          aria-label={showDiagram ? t("code.copyImage") : t("code.copy")}
          // The HTML export ships without React; its inline script finds the
          // copy button by this attribute and wires the same behaviour.
          data-code-action="copy"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      ) : null}
    </>
  );
}
