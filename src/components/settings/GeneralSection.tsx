import { useEffect, useState } from 'react';
import { FolderOpen, Folder, Loader2, AlertCircle } from 'lucide-react';
import { openPath } from '@tauri-apps/plugin-opener';
import { storage } from '../../lib/storage';

export default function GeneralSection() {
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    storage
      .init()
      .then(setDataPath)
      .catch((e) => setError(String(e)));
  }, []);

  const handleOpen = async () => {
    if (!dataPath) return;
    setOpening(true);
    try {
      await openPath(dataPath);
    } catch (e) {
      setError(String(e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1">
          数据存储位置
        </label>
        <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-3">
          所有笔记、附件和设置均保存在此目录
        </p>

        {error ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-inputValidation-errorBorder)]">
            <AlertCircle className="w-4 h-4 text-[var(--vscode-errorForeground)] shrink-0" />
            <span className="text-[11px] text-[var(--vscode-errorForeground)]">
              {error}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]">
            <Folder className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0" />
            <span className="text-xs text-[var(--vscode-foreground)] truncate flex-1 font-mono">
              {dataPath ?? '加载中…'}
            </span>
            <button
              onClick={handleOpen}
              disabled={!dataPath || opening}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
