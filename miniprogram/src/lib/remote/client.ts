import {
  API_PATH_AUTH_LOGIN,
  API_PATH_AUTH_ME,
  API_PATH_AUTH_REGISTER,
  API_PATH_DOCUMENTS,
  API_PATH_DOCUMENT_LATEST,
  API_PATH_SNAPSHOT,
  API_PATH_SNAPSHOTS,
  BEARER_PREFIX,
  REMOTE_REQUEST_TIMEOUT_MS,
} from './constants'
import type {
  DocumentListResponse,
  LoginResponse,
  MeResponse,
  RegisterResponse,
  RemoteError,
  SnapshotListResponse,
  SnapshotResponse,
  Transport,
} from './types'

/** Max length of the body preview carried by unexpectedStatus errors. */
const UNEXPECTED_BODY_PREVIEW_MAX_LEN = 200

/** Minimal shape of the backend error envelope. */
interface ErrorEnvelope {
  error: { code: string; message: string }
}

export interface RemoteClient {
  register(serverUrl: string, username: string, password: string): Promise<RegisterResponse>
  login(serverUrl: string, username: string, password: string): Promise<LoginResponse>
  me(serverUrl: string, token: string): Promise<MeResponse>
  listDocuments(serverUrl: string, token: string): Promise<DocumentListResponse>
  getLatestSnapshot(serverUrl: string, token: string, docId: string): Promise<SnapshotResponse>
  getSnapshot(serverUrl: string, token: string, docId: string, revision: number): Promise<SnapshotResponse>
  listSnapshots(serverUrl: string, token: string, docId: string, limit: number): Promise<SnapshotListResponse>
}

/**
 * Creates a remote API client. The transport is injectable so unit tests can
 * stub the network without any mocking library; every method resolves with the
 * parsed DTO or rejects with a RemoteError — never a bare Error.
 *
 * 未显式传 transport 时惰性加载 Taro 实现 —— Node 测试只 import 本模块的
 * 纯逻辑，require('@tarojs/taro') 在 Node 里会因运行时常量缺失而崩。
 */
export function createRemoteClient(transport?: Transport): RemoteClient {
  const t = transport ?? defaultTransport()
  return createClientWith(t)
}

function defaultTransport(): Transport {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./transport') as { taroTransport: Transport }
  return mod.taroTransport
}

function createClientWith(transport: Transport): RemoteClient {
  return {
    register: (serverUrl, username, password) =>
      requestJson<RegisterResponse>(transport, {
        url: joinUrl(serverUrl, API_PATH_AUTH_REGISTER),
        method: 'POST',
        body: { username, password },
      }),
    login: (serverUrl, username, password) =>
      requestJson<LoginResponse>(transport, {
        url: joinUrl(serverUrl, API_PATH_AUTH_LOGIN),
        method: 'POST',
        body: { username, password },
      }),
    me: (serverUrl, token) =>
      requestJson<MeResponse>(transport, {
        url: joinUrl(serverUrl, API_PATH_AUTH_ME),
        method: 'GET',
        token,
      }),
    listDocuments: (serverUrl, token) =>
      requestJson<DocumentListResponse>(transport, {
        url: joinUrl(serverUrl, API_PATH_DOCUMENTS),
        method: 'GET',
        token,
      }),
    getLatestSnapshot: (serverUrl, token, docId) =>
      requestJson<SnapshotResponse>(transport, {
        url: joinUrl(serverUrl, API_PATH_DOCUMENT_LATEST(docId)),
        method: 'GET',
        token,
      }),
    getSnapshot: (serverUrl, token, docId, revision) =>
      requestJson<SnapshotResponse>(transport, {
        url: joinUrl(serverUrl, API_PATH_SNAPSHOT(docId, revision)),
        method: 'GET',
        token,
      }),
    listSnapshots: (serverUrl, token, docId, limit) =>
      requestJson<SnapshotListResponse>(transport, {
        url: `${joinUrl(serverUrl, API_PATH_SNAPSHOTS(docId))}?limit=${limit}`,
        method: 'GET',
        token,
      }),
  }
}

/** Strips whitespace and trailing slashes; empty string passes through. */
export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function joinUrl(serverUrl: string, path: string): string {
  return normalizeServerUrl(serverUrl) + path
}

function isRemoteError(e: unknown): e is RemoteError {
  return typeof e === 'object' && e !== null && typeof (e as RemoteError).kind === 'string'
}

function tryParseErrorEnvelope(text: string): { code: string; message: string } | null {
  try {
    const parsed = JSON.parse(text) as Partial<ErrorEnvelope> | null
    const err = parsed?.error
    if (typeof err?.code === 'string' && typeof err?.message === 'string') {
      return { code: err.code, message: err.message }
    }
    return null
  } catch {
    return null
  }
}

interface RequestOptions {
  url: string
  method: 'GET' | 'POST'
  body?: unknown
  token?: string
}

async function requestJson<T>(transport: Transport, opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.token !== undefined) {
    headers.Authorization = `${BEARER_PREFIX} ${opts.token}`
  }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  let res
  try {
    res = await transport(opts.url, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      timeoutMs: REMOTE_REQUEST_TIMEOUT_MS,
    })
  } catch (e) {
    if (isRemoteError(e)) {
      throw e
    }
    throw { kind: 'invalidResponse', message: String(e) } satisfies RemoteError
  }

  if (res.status < 200 || res.status >= 300) {
    const envelope = tryParseErrorEnvelope(res.bodyText)
    if (envelope) {
      throw { kind: 'api', status: res.status, code: envelope.code, message: envelope.message } as const
    }
    throw {
      kind: 'unexpectedStatus',
      status: res.status,
      bodyPreview: res.bodyText.slice(0, UNEXPECTED_BODY_PREVIEW_MAX_LEN),
    } as const
  }

  try {
    return JSON.parse(res.bodyText) as T
  } catch {
    throw { kind: 'invalidResponse', message: 'response body is not valid JSON' } as const
  }
}
