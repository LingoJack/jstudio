import test from 'node:test'
import assert from 'node:assert/strict'

import { createRemoteClient, normalizeServerUrl } from './client'
import type {
  Transport,
  TransportRequest,
  TransportResponse,
  RemoteError,
} from './types'
import { isAuthRejected, remoteErrorMessage } from './types'

/** 可编程假传输：按注册的 (method, url) 返回预设响应或拒绝值。 */
function fakeTransport(
  table: Record<string, TransportResponse | RemoteError>,
): { transport: Transport; calls: TransportRequest[] } {
  const calls: TransportRequest[] = []
  const transport: Transport = (url, req) => {
    calls.push(req)
    const key = `${req.method} ${url}`
    const hit = table[key]
    if (hit === undefined) {
      return Promise.reject(new Error(`unexpected request: ${key}`))
    }
    if ('kind' in hit) {
      return Promise.reject(hit)
    }
    return Promise.resolve(hit)
  }
  return { transport, calls }
}

const okJson = (body: unknown): TransportResponse => ({
  status: 200,
  bodyText: JSON.stringify(body),
})

test('login posts credentials and parses the token', async () => {
  const { transport, calls } = fakeTransport({
    'POST http://s/api/v1/auth/login': okJson({
      token: 't0',
      token_type: 'Bearer',
      expires_at: '2026-01-01T00:00:00Z',
      user: { user_id: 'u1', username: 'alice' },
    }),
  })
  const client = createRemoteClient(transport)
  const res = await client.login('http://s/', 'alice', 'pw')
  assert.equal(res.token, 't0')
  assert.equal(res.user.username, 'alice')
  const req = calls[0]
  assert.equal(req.method, 'POST')
  assert.equal(req.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(req.body ?? ''), { username: 'alice', password: 'pw' })
})

test('authed requests carry the bearer token', async () => {
  const { transport, calls } = fakeTransport({
    'GET http://s/api/v1/documents': okJson({ documents: [] }),
  })
  const client = createRemoteClient(transport)
  await client.listDocuments('http://s', 'tok')
  assert.equal(calls[0].headers.Authorization, 'Bearer tok')
})

test('snapshots url encodes the docId and carries the limit', async () => {
  const { transport, calls } = fakeTransport({
    'GET http://s/api/v1/documents/a%2Fb/snapshots?limit=50': okJson({ snapshots: [], total: 0 }),
  })
  const client = createRemoteClient(transport)
  await client.listSnapshots('http://s', 'tok', 'a/b', 50)
  assert.equal(calls.length, 1)
})

test('error envelope becomes an api error', async () => {
  const { transport } = fakeTransport({
    'POST http://s/api/v1/auth/login': {
      status: 401,
      bodyText: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'bad credentials' } }),
    },
  })
  const client = createRemoteClient(transport)
  await assert.rejects(client.login('http://s', 'a', 'b'), (e: unknown) => {
    const err = e as RemoteError
    assert.equal(err.kind, 'api')
    assert.equal(err.status, 401)
    assert.equal(err.code, 'UNAUTHORIZED')
    assert.ok(isAuthRejected(err))
    return true
  })
})

test('non-json 2xx body becomes an invalidResponse error', async () => {
  const { transport } = fakeTransport({
    'GET http://s/api/v1/auth/me': { status: 200, bodyText: 'not json' },
  })
  const client = createRemoteClient(transport)
  await assert.rejects(client.me('http://s', 't'), (e: unknown) => {
    const err = e as RemoteError
    assert.equal(err.kind, 'invalidResponse')
    assert.ok(remoteErrorMessage(err).length > 0)
    return true
  })
})

test('transport network error passes through unchanged', async () => {
  const network: RemoteError = { kind: 'network', message: 'server unreachable' }
  const { transport } = fakeTransport({ 'GET http://s/api/v1/documents': network })
  const client = createRemoteClient(transport)
  await assert.rejects(client.listDocuments('http://s', 't'), (e: unknown) => {
    assert.equal((e as RemoteError).kind, 'network')
    return true
  })
})

test('normalizeServerUrl strips trailing slashes and whitespace', () => {
  assert.equal(normalizeServerUrl('  http://s/ '), 'http://s')
  assert.equal(normalizeServerUrl('http://s///'), 'http://s')
  assert.equal(normalizeServerUrl(''), '')
})
