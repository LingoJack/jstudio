import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bug, Terminal, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface BuildInfo {
  commit: string;
  is_dev: boolean;
}

export default function DebugSection() {
  const { t } = useI18n();
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [sectionedFlag, setSectionedFlag] = useState<string | null>(null);

  useEffect(() => {
    invoke<BuildInfo>('get_build_info')
      .then(setBuildInfo)
      .catch(() => {});
    setSectionedFlag(localStorage.getItem('jstudio.sectioned'));
  }, []);

  const handleOpenDevtools = () => {
    invoke('open_devtools').catch(() => {});
  };

  const handleClearSectioned = () => {
    localStorage.removeItem('jstudio.sectioned');
    setSectionedFlag(null);
    // Reload the page so App.tsx re-evaluates which editor to use.
    window.location.reload();
  };

  const usingSectioned = sectionedFlag === '1';

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

      {/* ── Editor in use ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          {t('debug.editorInUse')}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--vscode-textBlockQuote-background)]">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                usingSectioned
                  ? 'text-[var(--vscode-descriptionForeground)] opacity-40'
                  : 'text-[var(--vscode-terminal-ansiGreen)]'
              }`}
            />
            <span>{t('debug.editorMain')}</span>
            {!usingSectioned && (
              <span className="ml-auto text-xs text-[var(--vscode-terminal-ansiGreen)]">
                ●
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--vscode-textBlockQuote-background)]">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                usingSectioned
                  ? 'text-[var(--vscode-terminal-ansiGreen)]'
                  : 'text-[var(--vscode-descriptionForeground)] opacity-40'
              }`}
            />
            <span>{t('debug.editorSectioned')}</span>
            {usingSectioned && (
              <span className="ml-auto text-xs text-[var(--vscode-terminal-ansiGreen)]">
                ●
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--vscode-textBlockQuote-background)]">
            <span className="opacity-60 shrink-0">{t('debug.sectionedFlag')}</span>
            <code className="ml-auto font-mono text-[var(--vscode-textLink-foreground)]">
              {sectionedFlag === null ? 'null' : `"${sectionedFlag}"`}
            </code>
          </div>
        </div>

        {usingSectioned && (
          <button
            onClick={handleClearSectioned}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm text-[var(--vscode-foreground)] bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-5 h-5 opacity-70 shrink-0" />
            <div className="flex-1 text-left">
              <div className="font-medium">{t('debug.clearSectioned')}</div>
              <div className="text-xs opacity-60">{t('debug.clearSectionedDesc')}</div>
            </div>
          </button>
        )}
      </section>
    </div>
  );
}
