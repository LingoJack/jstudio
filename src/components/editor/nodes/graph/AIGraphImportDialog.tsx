/**
 * AIGraphImportDialog — AI 生成图表对话框
 *
 * 用户输入自然语言描述 → 调用配置的 LLM → 返回 jgraph JSON → 灌入画板。
 *
 * 同时提供「复制示例 Prompt」按钮，方便用户把 prompt 模板粘贴到外部 AI
 * （ChatGPT/Claude 网页版等）使用。
 *
 * 结构 1:1 模仿 MermaidImportDialog：portal + header + textarea + 错误区 + footer。
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, AlertCircle, ArrowRight, ClipboardCopy, Check } from 'lucide-react';
import { generateGraphFromAI, buildExamplePromptForClipboard } from '../../../../lib/editor/aiGraph';
import type { AiGraphErrorCode } from '../../../../lib/editor/aiGraph';
import { IconButton } from '../../../ui/IconButton';
import { useI18n } from '../../../../lib/core/i18n';
import { handleNativeSelectAll } from '../../../../lib/shortcuts/nativeSelectAll';
import type { TranslationKey } from '../../../../lib/core/i18n';

interface AIGraphImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** 生成成功后回调，传入 GraphSnapshot JSON 字符串 */
  onImport: (snapshotJson: string) => void;
}

export default function AIGraphImportDialog({
  open,
  onClose,
  onImport,
}: AIGraphImportDialogProps) {
  const { t } = useI18n();

  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // 打开时清空状态
  useEffect(() => {
    if (open) {
      setPrompt('');
      setError(null);
      setIsGenerating(false);
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildExamplePromptForClipboard());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板被拒绝（如非用户激活上下文）——静默忽略
    }
  };

  /** 把 errorCode + detail 映射到本地化文案。 */
  const formatError = (code: AiGraphErrorCode, detail?: string): string => {
    const key = code as TranslationKey;
    if (code === 'aiGraph.networkError' || code === 'aiGraph.validationError') {
      return t(key, { error: detail ?? '' });
    }
    return t(key);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(t('aiGraph.emptyPrompt'));
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateGraphFromAI(prompt);

      if (!result.success || !result.snapshot) {
        setError(
          result.errorCode
            ? formatError(result.errorCode, result.errorDetail)
            : t('aiGraph.generateError'),
        );
        setIsGenerating(false);
        return;
      }

      // 成功
      onImport(result.snapshot);
      onClose();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(t('aiGraph.networkError', { error: errorMessage }));
    } finally {
      setIsGenerating(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 animate-dialog-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-h-[80vh] flex flex-col rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl animate-dialog-panel-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--vscode-widget-border)]">
          <Sparkles className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
          <h2 className="flex-1 text-sm font-semibold text-[var(--vscode-foreground)]">
            {t('aiGraph.title')}
          </h2>
          <IconButton onClick={onClose} title={t('aiGraph.close')}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 说明 */}
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-3">
            {t('aiGraph.description')}
          </p>

          {/* 复制示例 Prompt 按钮 */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={handleCopyPrompt}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
              title={t('aiGraph.copyExamplePrompt')}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--vscode-testing-iconPassed)]" />
                  <span>{t('aiGraph.promptCopied')}</span>
                </>
              ) : (
                <>
                  <ClipboardCopy className="w-3.5 h-3.5" />
                  <span>{t('aiGraph.copyExamplePrompt')}</span>
                </>
              )}
            </button>
          </div>

          {/* 自然语言输入框 */}
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (handleNativeSelectAll(e)) return;
            }}
            placeholder={t('aiGraph.inputPlaceholder')}
            className="w-full h-[160px] px-3 py-2.5 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-sm text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)] resize-none focus:outline-none focus:border-[var(--vscode-focusBorder)]"
            spellCheck={false}
          />

          {/* 错误提示 */}
          {error && (
            <div className="flex items-start gap-2 mt-3 px-3 py-2 rounded-md bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-inputValidation-errorBorder)]">
              <AlertCircle className="w-4 h-4 text-[var(--vscode-errorForeground)] flex-shrink-0 mt-0.5" />
              <span className="text-sm text-[var(--vscode-errorForeground)] whitespace-pre-wrap">
                {error}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--vscode-widget-border)]">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          >
            {t('aiGraph.cancel')}
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <span className="animate-pulse">{t('aiGraph.generating')}</span>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                <span>{t('aiGraph.generate')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
