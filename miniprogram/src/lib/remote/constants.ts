/** Remote backend API paths (v1). Appended to the normalized server base URL.
 *  与 desktop/src/lib/remote/constants.ts 同源，改动需双向同步。 */
export const API_BASE_PATH = '/api/v1'
export const API_PATH_AUTH_REGISTER = `${API_BASE_PATH}/auth/register`
export const API_PATH_AUTH_LOGIN = `${API_BASE_PATH}/auth/login`
export const API_PATH_AUTH_ME = `${API_BASE_PATH}/auth/me`
export const API_PATH_DOCUMENTS = `${API_BASE_PATH}/documents`
export const API_PATH_DOCUMENT_LATEST = (docId: string) =>
  `${API_BASE_PATH}/documents/${encodeURIComponent(docId)}`
export const API_PATH_SNAPSHOT = (docId: string, revision: number) =>
  `${API_BASE_PATH}/documents/${encodeURIComponent(docId)}/snapshots/${revision}`
export const API_PATH_SNAPSHOTS = (docId: string) =>
  `${API_BASE_PATH}/documents/${encodeURIComponent(docId)}/snapshots`
/** 资产下载（需 Bearer header，走 Taro.downloadFile 而非 <Image> src）。 */
export const API_PATH_ASSET = (docId: string, fileName: string) =>
  `${API_BASE_PATH}/documents/${encodeURIComponent(docId)}/assets/${encodeURIComponent(fileName)}`

/** Timeout for remote API calls (ms). */
export const REMOTE_REQUEST_TIMEOUT_MS = 10_000

/** Authorization header scheme prefix. */
export const BEARER_PREFIX = 'Bearer'

/** HTTP status used by the backend for auth rejections. */
export const HTTP_STATUS_UNAUTHORIZED = 401

/** Backend error codes from the unified envelope {"error":{"code","message"}}. */
export const API_ERROR_CODE_INVALID_REQUEST = 'INVALID_REQUEST'
export const API_ERROR_CODE_UNAUTHORIZED = 'UNAUTHORIZED'
export const API_ERROR_CODE_TOKEN_EXPIRED = 'TOKEN_EXPIRED'
export const API_ERROR_CODE_NOT_FOUND = 'NOT_FOUND'
export const API_ERROR_CODE_CONFLICT = 'CONFLICT'
export const API_ERROR_CODE_PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE'
export const API_ERROR_CODE_INTERNAL = 'INTERNAL'
