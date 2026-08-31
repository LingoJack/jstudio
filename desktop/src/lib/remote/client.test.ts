import assert from 'node:assert/strict';
import test from 'node:test';

import { createRemoteClient, normalizeServerUrl } from './client';
import { API_BASE_PATH } from './constants';
import type { RemoteError } from './types';

const SERVER = 'http://127.0.0.1:8080';

interface CapturedRequest {
  url: string;
  init: RequestInit;
}

/** Builds a stub fetch that records the last request and replies with body. */
function stubFetch(
  status: number,
  body: string,
  contentType = 'application/json',
): { impl: typeof fetch; getCaptured: () => CapturedRequest | null } {
  let captured: CapturedRequest | null = null;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = { url: String(input), init: init ?? {} };
    return new Response(body, { status, headers: { 'Content-Type': contentType } });
  }) as typeof fetch;
  return { impl, getCaptured: () => captured };
}

/** Builds a stub fetch whose transport rejects like a broken connection. */
function rejectingFetch(error: unknown): typeof fetch {
  return (async () => {
    throw error;
  }) as typeof fetch;
}

async function captureError(p: Promise<unknown>): Promise<RemoteError> {
  try {
    await p;
  } catch (e) {
    return e as RemoteError;
  }
  throw new Error('expected the call to reject');
}

test('login posts credentials as JSON and parses the DTO', async () => {
  const stub = stubFetch(
    200,
    JSON.stringify({
      token: 'tok',
      token_type: 'Bearer',
      expires_at: '2026-10-01T00:00:00Z',
      user: { user_id: 'u1', username: 'jack' },
    }),
  );
  const client = createRemoteClient(stub.impl);
  const resp = await client.login(SERVER, 'jack', 'pw-123456');

  assert.equal(resp.token, 'tok');
  assert.equal(resp.user.username, 'jack');
  const captured = stub.getCaptured();
  assert.ok(captured, 'request was issued');
  assert.equal(captured.url, `${SERVER}${API_BASE_PATH}/auth/login`);
  assert.equal(captured.init.method, 'POST');
  const headers = captured.init.headers as Record<string, string>;
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(String(captured.init.body)), { username: 'jack', password: 'pw-123456' });
});

test('me sends the bearer token on a bodyless GET', async () => {
  const stub = stubFetch(200, JSON.stringify({ user_id: 'u1', username: 'jack' }));
  const client = createRemoteClient(stub.impl);
  const resp = await client.me(SERVER, 'tok-123');

  assert.equal(resp.user_id, 'u1');
  const captured = stub.getCaptured();
  assert.ok(captured);
  assert.equal(captured.url, `${SERVER}${API_BASE_PATH}/auth/me`);
  assert.equal(captured.init.method, 'GET');
  const headers = captured.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer tok-123');
  assert.equal(headers['Content-Type'], undefined);
  assert.equal(captured.init.body, undefined);
});

test('non-2xx envelope responses become api errors', async () => {
  const stub = stubFetch(
    401,
    JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'invalid credentials' } }),
  );
  const client = createRemoteClient(stub.impl);
  const e = await captureError(client.login(SERVER, 'jack', 'wrong'));
  assert.deepEqual(e, {
    kind: 'api',
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'invalid credentials',
  });
});

test('transport rejection becomes a network error', async () => {
  const client = createRemoteClient(rejectingFetch(new TypeError('fetch failed')));
  const e = await captureError(client.login(SERVER, 'jack', 'pw-123456'));
  assert.equal(e.kind, 'network');
});

test('abort rejection becomes a network error', async () => {
  const client = createRemoteClient(
    rejectingFetch(new DOMException('aborted', 'AbortError')),
  );
  const e = await captureError(client.me(SERVER, 'tok'));
  assert.equal(e.kind, 'network');
});

test('non-envelope 500 becomes unexpectedStatus with truncated preview', async () => {
  const htmlBody = '<html>' + 'a'.repeat(400) + '</html>';
  const stub = stubFetch(500, htmlBody, 'text/html');
  const client = createRemoteClient(stub.impl);
  const e = await captureError(client.login(SERVER, 'jack', 'pw-123456'));
  assert.equal(e.kind, 'unexpectedStatus');
  if (e.kind !== 'unexpectedStatus') {
    throw new Error('unreachable');
  }
  assert.equal(e.status, 500);
  assert.equal(e.bodyPreview.length, 200);
  assert.ok(e.bodyPreview.startsWith('<html>aaaa'));
});

test('2xx with unparsable body becomes invalidResponse', async () => {
  const stub = stubFetch(200, 'not-json');
  const client = createRemoteClient(stub.impl);
  const e = await captureError(client.login(SERVER, 'jack', 'pw-123456'));
  assert.equal(e.kind, 'invalidResponse');
});

test('normalizeServerUrl strips whitespace and trailing slashes', () => {
  assert.equal(normalizeServerUrl(' http://a.b:8080/ '), 'http://a.b:8080');
  assert.equal(normalizeServerUrl('http://a.b:8080///'), 'http://a.b:8080');
  assert.equal(normalizeServerUrl(''), '');
});
