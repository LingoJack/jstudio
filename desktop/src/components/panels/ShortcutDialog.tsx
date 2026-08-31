/**
 * ShortcutDialog - 添加 / 编辑浏览器起始页快捷方式的弹窗。
 *
 * 从 BrowserStartPage.tsx 抽取为独立组件。包含名称 + URL 两个输入框，
 * URL 自动补全 `https://` 协议，Enter 提交，点击遮罩关闭。
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import type { BrowserShortcut } from "../../store/browserSlice";

export interface ShortcutDialogProps {
  /** Existing shortcut when editing, `undefined` when adding. */
  initial?: BrowserShortcut;
  onSave: (name: string, url: string) => void;
  onClose: () => void;
}

export function ShortcutDialog({ initial, onSave, onClose }: ShortcutDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const canSave = name.trim().length > 0 && url.trim().length > 0;

  const handleSubmit = () => {
    if (!canSave) return;
    const trimmedUrl = url.trim();
    const normalizedUrl = /^[a-zA-Z]+:\/\//.test(trimmedUrl)
      ? trimmedUrl
      : `https://${trimmedUrl}`;
    onSave(name.trim(), normalizedUrl);
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/40"
      onMouseDown={onClose}
    >
      <div
        className="w-[28rem] rounded-xl border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-xl p-6 space-y-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-[var(--vscode-foreground)]">
            {initial
              ? t("linkPreview.startPage.editShortcut")
              : t("linkPreview.startPage.addShortcut")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--vscode-menu-hoverBackground)] opacity-70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs opacity-70 text-[var(--vscode-foreground)]">
            {t("linkPreview.startPage.nameLabel")}
          </span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full px-3 py-2 rounded-md text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs opacity-70 text-[var(--vscode-foreground)]">
            {t("linkPreview.startPage.urlLabel")}
          </span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="https://"
            className="w-full px-3 py-2 rounded-md text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm text-[var(--vscode-foreground)] hover:bg-[var(--vscode-menu-hoverBackground)]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="px-4 py-2 rounded-md text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:opacity-90 disabled:opacity-40"
          >
            {t("linkPreview.startPage.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
