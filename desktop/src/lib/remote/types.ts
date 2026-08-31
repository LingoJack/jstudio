import {
  API_ERROR_CODE_TOKEN_EXPIRED,
  API_ERROR_CODE_UNAUTHORIZED,
  HTTP_STATUS_UNAUTHORIZED,
} from './constants';

/** Authenticated identity as reported by the backend. */
export interface AuthUser {
  user_id: string;
  username: string;
}

/** POST /auth/register 201 response. */
export interface RegisterResponse {
  user_id: string;
  username: string;
  created_at: string;
}

/** POST /auth/login 200 response. */
export interface LoginResponse {
  token: string;
  /** Always "Bearer". */
  token_type: string;
  /** RFC3339 expiry timestamp. */
  expires_at: string;
  user: AuthUser;
}

/** GET /auth/me 200 response. */
export type MeResponse = AuthUser;

/**
 * Discriminated union covering every failure mode of the remote client:
 * - network:          fetch rejected (TypeError = unreachable, AbortError =
 *                     timeout) — the server never answered.
 * - api:              non-2xx response carrying the unified error envelope.
 * - unexpectedStatus: non-2xx without a parsable envelope (e.g. a reverse
 *                     proxy HTML error page).
 * - invalidResponse:  2xx whose body failed to parse as the expected DTO.
 */
export type RemoteError =
  | { kind: 'network'; message: string }
  | { kind: 'api'; status: number; code: string; message: string }
  | { kind: 'unexpectedStatus'; status: number; bodyPreview: string }
  | { kind: 'invalidResponse'; message: string };

/** True when the server was unreachable or the request timed out. */
export function isNetworkError(e: RemoteError): boolean {
  return e.kind === 'network';
}

/** True when the backend rejected the token as expired or outright invalid. */
export function isAuthRejected(e: RemoteError): boolean {
  return (
    e.kind === 'api' &&
    e.status === HTTP_STATUS_UNAUTHORIZED &&
    (e.code === API_ERROR_CODE_UNAUTHORIZED || e.code === API_ERROR_CODE_TOKEN_EXPIRED)
  );
}
