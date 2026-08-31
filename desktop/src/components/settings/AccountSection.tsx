/**
 * Settings section: remote account.
 *
 * Logged out (idle/expired): login + register form styled after the agent
 * provider form. Logged in (authenticated/offline): a status row plus a
 * 2-column metadata tile grid, with a re-verify action when offline.
 * The password is only kept in component state for the duration of the
 * request — it is never persisted.
 */

import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  RefreshCw,
  UserCircle,
} from 'lucide-react';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import { logger } from '../../lib/core/logger';
import { toast } from '../../lib/core/toast';
import {
  API_ERROR_CODE_CONFLICT,
  API_ERROR_CODE_INVALID_REQUEST,
  API_ERROR_CODE_UNAUTHORIZED,
  HTTP_STATUS_UNAUTHORIZED,
} from '../../lib/remote/constants';
import type { RemoteError } from '../../lib/remote/types';
import { useStore } from '../../store/useStore';

const inputClass =
  'w-full px-3 py-2 text-sm rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors';

type BusyAction = 'login' | 'register' | 'verify';

/** Maps a RemoteError to the i18n key shown in the form error row. */
function errorMessageKey(e: RemoteError): TranslationKey {
  if (e.kind === 'network') {
    return 'account.error.network';
  }
  if (e.kind === 'api') {
    if (e.status === HTTP_STATUS_UNAUTHORIZED && e.code === API_ERROR_CODE_UNAUTHORIZED) {
      return 'account.error.invalidCredentials';
    }
    if (e.code === API_ERROR_CODE_CONFLICT) {
      return 'account.error.usernameTaken';
    }
    if (e.code === API_ERROR_CODE_INVALID_REQUEST) {
      return 'account.error.invalidRequest';
    }
  }
  return 'account.error.unknown';
}

