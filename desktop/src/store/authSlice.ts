/**
 * Auth slice - remote account session state machine.
 *
 * States:
 * - idle:           no token (never logged in, logged out, or server URL changed)
 * - authenticated:  token present and accepted by the backend
 * - expired:        token rejected (401 UNAUTHORIZED / TOKEN_EXPIRED), cleared
 * - offline:        server unreachable during verification; token kept so the
 *                   next verify (startup or manual retry) can recover
 *
 * The password is never persisted — only the token and identity fields go to
 * the settings table via fire-and-forget ipc.saveSettings calls.
 */

import { ipc } from '../lib/core/ipc';
import { logger } from '../lib/core/logger';
import { createRemoteClient, normalizeServerUrl } from '../lib/remote/client';
import { isAuthRejected, type RemoteError } from '../lib/remote/types';
import { onSaveError, type SliceCreator } from './storeHelpers';

/** Label used by the shared fire-and-forget save error handler. */
const SAVE_LABEL = '远程账户';

export type AuthStatus = 'idle' | 'authenticated' | 'expired' | 'offline';

export interface AuthSlice {
  /** Remote backend base URL, normalized (no trailing slash). '' = unset. */
  remoteServerUrl: string;
  remoteAuthToken: string | null;
  /** RFC3339 token expiry from the login response. */
  remoteTokenExpiresAt: string | null;
  remoteUserId: string | null;
  remoteUsername: string | null;
  authStatus: AuthStatus;

  /** Persists the server URL; changing it clears the session (token belongs to the old server). */
  setRemoteServerUrl: (url: string) => void;
  /** Logs in; rejects with RemoteError on failure. */
  loginRemote: (serverUrl: string, username: string, password: string) => Promise<void>;
  /** Registers then logs in; rejects with RemoteError on failure. */
  registerRemote: (serverUrl: string, username: string, password: string) => Promise<void>;
  /** Clears the session but keeps the server URL. */
  logoutRemote: () => void;
  /** Restores the persisted session and verifies it against /auth/me. */
  verifyRemoteSession: () => Promise<void>;
}

/** Module-level client singleton; not part of store state. */
const remote = createRemoteClient();

export const createAuthSlice: SliceCreator = (set, get) => ({
  remoteServerUrl: '',
  remoteAuthToken: null,
  remoteTokenExpiresAt: null,
  remoteUserId: null,
  remoteUsername: null,
  authStatus: 'idle',

  setRemoteServerUrl: (url) => {
    const normalized = normalizeServerUrl(url);
    if (normalized === get().remoteServerUrl) {
      return;
    }
    set({
      remoteServerUrl: normalized,
      remoteAuthToken: null,
      remoteTokenExpiresAt: null,
      remoteUserId: null,
      remoteUsername: null,
      authStatus: 'idle',
    });
    ipc.saveSettings({ remoteServerUrl: normalized }).catch(onSaveError(SAVE_LABEL));
  },

  loginRemote: async (serverUrl, username, password) => {
    const normalized = normalizeServerUrl(serverUrl);
    const resp = await remote.login(normalized, username, password);
    set({
      remoteServerUrl: normalized,
      remoteAuthToken: resp.token,
      remoteTokenExpiresAt: resp.expires_at,
      remoteUserId: resp.user.user_id,
      remoteUsername: resp.user.username,
      authStatus: 'authenticated',
    });
    ipc.saveSettings({
      remoteServerUrl: normalized,
      remoteAuthToken: resp.token,
      remoteTokenExpiresAt: resp.expires_at,
      remoteUserId: resp.user.user_id,
      remoteUsername: resp.user.username,
    }).catch(onSaveError(SAVE_LABEL));
  },

  registerRemote: async (serverUrl, username, password) => {
    const normalized = normalizeServerUrl(serverUrl);
    await remote.register(normalized, username, password);
    // Register does not return a token: log in right after.
    await get().loginRemote(normalized, username, password);
  },

  logoutRemote: () => {
    set({
      remoteAuthToken: null,
      remoteTokenExpiresAt: null,
      remoteUserId: null,
      remoteUsername: null,
      authStatus: 'idle',
    });
    ipc.saveSettings({
      remoteAuthToken: null,
      remoteTokenExpiresAt: null,
      remoteUserId: null,
      remoteUsername: null,
    }).catch(onSaveError(SAVE_LABEL));
  },

  verifyRemoteSession: async () => {
    let settings;
    try {
      settings = await ipc.loadSettings();
    } catch (e) {
      logger.warn('remote.auth', `load settings failed: ${String(e)}`);
      return;
    }

    const serverUrl = settings.remoteServerUrl ?? '';
    const token = settings.remoteAuthToken ?? null;
    if (!serverUrl || !token) {
      set({
        remoteServerUrl: serverUrl,
        remoteAuthToken: null,
        remoteTokenExpiresAt: null,
        remoteUserId: null,
        remoteUsername: null,
        authStatus: 'idle',
      });
      return;
    }

    // Optimistically restore, then let /auth/me downgrade to expired/offline.
    set({
      remoteServerUrl: serverUrl,
      remoteAuthToken: token,
      remoteTokenExpiresAt: settings.remoteTokenExpiresAt ?? null,
      remoteUserId: settings.remoteUserId ?? null,
      remoteUsername: settings.remoteUsername ?? null,
      authStatus: 'authenticated',
    });

    try {
      const me = await remote.me(serverUrl, token);
      if (get().remoteAuthToken !== token) {
        return; // session changed while the request was in flight
      }
      if (me.user_id !== get().remoteUserId || me.username !== get().remoteUsername) {
        set({ remoteUserId: me.user_id, remoteUsername: me.username });
        ipc.saveSettings({
          remoteUserId: me.user_id,
          remoteUsername: me.username,
        }).catch(onSaveError(SAVE_LABEL));
      }
    } catch (e) {
      if (get().remoteAuthToken !== token) {
        return;
      }
      const err = e as RemoteError;
      if (isAuthRejected(err)) {
        set({
          remoteAuthToken: null,
          remoteTokenExpiresAt: null,
          remoteUserId: null,
          remoteUsername: null,
          authStatus: 'expired',
        });
        ipc.saveSettings({
          remoteAuthToken: null,
          remoteTokenExpiresAt: null,
          remoteUserId: null,
          remoteUsername: null,
        }).catch(onSaveError(SAVE_LABEL));
        logger.info('remote.auth', 'session expired, token cleared');
      } else {
        // Network failure: keep the token, retry on next startup or manually.
        logger.warn('remote.auth', `session verify failed (${err.kind})`);
        set({ authStatus: 'offline' });
      }
    }
  },
});
