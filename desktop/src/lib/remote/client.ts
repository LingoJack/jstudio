import {
  API_PATH_AUTH_LOGIN,
  API_PATH_AUTH_ME,
  API_PATH_AUTH_REGISTER,
  BEARER_PREFIX,
  REMOTE_REQUEST_TIMEOUT_MS,
} from './constants';
import type { LoginResponse, MeResponse, RegisterResponse, RemoteError } from './types';

/** Max length of the body preview carried by unexpectedStatus errors. */
const UNEXPECTED_BODY_PREVIEW_MAX_LEN = 200;

/** Minimal shape of the backend error envelope. */
interface ErrorEnvelope {
  error: { code: string; message: string };
}

type FetchImpl = typeof fetch;

export interface RemoteClient {
  register(serverUrl: string, username: string, password: string): Promise<RegisterResponse>;
  login(serverUrl: string, username: string, password: string): Promise<LoginResponse>;
  me(serverUrl: string, token: string): Promise<MeResponse>;
}

/**
 * Creates a remote API client. The fetch implementation is injectable so unit
 * tests can stub the transport without any mocking library; every method
 * resolves with the parsed DTO or rejects with a RemoteError — never a bare
 * Error.
 */
export function createRemoteClient(
  fetchImpl: FetchImpl = globalThis.fetch.bind(globalThis),
): RemoteClient {
  return {
    register: (serverUrl, username, password) =>
      requestJson<RegisterResponse>(fetchImpl, {
        url: joinUrl(serverUrl, API_PATH_AUTH_REGISTER),
        method: 'POST',
        body: { username, password },
      }),
    login: (serverUrl, username, password) =>
      requestJson<LoginResponse>(fetchImpl, {
        url: joinUrl(serverUrl, API_PATH_AUTH_LOGIN),
        method: 'POST',
        body: { username, password },
      }),
    me: (serverUrl, token) =>
      requestJson<MeResponse>(fetchImpl, {
        url: joinUrl(serverUrl, API_PATH_AUTH_ME),
        method: 'GET',
        token,
      }),
  };
}

/** Strips whitespace and trailing slashes; empty string passes through. */
export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function joinUrl(serverUrl: string, path: string): string {
  return normalizeServerUrl(serverUrl) + path;
}

function isRemoteError(e: unknown): e is RemoteError {
  return typeof e === 'object' && e !== null && typeof (e as RemoteError).kind === 'string';
}

function tryParseErrorEnvelope(text: string): { code: string; message: string } | null {
  try {
    const parsed = JSON.parse(text) as Partial<ErrorEnvelope> | null;
    const err = parsed?.error;
    if (typeof err?.code === 'string' && typeof err?.message === 'string') {
      return { code: err.code, message: err.message };
    }
    return null;
  } catch {
    return null;
  }
}

interface RequestOptions {
  url: string;
  method: 'GET' | 'POST';
  body?: unknown;
  token?: string;
}

async function requestJson<T>(fetchImpl: FetchImpl, opts: RequestOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_REQUEST_TIMEOUT_MS);
  try {
    // GET requests carry no body, so no Content-Type header either.
    const headers: Record<string, string> = {};
    if (opts.token !== undefined) {
      headers.Authorization = `${BEARER_PREFIX} ${opts.token}`;
    }
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetchImpl(opts.url, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      const envelope = tryParseErrorEnvelope(text);
      if (envelope) {
        throw { kind: 'api', status: res.status, code: envelope.code, message: envelope.message } as const;
      }
      throw {
        kind: 'unexpectedStatus',
        status: res.status,
        bodyPreview: text.slice(0, UNEXPECTED_BODY_PREVIEW_MAX_LEN),
      } as const;
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw { kind: 'invalidResponse', message: 'response body is not valid JSON' } as const;
    }
  } catch (e) {
    if (isRemoteError(e)) {
      throw e;
    }
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw { kind: 'network', message: 'request timed out' } satisfies RemoteError;
    }
    if (e instanceof TypeError) {
      throw { kind: 'network', message: 'server unreachable' } satisfies RemoteError;
    }
    throw { kind: 'invalidResponse', message: String(e) } satisfies RemoteError;
  } finally {
    clearTimeout(timer);
  }
}
