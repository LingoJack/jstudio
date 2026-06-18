import { useEffect, useState } from 'react';
import { FolderOpen, Folder, Loader2, AlertCircle, Minus, Plus } from 'lucide-react';
import { storage } from '../../lib/storage';
import { useStore } from '../../store/useStore';
import {
  LATIN_FONTS,
  CJK_FONTS,
  resolveFontFamily,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
} from '../../lib/fonts';
import FontDropdown from '../ui/FontDropdown';

export default function GeneralSection() {
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // Font settings from store
  const fontId = useStore((s) => s.fontId);
  const cjkFontId = useStore((s) => s.cjkFontId);
  const fontSize = useStore((s) => s.fontSize);
  const setFontId = useStore((s) => s.setFontId);
  const setCjkFontId = useStore((s) => s.setCjkFontId);
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

  // Combined preview font-family for the preview box
  const previewFontFamily = resolveFontFamily(fontId, cjkFontId);

  return (
    <div className="space-y-6">
      {/* ---- 英文字体 ---- */}
      <div>
        <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1">
          英文字体
        </label>
        <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-3">
          编辑器和界面的拉丁字母字体
        </p>
        <FontDropdown
          options={LATIN_FONTS}
          value={fontId}
          onChange={setFontId}
          searchPlaceholder="搜索英文字体…"
        />
      </div>

      {/* ---- 中文字体 ---- */}
      <div>
        <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1">
          中文字体
        </label>
        <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-3">
          编辑器和界面的中文字体
        </p>
        <FontDropdown
          options={CJK_FONTS}
          value={cjkFontId}
          onChange={setCjkFontId}
          searchPlaceholder="搜索中文字体…"
        />
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
            fontFamily: previewFontFamily,
            fontSize: `${fontSize}px`,
            lineHeight: 1.7,
          }}
        >
          Hello 世界 — 这是字体预览 AaBbCc 你好
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
