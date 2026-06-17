import { Palette } from 'lucide-react';

export default function AboutSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-[var(--vscode-button-background)] flex items-center justify-center shrink-0">
          <Palette className="w-5 h-5 text-[var(--vscode-button-foreground)]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--vscode-foreground)]">
            JStudio
          </p>
          <p className="text-[11px] text-[var(--vscode-descriptionForeground)]">
            轻量级笔记与画布工作台
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--vscode-sideBar-border)] pt-4 space-y-2.5 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--vscode-descriptionForeground)]">
            版本
          </span>
          <span className="text-[var(--vscode-foreground)]">
            {__APP_VERSION__}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--vscode-descriptionForeground)]">
            技术栈
          </span>
          <span className="text-[var(--vscode-foreground)]">
            Tauri + React + TipTap
          </span>
        </div>
      </div>
    </div>
  );
}
