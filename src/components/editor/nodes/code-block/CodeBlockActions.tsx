/**
 * CodeBlockActions - 从 CodeBlockView 提取的代码块操作按钮组。
 *
 * 渲染 collapse 切换、HTML/Mermaid 预览切换、新窗口打开、复制按钮。
 * `copied` state 完全内聚于此组件，无需外部传入。
 *
 * 参照 LanguageDropdown 的 props 风格：接收 t 翻译函数。
 */

import { useCallback, useState } from "react";
import type { TranslationKey } from "../../../../lib/core/i18n";
import {
  ChevronRight,
  Code2,
  Eye,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

export interface CodeBlockActionsProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isHtml: boolean;
  isMermaid: boolean;
  hasContent: boolean;
  showHtmlPreview: boolean;
  showMermaidPreview: boolean;
  mermaidSvg: string | null;
  onToggleHtmlPreview: () => void;
  onToggleMermaidPreview: () => void;
  onOpenHtmlWindow: () => void;
  onOpenMermaidWindow: () => void;
  getCodeText: () => string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export function CodeBlockActions({
  collapsed,
  onToggleCollapsed,
  isHtml,
  isMermaid,
  hasContent,
  showHtmlPreview,
  showMermaidPreview,
  mermaidSvg,
  onToggleHtmlPreview,
  onToggleMermaidPreview,
  onOpenHtmlWindow,
  onOpenMermaidWindow,
  getCodeText,
  t,
}: CodeBlockActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = getCodeText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [getCodeText]);

  return (
    <>
      {/* Collapse toggle */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal code-collapse-toggle"
        title={collapsed ? t("code.expand") : t("code.collapse")}
        aria-label={collapsed ? t("code.expand") : t("code.collapse")}
        aria-expanded={!collapsed}
      >
        <ChevronRight
          size={14}
          className={`code-collapse-chevron ${collapsed ? "" : "is-open"}`}
        />
      </button>

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

      {/* Open in new window */}
      {isHtml && hasContent ? (
        <button
          type="button"
          onClick={onOpenHtmlWindow}
          className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal"
          title={t("code.previewNewWindow")}
          aria-label={t("code.previewNewWindow")}
        >
          <ExternalLink size={14} />
        </button>
      ) : isMermaid && hasContent && mermaidSvg ? (
        <button
          type="button"
          onClick={onOpenMermaidWindow}
          className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal"
          title={t("code.previewNewWindow")}
          aria-label={t("code.previewNewWindow")}
        >
          <ExternalLink size={14} />
        </button>
      ) : null}

      {/* Copy */}
      {hasContent ? (
        <button
          type="button"
          onClick={handleCopy}
          className="editor-toolbar-btn block-toolbar-btn block-toolbar-btn--sm code-toolbar-reveal"
          title={t("code.copy")}
          aria-label={t("code.copy")}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      ) : null}
    </>
  );
}
