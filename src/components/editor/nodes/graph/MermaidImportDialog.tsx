/**
 * MermaidImportDialog — Mermaid 代码导入对话框
 *
 * 提供一个输入框让用户粘贴 Mermaid 代码，解析后转换为 GraphCanvas 快照。
 * 支持的图表类型：flowchart / graph、sequenceDiagram
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, X, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { convertMermaidToSnapshot } from '../../../../lib/editor/mermaid';
import { IconButton } from '../../../ui/IconButton';
import { useI18n } from '../../../../lib/core/i18n';

interface MermaidImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** 转换成功后回调，传入 GraphSnapshot JSON 字符串 */
  onImport: (snapshotJson: string) => void;
}

/** 示例代码 */
const EXAMPLE_FLOWCHART = `flowchart TD
    A[开始] --> B[处理数据]
    B --> C{判断结果}
    C -->|成功| D[输出报告]
    C -->|失败| E[错误处理]
    E --> B`;

const EXAMPLE_SEQUENCE = `sequenceDiagram
    Alice->>Bob: 你好吗？
    Bob-->>Alice: 很好！
    Alice->>Bob: 再见
    Bob-->>Alice: 再见`;

export default function MermaidImportDialog({
  open,
  onClose,
  onImport,
}: MermaidImportDialogProps) {
  const { t } = useI18n();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [selectedExample, setSelectedExample] = useState<'flowchart' | 'sequence'>('flowchart');

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
      setCode('');
      setError(null);
      setIsConverting(false);
    }
  }, [open]);

  if (!open) return null;

  const handleInsertExample = () => {
    setCode(selectedExample === 'flowchart' ? EXAMPLE_FLOWCHART : EXAMPLE_SEQUENCE);
    setError(null);
  };

  const handleConvert = async () => {
    if (!code.trim()) {
      setError('请输入 Mermaid 代码');
      return;
    }

    setIsConverting(true);
    setError(null);

    try {
      const result = await convertMermaidToSnapshot(code);

      if (!result.success) {
        setError(result.error ?? '转换失败');
        setIsConverting(false);
        return;
      }

      // 成功转换
      onImport(result.snapshot!);
      onClose();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`转换异常: ${errorMessage}`);
    } finally {
      setIsConverting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-h-[80vh] flex flex-col rounded-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--vscode-widget-border)]">
          <FileDown className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
          <h2 className="flex-1 text-sm font-semibold text-[var(--vscode-foreground)]">
            导入 Mermaid 图表
          </h2>
          <IconButton onClick={onClose} title="关闭">
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 说明 */}
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-3">
            支持流程图（flowchart）和时序图（sequenceDiagram）。粘贴 Mermaid 代码后点击「转换」按钮。
          </p>

          {/* 示例选择 */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">插入示例：</span>
            <button
              onClick={() => {
                setSelectedExample('flowchart');
                handleInsertExample();
              }}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                selectedExample === 'flowchart'
                  ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                  : 'text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
            >
              流程图
            </button>
            <button
              onClick={() => {
                setSelectedExample('sequence');
                handleInsertExample();
              }}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                selectedExample === 'sequence'
                  ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                  : 'text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
            >
              时序图
            </button>
          </div>

          {/* 代码输入框 */}
          <textarea
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            placeholder="输入 Mermaid 代码..."
            className="w-full h-[200px] px-3 py-2.5 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-sm text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)] resize-none focus:outline-none focus:border-[var(--vscode-focusBorder)] font-mono"
            spellCheck={false}
          />

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-md bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-inputValidation-errorBorder)]">
              <AlertCircle className="w-4 h-4 text-[var(--vscode-errorForeground)]" />
              <span className="text-sm text-[var(--vscode-errorForeground)]">{error}</span>
            </div>
          )}

          {/* 提示 */}
          <div className="mt-3 text-xs text-[var(--vscode-descriptionForeground)] opacity-70">
            <p className="mb-1">常用语法提示：</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>节点形状：[方形]、([圆角])、((圆形))、{'{'}菱形{'}'}</li>
              <li>连线：--&gt; 箭头实线、--- 无箭头实线、-.-&gt; 箭头虚线</li>
              <li>标签：A--&gt;|标签|B 或 A--&gt; B : 标签</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--vscode-widget-border)]">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConvert}
            disabled={isConverting || !code.trim()}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConverting ? (
              <span className="animate-pulse">转换中...</span>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                <span>转换</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}