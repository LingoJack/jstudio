import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bug, Terminal, GitCommit, CheckCircle2, Zap } from 'lucide-react';
import { useI18n } from '../../lib/core/i18n';
import { useStore } from '../../store/useStore';

interface BuildInfo {
  commit: string;
  is_dev: boolean;
}

export default function DebugSection() {
  const { t } = useI18n();
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const useSectionedEditor = useStore((s) => s.useSectionedEditor);
  const setUseSectionedEditor = useStore((s) => s.setUseSectionedEditor);

  useEffect(() => {
    invoke<BuildInfo>('get_build_info')
      .then(setBuildInfo)
      .catch(() => {});
  }, []);

  const handleOpenDevtools = () => {
    invoke('open_devtools').catch(() => {});
  };

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 pb-2">
        <Bug className="w-6 h-6 text-[var(--vscode-focusBorder)] shrink-0" />
        <h2 className="text-xl font-bold text-[var(--vscode-foreground)]">
          {t('settings.debug')}
        </h2>
      </div>

      {/* ── DevTools ── */}
      <section className="space-y-2">
        <button
          onClick={handleOpenDevtools}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm text-[var(--vscode-foreground)] bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors cursor-pointer"
        >
          <Terminal className="w-5 h-5 opacity-70 shrink-0" />
          <div className="flex-1 text-left">
            <div className="font-medium">{t('debug.openDevtools')}</div>
            <div className="text-xs opacity-60">{t('debug.openDevtoolsDesc')}</div>
          </div>
        </button>
      </section>

      {/* ── Build Info ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          {t('debug.buildInfo')}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--vscode-textBlockQuote-background)]">
            <GitCommit className="w-4 h-4 opacity-60 shrink-0" />
            <span className="opacity-60 shrink-0">{t('debug.buildCommit')}</span>
            <code className="ml-auto font-mono text-[var(--vscode-textLink-foreground)]">
              {buildInfo?.commit ?? '—'}
            </code>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--vscode-textBlockQuote-background)]">
            <span className="opacity-60 shrink-0">{t('debug.buildMode')}</span>
            <span className="ml-auto font-medium">
              {buildInfo ? (
                buildInfo.is_dev ? t('debug.buildModeDev') : t('debug.buildModeRelease')
              ) : (
                '—'
              )}
            </span>
          </div>
        </div>
      </section>

      {/* ── Editor Selection ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          {t('debug.editorInUse')}
        </h3>
        <p className="text-xs opacity-50 px-1">
          {t('debug.editorSwitchHint')}
        </p>
        <div className="space-y-2 text-sm">
          {/* BlockEditor (main) */}
          <button
            onClick={() => setUseSectionedEditor(false)}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm transition-colors cursor-pointer border ${
              !useSectionedEditor
                ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]'
                : 'border-transparent bg-[var(--vscode-textBlockQuote-background)] hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]'
            }`}
          >
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                !useSectionedEditor
                  ? 'text-[var(--vscode-terminal-ansiGreen)]'
                  : 'text-[var(--vscode-descriptionForeground)] opacity-40'
              }`}
            />
            <div className="flex-1 text-left">
              <div className="font-medium">{t('debug.editorMain')}</div>
              <div className="text-xs opacity-60">{t('debug.editorMainDesc')}</div>
            </div>
            {!useSectionedEditor && (
              <span className="text-xs text-[var(--vscode-terminal-ansiGreen)]">●</span>
            )}
          </button>

          {/* SectionedBlockEditor (POC) */}
          <button
            onClick={() => setUseSectionedEditor(true)}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm transition-colors cursor-pointer border ${
              useSectionedEditor
                ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]'
                : 'border-transparent bg-[var(--vscode-textBlockQuote-background)] hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]'
            }`}
          >
            <Zap
              className={`w-4 h-4 shrink-0 ${
                useSectionedEditor
                  ? 'text-[var(--vscode-terminal-ansiGreen)]'
                  : 'text-[var(--vscode-descriptionForeground)] opacity-40'
              }`}
            />
            <div className="flex-1 text-left">
              <div className="font-medium">{t('debug.editorSectioned')}</div>
              <div className="text-xs opacity-60">{t('debug.editorSectionedDesc')}</div>
            </div>
            {useSectionedEditor && (
              <span className="text-xs text-[var(--vscode-terminal-ansiGreen)]">●</span>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
