/**
 * GraphAutoColorDialog - 自动上色预览弹窗。
 *
 * 展示按"相邻不同色"算法生成的上色预览（静态 SVG 导出图），用户可：
 *   - 应用：把方案写回模型（单次 batchUpdate，一步可撤销）；
 *   - 换一批：重新洗牌色板生成新方案；
 *   - 取消（Esc）：丢弃方案。
 * 预览期间画布模型零改动——预览图是"瞬时上色 → 序列化 → 还原"的产物。
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, RefreshCw, X } from 'lucide-react';
import { IconButton } from '../../../ui/IconButton';
import { AutoColorGlyph } from './ShapeGlyph';
import { useDialogTransition } from '../../../ui/useDialogTransition';

interface GraphAutoColorDialogProps {
  open: boolean;
  /** 预览 SVG 字符串（已上色版本的静态导出）。 */
  previewSvg: string | null;
  /** 方案用到的颜色（去重），用于色点展示。 */
  palette: string[];
  onReroll: () => void;
  onApply: () => void;
  onClose: () => void;
}

const PREVIEW_DATA_URL_PREFIX = 'data:image/svg+xml;charset=utf-8,';

export default function GraphAutoColorDialog({
  open,
  previewSvg,
  palette,
  onReroll,
  onApply,
  onClose,
}: GraphAutoColorDialogProps) {
  const transition = useDialogTransition(open);

  // Esc 关闭（取消）。
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (transition === 'closed') return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 ${
        transition === 'exit'
          ? 'animate-dialog-backdrop-out'
          : 'animate-dialog-backdrop-in'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-[min(880px,92vw)] max-h-[85vh] flex flex-col rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl ${
          transition === 'exit'
            ? 'animate-dialog-panel-out'
            : 'animate-dialog-panel-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--vscode-widget-border)]">
          <AutoColorGlyph />
          <h2 className="flex-1 text-sm font-semibold text-[var(--vscode-foreground)]">
            自动上色预览
          </h2>
          <IconButton onClick={onClose} title="关闭">
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-3">
            相邻与同层的图形不同色。仅矩形、圆角矩形与菱形参与上色，连线与标签保持原样；不满意可换一批。
          </p>
          <div className="rounded-md border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] p-3 flex items-center justify-center">
            {previewSvg ? (
              <img
                src={PREVIEW_DATA_URL_PREFIX + encodeURIComponent(previewSvg)}
                alt="自动上色预览"
                className="max-w-full max-h-[52vh]"
              />
            ) : (
              <span className="text-xs text-[var(--vscode-descriptionForeground)]">
                生成预览中...
              </span>
            )}
          </div>
          {palette.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-[var(--vscode-descriptionForeground)]">
                本次配色：
              </span>
              {palette.map((color) => (
                <span
                  key={color}
                  className="w-4 h-4 rounded border border-[var(--vscode-widget-border)]"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--vscode-widget-border)]">
          <button
            onClick={onReroll}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>换一批</span>
          </button>
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={onApply}
            disabled={!previewSvg}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>应用</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
