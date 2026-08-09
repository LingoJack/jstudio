import { useEffect, useState, useCallback } from 'react';
import { Terminal, CheckCircle2, XCircle, Trash2, Download, Loader2, AlertCircle } from 'lucide-react';
import { storage } from '../../lib/core/storage';
import type { JcliStatus } from '../../types/terminal';
import { useI18n } from '../../lib/core/i18n';
import { toast } from '../../lib/core/toast';

export function JcliSection() {
  const { t } = useI18n();
  const [status, setStatus] = useState<JcliStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await storage.checkJcli();
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleInstall = async () => {
    setBusy(true);
    try {
      await storage.installJcli();
      await refresh();
      toast.success(t('jcli.installSuccess'));
    } catch (e) {
      toast.error(`${t('jcli.installFailed')}: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUninstall = async () => {
    setBusy(true);
    try {
      await storage.uninstallJcli();
      await refresh();
      toast.success(t('jcli.uninstallSuccess'));
    } catch (e) {
      toast.error(`${t('jcli.uninstallFailed')}: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const checking = status === null;
  const installed = status?.installed ?? false;
  const canInstall = status?.bundled ?? false;

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
        {t('jcli.title')}
      </label>
      <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
        {t('jcli.desc')}
      </p>

      {/* Status row - path shown inline, same pattern as Data Location */}
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]">
        <Terminal className="w-5 h-5 text-[var(--vscode-descriptionForeground)] shrink-0" />

        {checking ? (
          <span className="text-sm text-[var(--vscode-descriptionForeground)] flex-1">
            {t('jcli.checking')}
          </span>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {installed ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--vscode-testing-iconPassed)] shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[var(--vscode-errorForeground)] shrink-0" />
            )}
            <span
              className={`text-sm shrink-0 ${installed ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-descriptionForeground)]'}`}
            >
              {installed ? t('jcli.installed') : t('jcli.notInstalled')}
            </span>
            {installed && status?.version && (
              <span className="text-xs text-[var(--vscode-descriptionForeground)] shrink-0 font-mono">
                {status.version}
              </span>
            )}
            {installed && status?.path && (
              <>
                <span className="text-xs text-[var(--vscode-descriptionForeground)] shrink-0">
                  ·
                </span>
                <span className="text-xs text-[var(--vscode-descriptionForeground)] truncate font-mono">
                  {status.path}
                </span>
              </>
            )}
          </div>
        )}

        {/* Action button - same jstudio-btn-primary as Data Location */}
        {!checking && (
          <button
            onClick={installed ? handleUninstall : handleInstall}
            disabled={busy || (!installed && !canInstall)}
            className="jstudio-btn-primary shrink-0"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : installed ? (
              <Trash2 className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{installed ? t('jcli.uninstall') : t('jcli.install')}</span>
          </button>
        )}
      </div>

      {/* Bundled version warning (if not bundled) */}
      {status && !status.bundled && (
        <div className="mt-2 flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[var(--vscode-inputValidation-warningBackground)] border border-[var(--vscode-inputValidation-warningBorder)]">
          <AlertCircle className="w-4 h-4 text-[var(--vscode-editorWarning-foreground)] shrink-0" />
          <span className="text-xs text-[var(--vscode-foreground)]">
            {t('jcli.notBundled')}
          </span>
        </div>
      )}
    </div>
  );
}