export default function AccountSection() {
  const { t } = useI18n();
  const remoteServerUrl = useStore((s) => s.remoteServerUrl);
  const remoteAuthToken = useStore((s) => s.remoteAuthToken);
  const authStatus = useStore((s) => s.authStatus);
  const remoteUserId = useStore((s) => s.remoteUserId);
  const remoteUsername = useStore((s) => s.remoteUsername);
  const remoteTokenExpiresAt = useStore((s) => s.remoteTokenExpiresAt);
  const loginRemote = useStore((s) => s.loginRemote);
  const registerRemote = useStore((s) => s.registerRemote);
  const logoutRemote = useStore((s) => s.logoutRemote);
  const setRemoteServerUrl = useStore((s) => s.setRemoteServerUrl);
  const verifyRemoteSession = useStore((s) => s.verifyRemoteSession);

  const [serverUrl, setServerUrl] = useState(remoteServerUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [formError, setFormError] = useState<TranslationKey | null>(null);

  const hasSession = remoteAuthToken !== null;
  const formIncomplete = serverUrl.trim() === '' || username.trim() === '' || password === '';

  const handleSubmit = async (action: 'login' | 'register') => {
    if (formIncomplete || busy) {
      return;
    }
    setBusy(action);
    setFormError(null);
    try {
      const target = serverUrl.trim();
      const user = username.trim();
      if (action === 'login') {
        await loginRemote(target, user, password);
        toast.success(t('account.loginSuccess'));
      } else {
        await registerRemote(target, user, password);
        toast.success(t('account.registerSuccess'));
      }
      setPassword('');
    } catch (e) {
      const err = e as RemoteError;
      if (err.kind === 'unexpectedStatus' || err.kind === 'invalidResponse') {
        logger.error('remote.auth', `request failed: ${JSON.stringify(err)}`);
      }
      setFormError(errorMessageKey(err));
    } finally {
      setBusy(null);
    }
  };

  const handleReverify = async () => {
    if (busy) {
      return;
    }
    setBusy('verify');
    try {
      await verifyRemoteSession();
    } finally {
      setBusy(null);
    }
  };

  const handleLogout = () => {
    logoutRemote();
    toast.info(t('account.logoutSuccess'));
  };

  return (
    <div className="space-y-8">
      <div>
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('settings.account')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('account.desc')}
        </p>

        {hasSession ? (
          <LoggedInCard
            username={remoteUsername ?? ''}
            status={authStatus}
            serverUrl={remoteServerUrl}
            userId={remoteUserId ?? ''}
            expiresAt={remoteTokenExpiresAt}
            busy={busy === 'verify'}
            onReverify={handleReverify}
            onLogout={handleLogout}
          />
        ) : (
          <div className="space-y-4 max-w-lg">
            {authStatus === 'expired' && (
              <p className="flex items-center gap-2 text-sm text-[var(--vscode-errorForeground)]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {t('account.expiredNotice')}
              </p>
            )}
            <FormField label={t('account.serverUrl')}>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                onBlur={() => setRemoteServerUrl(serverUrl)}
                placeholder={t('account.serverUrlPlaceholder')}
                className={`${inputClass} font-mono`}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label={t('account.username')}>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('account.usernamePlaceholder')}
                  className={inputClass}
                />
              </FormField>
              <FormField label={t('account.password')}>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleSubmit('login');
                      }
                    }}
                    placeholder={t('account.passwordPlaceholder')}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer transition-colors"
                    title={showPassword ? t('account.hidePassword') : t('account.showPassword')}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </FormField>
            </div>
            {formError && (
              <p className="text-sm text-[var(--vscode-errorForeground)]">{t(formError)}</p>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => void handleSubmit('register')}
                disabled={formIncomplete || busy !== null}
                className="px-4 py-1.5 text-sm rounded-md border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy === 'register' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('account.register')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit('login')}
                disabled={formIncomplete || busy !== null}
                className="jstudio-btn-primary"
              >
                {busy === 'login' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('account.login')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Logged-in card ─────────────────────────────────────────────────

function LoggedInCard({
  username,
  status,
  serverUrl,
  userId,
  expiresAt,
  busy,
  onReverify,
  onLogout,
}: {
  username: string;
  status: 'authenticated' | 'expired' | 'offline' | 'idle';
  serverUrl: string;
  userId: string;
  expiresAt: string | null;
  busy: boolean;
  onReverify: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const connected = status === 'authenticated';

  const expiresText = expiresAt
    ? new Date(expiresAt).toLocaleString()
    : '--';

  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="flex items-center gap-3 rounded-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] px-4 py-3">
        <UserCircle className="w-6 h-6 text-[var(--vscode-descriptionForeground)] shrink-0" />
        <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate">
          {username}
        </span>
        {connected ? (
          <span className="flex items-center gap-1.5 text-xs text-[var(--vscode-testing-iconPassed)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('account.status.connected')}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-[var(--vscode-errorForeground)]">
            <AlertCircle className="w-3.5 h-3.5" />
            {t('account.status.offline')}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t('account.logout')}
        </button>
      </div>

      {/* Metadata tiles */}
      <div className="grid grid-cols-2 gap-4">
        <MetaTile label={t('account.serverUrl')} value={serverUrl} mono />
        <MetaTile label={t('account.userId')} value={userId} mono />
        <MetaTile label={t('account.tokenExpiresAt')} value={expiresText} />
        <MetaTile
          label={t('account.status')}
          value={connected ? t('account.status.connected') : t('account.status.offline')}
        />
      </div>

      {/* Offline banner + re-verify */}
      {!connected && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--vscode-descriptionForeground)]">
            {t('account.offlineHint')}
          </p>
          <div>
            <button
              type="button"
              onClick={onReverify}
              disabled={busy}
              className="jstudio-btn-primary"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                {t('account.recheck')}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] p-4">
      <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-1.5">{label}</p>
      <p
        className={`text-sm text-[var(--vscode-foreground)] truncate ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
