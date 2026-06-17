import { useEffect, useState } from 'react';
import { FolderOpen, Folder, Loader2, AlertCircle, Type, Minus, Plus } from 'lucide-react';
import { storage } from '../../lib/storage';
import { useStore } from '../../store/useStore';
import {
  FONT_PRESETS,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
} from '../../lib/fonts';

export default function GeneralSection() {
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // Font settings from store
  const fontId = useStore((s) => s.fontId);
  const fontSize = useStore((s) => s.fontSize);
  const setFontId = useStore((s) => s.setFontId);
  const setFontSize = useStore((s) => s.setFontSize);

  useEffect(() => {
    storage
      .init()
      .then(setDataPath)
      .catch((e) => setError(String(e)));
  }, []);

  const handleOpen = async () => {
    if (!dataPath) return;
    setOpening(true);
    setError(null);
    try {
      await storage.openDataDir();
    } catch (e) {
      setError(String(e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---- 字体设置 ---- */}
      <div>
        <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1">
          字体
        </label>
        <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-3">
          编辑器和界面的英文字体，中文始终使用苹方 (PingFang SC)
        </p>

        <div className="relative">
          <select
            value={fontId}
            onChange={(e) => setFontId(e.target.value)}
            className="w-full appearance-none px-3 py-2.5 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-xs text-[var(--vscode-foreground)] cursor-pointer hover:border-[var(--vscode-focusBorder)] transition-colors duration-150 focus:outline-none focus:border-[var(--vscode-focusBorder)]"
            style={{
              fontFamily:
                FONT_PRESETS.find((f) => f.id === fontId)?.fontFamily ??
                undefined,
            }}
          >
            {FONT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <Type className="w-3.5 h-3.5 text-[var(--vscode-descriptionForeground)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* ---- 字体大小 ---- */}
      <div>
        <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1">
          字体大小
        </label>
        <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-3">
          编辑器正文的基准字号（{MIN_FONT_SIZE}–{MAX_FONT_SIZE} px）
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFontSize(fontSize - 1)}
            disabled={fontSize <= MIN_FONT_SIZE}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:border-[var(--vscode-focusBorder)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-[var(--vscode-focusBorder)] cursor-pointer"
          />

          <button
            onClick={() => setFontSize(fontSize + 1)}
            disabled={fontSize >= MAX_FONT_SIZE}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:border-[var(--vscode-focusBorder)] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <span className="text-xs text-[var(--vscode-foreground)] tabular-nums w-14 text-center shrink-0 font-medium">
            {fontSize} px
          </span>
        </div>

        {/* 预览 */}
        <div
          className="mt-3 px-4 py-3 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)]"
          style={{
            fontFamily:
              FONT_PRESETS.find((f) => f.id === fontId)?.fontFamily ??
              undefined,
            fontSize: `${fontSize}px`,
            lineHeight: 1.7,
          }}
        >
          Hello 世界 — 这是字体预览 AaBbCc
        </div>
      </div>

      {/* ---- 数据存储 ---- */}
      <div>
        <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1">
          数据存储位置
        </label>
        <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-3">
          所有笔记、附件和设置均保存在此目录
        </p>

        {error ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-inputValidation-errorBorder)]">
            <AlertCircle className="w-4 h-4 text-[var(--vscode-errorForeground)] shrink-0" />
            <span className="text-[11px] text-[var(--vscode-errorForeground)]">
              {error}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]">
            <Folder className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0" />
            <span className="text-xs text-[var(--vscode-foreground)] truncate flex-1 font-mono">
              {dataPath ?? '加载中…'}
            </span>
            <button
              onClick={handleOpen}
              disabled={!dataPath || opening}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {opening ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <FolderOpen className="w-3 h-3" />
              )}
              <span>打开</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
