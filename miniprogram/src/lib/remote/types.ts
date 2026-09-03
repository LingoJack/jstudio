import {
  API_ERROR_CODE_TOKEN_EXPIRED,
  API_ERROR_CODE_UNAUTHORIZED,
  HTTP_STATUS_UNAUTHORIZED,
} from './constants'

/** Authenticated identity as reported by the backend. */
export interface AuthUser {
  user_id: string
  username: string
}

/** POST /auth/register 201 response. */
export interface RegisterResponse {
  user_id: string
  username: string
  created_at: string
}

/** POST /auth/login 200 response. */
export interface LoginResponse {
  token: string
  /** Always "Bearer". */
  token_type: string
  /** RFC3339 expiry timestamp. */
  expires_at: string
  user: AuthUser
}

/** GET /auth/me 200 response. */
export type MeResponse = AuthUser

/** GET /documents 列表项。 */
export interface DocumentMeta {
  doc_id: string
  title: string
  latest_revision: number
  updated_at: string
}

/** GET /documents 响应。 */
export interface DocumentListResponse {
  documents: DocumentMeta[]
}

/** 单个快照响应（GET /documents/{id} 与 /documents/{id}/snapshots/{rev}）。
 *  body 为任意 JSON 原样透传，解析见 lib/blocks/snapshot.ts。 */
export interface SnapshotResponse {
  doc_id: string
  title: string
  revision: number
  body: unknown
  size_bytes: number
  created_at: string
}

/** 快照列表项。 */
export interface SnapshotMeta {
  revision: number
  title: string
  size_bytes: number
  created_at: string
}

/** GET /documents/{id}/snapshots 响应。 */
export interface SnapshotListResponse {
  snapshots: SnapshotMeta[]
  total: number
}

/**
 * Discriminated union covering every failure mode of the remote client:
 * - network:          transport rejected（超时 / 服务器不可达）——服务器从未应答。
 * - api:              非 2xx 响应携带统一错误信封。
 * - unexpectedStatus: 非 2xx 且无信封（如反代返回 HTML 错误页）。
 * - invalidResponse:  2xx 但响应体不是预期的 JSON。
 */
export type RemoteError =
  | { kind: 'network'; message: string }
  | { kind: 'api'; status: number; code: string; message: string }
  | { kind: 'unexpectedStatus'; status: number; bodyPreview: string }
  | { kind: 'invalidResponse'; message: string }

/** True when the server was unreachable or the request timed out. */
export function isNetworkError(e: RemoteError): boolean {
  return e.kind === 'network'
}

/** True when the backend rejected the token as expired or outright invalid. */
export function isAuthRejected(e: RemoteError): boolean {
  return (
    e.kind === 'api' &&
    e.status === HTTP_STATUS_UNAUTHORIZED &&
    (e.code === API_ERROR_CODE_UNAUTHORIZED || e.code === API_ERROR_CODE_TOKEN_EXPIRED)
  )
}

/** 面向用户的错误文案（登录表单 / toast 用）。 */
export function remoteErrorMessage(e: RemoteError): string {
  switch (e.kind) {
    case 'network':
      return '网络不可用或服务器无响应'
    case 'api':
      return e.message
    case 'unexpectedStatus':
      return `服务器返回异常状态 ${e.status}`
    case 'invalidResponse':
      return '服务器响应格式异常'
  }
}

// ---------------------------------------------------------------------------
// 传输层抽象（纯类型，无 Taro 依赖 —— client.ts 与 Node 测试都只依赖这里）
// ---------------------------------------------------------------------------

/** 传输层请求描述（与具体运行时解耦，Node 测试注入假实现）。 */
export interface TransportRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers: Record<string, string>
  /** 已序列化的 JSON 字符串；GET 为空。 */
  body?: string
  timeoutMs: number
}

/** 传输层响应：HTTP 状态码 + 原始响应体文本。 */
export interface TransportResponse {
  status: number
  bodyText: string
}

/** 传输函数签名。client.ts 只依赖这个抽象，测试里用假实现替换。 */
export type Transport = (url: string, req: TransportRequest) => Promise<TransportResponse>

/** 网络层失败的统一拒绝值（不抛裸 Error）。 */
export function networkError(message: string): RemoteError {
  return { kind: 'network', message }
}
