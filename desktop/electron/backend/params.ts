/**
 * params.ts — camelCase param extraction for the Node sidecar.
 *
 * Mirrors sidecar.rs's `take`: params arrive as the same camelCase object
 * the renderer sends; a missing required key is an error (the Rust side
 * sees serde's "invalid type: null" there — text differs slightly, the
 * reject-on-error semantics are what the contract requires).
 */

import type { Params } from "./protocol";

function bad(key: string, expected: string, got: unknown): Error {
  const gotDesc =
    got === null
      ? "null"
      : Array.isArray(got)
        ? "an array"
        : typeof got;
  return new Error(`bad param '${key}': expected ${expected}, got ${gotDesc}`);
}

export function takeString(params: Params, key: string): string {
  const v = params[key];
  if (typeof v !== "string") throw bad(key, "a string", v ?? null);
  return v;
}

export function takeOptString(params: Params, key: string): string | undefined {
  const v = params[key];
  if (v == null) return undefined;
  if (typeof v !== "string") throw bad(key, "a string", v);
  return v;
}

export function takeNumber(params: Params, key: string): number {
  const v = params[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw bad(key, "a number", v ?? null);
  return v;
}

export function takeBoolean(params: Params, key: string): boolean {
  const v = params[key];
  if (typeof v !== "boolean") throw bad(key, "a boolean", v ?? null);
  return v;
}

export function takeObject<T extends object = Record<string, unknown>>(
  params: Params,
  key: string,
): T {
  const v = params[key];
  if (v == null || typeof v !== "object" || Array.isArray(v)) {
    throw bad(key, "an object", v ?? null);
  }
  return v as T;
}

export function takeArray<T = unknown>(params: Params, key: string): T[] {
  const v = params[key];
  if (!Array.isArray(v)) throw bad(key, "an array", v ?? null);
  return v as T[];
}

/** Unknown extra keys are ignored — same as the Rust side (serde struct). */
export function takeRaw(params: Params, key: string): unknown {
  return params[key] ?? null;
}
